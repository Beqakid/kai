// ── Kai Voice Gateway — Router ──
//
// Phase 5: All routes require auth + rate limiting.
// Includes request timeout handling and rate limit cleanup.

import { Env } from './types';
import { KaiGatewayError, Errors } from './errors';
import { KaiVoiceGateway } from './gateway';
import { KaiTaskOrchestrator } from './orchestrator/orchestrator';
import { CreateTaskRequest, TaskActionRequest } from './orchestrator/types';
import { authenticateAndRateLimit } from './auth';
import { validateJsonBodySize } from './services/security';
import { cleanupRateLimits } from './services/security';

const VOICE_PREFIX = '/api/kai/voice';
const TASK_PREFIX = '/api/kai/tasks';
const ORCH_PREFIX = '/api/kai/orchestrator';

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
        const result = await orchestrator.executeAction(taskId, body);
        return jsonResponse(result);
      });
    }

    // POST /api/kai/orchestrator/help-me-out — Kai selects top task
    if (path === `${ORCH_PREFIX}/help-me-out` && request.method === 'POST') {
      return await withTimeout(async () => {
        const auth = await authenticateAndRateLimit(request, env);
        validateJsonBodySize(request);
        const body = await request.json() as { userId: string };
        const result = await orchestrator.helpMeOut(body.userId || auth.userId);
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
        const result = await orchestrator.doNext(body.userId || auth.userId, body.command);
        return jsonResponse(result);
      });
    }

    // Method exists but wrong HTTP method
    if (path.startsWith(VOICE_PREFIX) || path.startsWith(TASK_PREFIX) || path.startsWith(ORCH_PREFIX)) {
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
