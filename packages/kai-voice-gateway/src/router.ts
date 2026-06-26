// ── Kai Voice Gateway — Router ──
//
// Phase 5: Added pending action routes (list, confirm, deny).
// Phase 3: Added action receipts API route.
// All routes require auth + rate limiting.
// Includes request timeout handling and rate limit cleanup.

import { Env } from './types';
import { KaiGatewayError, Errors } from './errors';
import { KaiVoiceGateway } from './gateway';
import { KaiTaskOrchestrator, OrchestratorReceiptContext } from './orchestrator/orchestrator';
import { CreateTaskRequest, TaskActionRequest } from './orchestrator/types';
import { authenticateAndRateLimit, requireAdmin, AuthResult } from './auth';
import { validateJsonBodySize } from './services/security';
import { KaiNavigationCore, validateAppId as validateNavAppId, validateRole as validateNavRole, sanitizeNavigationMetadata } from './navigation-core/navigation-core';
import { seedNavigationRegistries } from './navigation-core/registry-seed-service';
import { KaiSupportRequestService, sanitizeSupportMetadata } from './support-layer/support-request-service';
import { KaiSupportedAppId } from './navigation-core/types';

import { cleanupRateLimits } from './services/security';

const VOICE_PREFIX = '/api/kai/voice';
const TASK_PREFIX = '/api/kai/tasks';
const ORCH_PREFIX = '/api/kai/orchestrator';
const RECEIPT_PATH = '/api/kai/action-receipts';
const PENDING_PREFIX = '/api/kai/actions';
const PROOFTRUST_PREFIX = '/api/kai/prooftrust';
const NAVIGATION_PREFIX = '/api/kai/navigation';
const SUPPORT_PREFIX = '/api/kai/support';

/** Request timeout in milliseconds (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Wrap a handler with a timeout.
 * Returns 408 if the handler takes too long.
 */
async function withTimeout(
  handler: () => Promise<Response>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const timeoutPromise = new Promise<Response>((resolve) => {
    setTimeout(() => {
      resolve(Errors.requestTimeout().toResponse());
    }, timeoutMs);
  });

  return Promise.race([handler(), timeoutPromise]);
}

/** JSON response helper with CORS headers */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/** Build receipt context from auth result */
function toReceiptCtx(auth: AuthResult, sessionId?: string): OrchestratorReceiptContext {
  return {
    appId: auth.appId,
    userId: auth.userId,
    userRole: auth.userRole,
    sessionId,
  };
}

/**
 * Route incoming requests to the appropriate gateway method.
 * Handles CORS preflight, error wrapping, and timeout.
 */
export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // Periodic cleanup of expired rate limit entries
  cleanupRateLimits();

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    const gateway = new KaiVoiceGateway(env);

    // ── Route matching (all wrapped with timeout) ──

    if (path === `${VOICE_PREFIX}/session` && request.method === 'POST') {
      return await withTimeout(() => gateway.createSession(request));
    }

    if (path === `${VOICE_PREFIX}/transcribe` && request.method === 'POST') {
      // Transcribe gets a longer timeout (audio processing)
      return await withTimeout(() => gateway.transcribe(request), 60_000);
    }

    if (path === `${VOICE_PREFIX}/respond` && request.method === 'POST') {
      // Respond gets longer timeout (Kai + TTS)
      return await withTimeout(() => gateway.respond(request), 45_000);
    }

    if (path === `${VOICE_PREFIX}/history` && request.method === 'GET') {
      return await withTimeout(() => gateway.getHistory(request));
    }

    // Health check (no auth required)
    if (path === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'kai-voice-gateway',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // ── Task Orchestrator Routes ──

    const orchestrator = new KaiTaskOrchestrator(env.KAI_DB);

    // GET /api/kai/tasks — List tasks (with optional filters)
    if (path === TASK_PREFIX && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const url2 = new URL(request.url);
        const filters = {
          appId: url2.searchParams.get('appId') || undefined,
          status: (url2.searchParams.get('status') as any) || undefined,
          priority: (url2.searchParams.get('priority') as any) || undefined,
          project: url2.searchParams.get('project') || undefined,
        };
        const result = await orchestrator.listTasks(filters);
        return jsonResponse(result);
      });
    }

    // POST /api/kai/tasks — Create a new task
    if (path === TASK_PREFIX && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as CreateTaskRequest;
        if (!body.appId || !body.title) {
          throw Errors.missingField('appId and title are required');
        }
        const result = await orchestrator.createTask(body);
        return jsonResponse(result, 201);
      });
    }

    // POST /api/kai/tasks/prioritize — Re-rank all tasks
    if (path === `${TASK_PREFIX}/prioritize` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const result = await orchestrator.reprioritize();
        return jsonResponse(result);
      });
    }

    // POST /api/kai/tasks/:id/action — Execute action on a task
    const actionMatch = path.match(/^\/api\/kai\/tasks\/([^/]+)\/action$/);
    if (actionMatch && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const taskId = actionMatch[1];
        const body = await request.json() as TaskActionRequest;
        if (!body.actionType || !body.userId) {
          throw Errors.missingField('actionType and userId are required');
        }
        const result = await orchestrator.executeAction(taskId, body, toReceiptCtx(auth));
        return jsonResponse(result);
      });
    }

    // POST /api/kai/orchestrator/help-me-out — Kai selects top task
    if (path === `${ORCH_PREFIX}/help-me-out` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as { userId: string };
        const result = await orchestrator.helpMeOut(
          body.userId || auth.userId,
          toReceiptCtx(auth),
        );
        return jsonResponse(result);
      });
    }

    // POST /api/kai/orchestrator/next — Process follow-up command
    if (path === `${ORCH_PREFIX}/next` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as { userId: string; command: string };
        if (!body.command) {
          throw Errors.missingField('command');
        }
        const result = await orchestrator.doNext(
          body.userId || auth.userId,
          body.command,
          toReceiptCtx(auth),
        );
        return jsonResponse(result);
      });
    }

    // ── GET /api/kai/action-receipts — Super-admin only ──
    if (path === RECEIPT_PATH && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        requireAdmin(auth.userRole);

        const url2 = new URL(request.url);
        const filters = {
          appId: url2.searchParams.get('appId') || undefined,
          userId: url2.searchParams.get('userId') || undefined,
          receiptType: url2.searchParams.get('receiptType') || undefined,
          riskLevel: url2.searchParams.get('riskLevel') || undefined,
          taskId: url2.searchParams.get('taskId') || undefined,
          page: parseInt(url2.searchParams.get('page') || '1', 10),
          pageSize: parseInt(url2.searchParams.get('pageSize') || '20', 10),
        };

        const receiptLogger = orchestrator.getReceiptLogger();
        const result = await receiptLogger.queryReceipts(filters);

        return jsonResponse({
          receipts: result.receipts,
          total: result.total,
          page: filters.page,
          pageSize: Math.min(Math.max(1, filters.pageSize), 100),
        });
      });
    }

    // ── Phase 5: Pending Action Routes ──

    // GET /api/kai/actions/pending — List pending actions for authenticated user
    if (path === `${PENDING_PREFIX}/pending` && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const url2 = new URL(request.url);
        const pendingStore = orchestrator.getPendingStore();

        // Expire overdue actions first
        await pendingStore.expireOldPendingActions();

        const filters = {
          appId: url2.searchParams.get('appId') || undefined,
          userId: url2.searchParams.get('userId') || undefined,
          taskId: url2.searchParams.get('taskId') || undefined,
          status: (url2.searchParams.get('status') as any) || undefined,
          page: parseInt(url2.searchParams.get('page') || '1', 10),
          pageSize: parseInt(url2.searchParams.get('pageSize') || '20', 10),
        };

        const result = await pendingStore.listPendingActions(
          filters,
          { userId: auth.userId, userRole: auth.userRole },
        );

        return jsonResponse({
          pendingActions: result.pendingActions,
          total: result.total,
          page: filters.page,
          pageSize: Math.min(Math.max(1, filters.pageSize || 20), 100),
        });
      });
    }

    // POST /api/kai/actions/:id/confirm — Confirm a pending action
    const confirmMatch = path.match(/^\/api\/kai\/actions\/([^/]+)\/confirm$/);
    if (confirmMatch && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const pendingActionId = confirmMatch[1];

        // Don't match "pending" as an ID
        if (pendingActionId === 'pending') {
          throw Errors.notFound(path);
        }

        const result = await orchestrator.confirmPendingAction(
          pendingActionId,
          toReceiptCtx(auth),
        );
        return jsonResponse(result);
      });
    }

    // POST /api/kai/actions/:id/deny — Deny a pending action
    const denyMatch = path.match(/^\/api\/kai\/actions\/([^/]+)\/deny$/);
    if (denyMatch && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const pendingActionId = denyMatch[1];

        // Don't match "pending" as an ID
        if (pendingActionId === 'pending') {
          throw Errors.notFound(path);
        }

        const result = await orchestrator.denyPendingAction(
          pendingActionId,
          toReceiptCtx(auth),
        );
        return jsonResponse(result);
      });
    }

    // ── Phase 7: ProofTrust Bridge Routes ──

    // GET /api/kai/prooftrust/status — Super-admin only
    if (path === `${PROOFTRUST_PREFIX}/status` && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        requireAdmin(auth.userRole);

        const bridge = orchestrator.getProofTrustBridge();
        const status = bridge.getTrustStatus();
        return jsonResponse(status);
      });
    }

    // POST /api/kai/prooftrust/evaluate — Super-admin only (testing endpoint)
    if (path === `${PROOFTRUST_PREFIX}/evaluate` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        requireAdmin(auth.userRole);

        validateJsonBodySize(request);
        const body = await request.json() as {
          appId: string;
          actionType: string;
          actorRole: string;
          riskLevel: string;
          targetType?: string;
          targetId?: string;
          metadata?: Record<string, unknown>;
        };

        if (!body.appId || !body.actionType || !body.actorRole || !body.riskLevel) {
          throw Errors.missingField('appId, actionType, actorRole, and riskLevel are required');
        }

        const bridge = orchestrator.getProofTrustBridge();
        const result = bridge.evaluateAction({
          appId: body.appId,
          actorId: auth.userId,
          actorRole: body.actorRole,
          actionType: body.actionType,
          riskLevel: body.riskLevel as any,
          targetType: body.targetType,
          targetId: body.targetId,
          metadata: body.metadata,
          source: 'prooftrust-evaluate-api',
        });

        return jsonResponse(result);
      });
    }


    // ── Phase 11: Navigation Core Routes ──

    // GET /api/kai/navigation/apps/:appId/routes — List routes for an app
    const navRoutesMatch = path.match(/^\/api\/kai\/navigation\/apps\/([^/]+)\/routes$/);
    if (navRoutesMatch && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const appId = navRoutesMatch[1];
        const navCore = new KaiNavigationCore();
        const routes = navCore.getRoutesForApp(appId, auth.userRole);
        return jsonResponse({ routes, appId, userRole: auth.userRole });
      });
    }

    // GET /api/kai/navigation/apps/:appId/actions — List actions for an app
    const navActionsMatch = path.match(/^\/api\/kai\/navigation\/apps\/([^/]+)\/actions$/);
    if (navActionsMatch && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const appId = navActionsMatch[1];
        const navCore = new KaiNavigationCore();
        const actions = navCore.getActionsForApp(appId, auth.userRole);
        return jsonResponse({ actions, appId, userRole: auth.userRole });
      });
    }

    // POST /api/kai/navigation/evaluate — Evaluate a navigation request
    if (path === `${NAVIGATION_PREFIX}/evaluate` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as {
          targetRouteKey?: string;
          targetActionKey?: string;
          targetAppId?: string;
          naturalLanguageQuery?: string;
          currentScreen?: string;
        };

        const navCore = new KaiNavigationCore();
        const context = {
          appId: auth.appId as KaiSupportedAppId,
          userId: auth.userId,
          userRole: auth.userRole as any,
          currentScreen: body.currentScreen,
          source: 'api',
        };
        const intent = navCore.resolveNavigationIntent(body);
        const result = navCore.evaluateNavigationRequest(context, intent);

        // Create receipt
        const receipt = navCore.createNavigationReceipt(result, context);

        return jsonResponse({ result, receipt });
      });
    }

    // POST /api/kai/navigation/registries/seed — Super-admin only
    if (path === `${NAVIGATION_PREFIX}/registries/seed` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        requireAdmin(auth.userRole);

        const result = seedNavigationRegistries();

        return jsonResponse({
          success: true,
          ...result,
        });
      });
    }

    // GET /api/kai/navigation/apps/:appId/summary — App registry summary
    const navSummaryMatch = path.match(/^\/api\/kai\/navigation\/apps\/([^/]+)\/summary$/);
    if (navSummaryMatch && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const appId = navSummaryMatch[1];
        const navCore = new KaiNavigationCore();
        const summary = navCore.getAppSummary(appId);
        return jsonResponse({ summary });
      });
    }

    // ── Phase 11: Support Request Routes ──

    // POST /api/kai/support/requests — Create a support request
    if (path === `${SUPPORT_PREFIX}/requests` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as Record<string, unknown>;

        const supportService = new KaiSupportRequestService();
        const result = supportService.createSupportRequest({
          appId: body.appId as string || auth.appId,
          // Token identity is authoritative — never trust body userId/role
          requesterUserId: auth.userId,
          requesterRole: auth.userRole,
          requesterName: body.requesterName as string | undefined,
          requesterEmail: body.requesterEmail as string | undefined,
          requestType: body.requestType as string,
          requestTitle: body.requestTitle as string,
          requestDescription: body.requestDescription as string,
          currentScreen: body.currentScreen as string | undefined,
          relatedRouteKey: body.relatedRouteKey as string | undefined,
          relatedActionKey: body.relatedActionKey as string | undefined,
          urgency: body.urgency as string | undefined,
          source: body.source as string || 'api',
          metadata: sanitizeSupportMetadata(body.metadata as Record<string, unknown> | undefined),
        });

        return jsonResponse(result, 201);
      });
    }

    // GET /api/kai/support/requests — List support requests
    if (path === `${SUPPORT_PREFIX}/requests` && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const supportService = new KaiSupportRequestService();
        const url2 = new URL(request.url);
        const appIdFilter = url2.searchParams.get('appId') || undefined;
        const statusFilter = url2.searchParams.get('status') || undefined;

        let requests;
        if (auth.userRole === 'super-admin') {
          requests = supportService.listAllSupportRequests({ status: statusFilter, appId: appIdFilter });
        } else if (auth.userRole === 'admin') {
          const targetAppId = appIdFilter || auth.appId;
          requests = supportService.listSupportRequestsForApp(targetAppId, { status: statusFilter });
        } else {
          requests = supportService.listSupportRequestsForUser(auth.userId, appIdFilter);
        }

        return jsonResponse({ requests, total: requests.length });
      });
    }

    // GET /api/kai/support/requests/:id — Get a specific support request
    const supportRequestMatch = path.match(/^\/api\/kai\/support\/requests\/([^/]+)$/);
    if (supportRequestMatch && request.method === 'GET') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        const requestId = supportRequestMatch[1];
        const supportService = new KaiSupportRequestService();
        const supportRequest = supportService.getSupportRequest(requestId);

        if (!supportRequest) {
          throw Errors.notFound(`Support request ${requestId}`);
        }

        // Regular users can only see their own requests
        if (auth.userRole !== 'super-admin' && auth.userRole !== 'admin'
            && supportRequest.requesterUserId !== auth.userId) {
          throw Errors.forbidden('You can only view your own support requests.');
        }

        return jsonResponse({ request: supportRequest });
      });
    }

    // POST /api/kai/support/requests/:id/status — Update status
    const supportStatusMatch = path.match(/^\/api\/kai\/support\/requests\/([^/]+)\/status$/);
    if (supportStatusMatch && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const requestId = supportStatusMatch[1];
        const body = await request.json() as { status: string };

        if (!body.status) {
          throw Errors.missingField('status');
        }

        const supportService = new KaiSupportRequestService();
        const result = supportService.updateSupportRequestStatus(
          requestId,
          body.status,
          auth.userRole,
        );

        return jsonResponse(result);
      });
    }

    // Method exists but wrong HTTP method
    if (path.startsWith(VOICE_PREFIX) || path.startsWith(TASK_PREFIX)
        || path.startsWith(ORCH_PREFIX) || path === RECEIPT_PATH
        || path.startsWith(PENDING_PREFIX) || path.startsWith(PROOFTRUST_PREFIX)
        || path.startsWith(NAVIGATION_PREFIX) || path.startsWith(SUPPORT_PREFIX)) {
      throw Errors.methodNotAllowed(request.method);
    }

    // Not a known route
    throw Errors.notFound(path);
  } catch (err) {
    if (err instanceof KaiGatewayError) {
      return err.toResponse();
    }

    // Unexpected error — wrap as gateway failure
    console.error('Unexpected gateway error:', err);
    const wrapped = Errors.gatewayFailure(
      err instanceof Error ? err.message : 'Unknown error',
    );
    return wrapped.toResponse();
  }
}
