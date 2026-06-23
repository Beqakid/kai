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
import { cleanupRateLimits } from './services/security';

const VOICE_PREFIX = '/api/kai/voice';
const TASK_PREFIX = '/api/kai/tasks';
const ORCH_PREFIX = '/api/kai/orchestrator';
const RECEIPT_PATH = '/api/kai/action-receipts';
const PENDING_PREFIX = '/api/kai/actions';

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

    // Method exists but wrong HTTP method
    if (path.startsWith(VOICE_PREFIX) || path.startsWith(TASK_PREFIX)
        || path.startsWith(ORCH_PREFIX) || path === RECEIPT_PATH
        || path.startsWith(PENDING_PREFIX)) {
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
