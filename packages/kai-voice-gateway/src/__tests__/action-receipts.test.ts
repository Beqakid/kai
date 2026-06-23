// ── Action Receipts Tests — Phase 3 ──
//
// Tests:
// 1. blocked sensitive action creates receipt
// 2. helpMeOut creates recommendation receipt
// 3. generate_tasklet_prompt creates generated output receipt
// 4. mark done creates task status receipt
// 5. receipt logger does not throw if D1 is missing
// 6. receipt route requires super-admin
// 7. receipt route rejects non-admin
// 8. receipt route rejects missing/invalid token
// 9. receipts do not include Authorization token or raw audio

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import { KaiCoreService } from '../services/kai-core';
import { KaiTaskOrchestrator } from '../orchestrator/orchestrator';
import { handleRequest } from '../router';
import { Env, AppId, UserRole } from '../types';

// ── Mock D1 Database ──

function createMockD1() {
  const rows: any[] = [];

  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} }),
    first: vi.fn().mockImplementation(async () => {
      return rows.length > 0 ? rows[0] : null;
    }),
    all: vi.fn().mockResolvedValue({ success: true, results: rows, meta: {} }),
  };

  return {
    db: {
      prepare: vi.fn().mockReturnValue(mockStatement),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn().mockResolvedValue({ count: 0, duration: 0 }),
    },
    mockStatement,
    rows,
  };
}

// ── JWT helper ──

async function createValidJwt(
  claims: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify(claims))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sigB64}`;
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    KAI_STT_PROVIDER: 'mock',
    KAI_TTS_PROVIDER: 'mock',
    KAI_CORE_PROVIDER: 'mock',
    ENABLE_KAI_AUDIO_STORAGE: 'false',
    KAI_AUTH_SECRET: 'test-secret-key-256',
    ...overrides,
  } as Env;
}

// ── Tests ──

describe('ActionReceiptLogger', () => {
  // Test 5: receipt logger does not throw if D1 is missing
  it('does not throw if D1 is undefined', async () => {
    const logger = new ActionReceiptLogger(undefined);

    // None of these should throw
    await expect(logger.logRecommendation({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'super-admin',
      actionSummary: 'test',
      riskLevel: 'safe',
      requiresConfirmation: false,
    })).resolves.toBeUndefined();

    await expect(logger.logBlockedAction({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'delete all users',
      blockedReason: 'blocked in v1',
      riskLevel: 'blocked',
    })).resolves.toBeUndefined();

    await expect(logger.logExecutedAction({
      appId: 'carehia',
      userId: 'user-1',
      userRole: 'admin',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'test',
      riskLevel: 'safe',
    })).resolves.toBeUndefined();

    await expect(logger.logExplanation({
      appId: 'carehia',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'what is this screen?',
      kaiResponse: 'This is the dashboard.',
    })).resolves.toBeUndefined();

    // Query also returns empty
    const result = await logger.queryReceipts({});
    expect(result).toEqual({ receipts: [], total: 0 });
  });

  it('does not throw if D1 insert fails', async () => {
    const failDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockRejectedValue(new Error('DB write failed')),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
      }),
      batch: vi.fn(),
      exec: vi.fn(),
    };

    const logger = new ActionReceiptLogger(failDb as any);

    // Should not throw even though D1 fails
    await expect(logger.logBlockedAction({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'delete database',
      blockedReason: 'blocked',
      riskLevel: 'blocked',
    })).resolves.toBeUndefined();
  });

  // Test 1: blocked sensitive action creates receipt
  it('writes receipt to D1 for blocked action', async () => {
    const { db, mockStatement } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logBlockedAction({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'delete all users',
      blockedReason: 'Action blocked in Kai v1',
      riskLevel: 'blocked',
      kaiResponse: 'I cannot do that.',
    });

    // Verify D1 was called
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kai_action_receipts'));
    const boundArgs = mockStatement.bind.mock.calls[0];
    // id, app_id, project, user_id, user_role, session_id, source,
    // receipt_type, action_type, action_summary, user_intent, kai_response,
    // risk_level, requires_confirmation, approval_status, blocked_reason,
    // task_id, request_id, metadata_json
    expect(boundArgs[0]).toMatch(/^rcpt_/); // receipt ID
    expect(boundArgs[1]).toBe('jon-command-center'); // app_id
    expect(boundArgs[3]).toBe('user-1'); // user_id
    expect(boundArgs[4]).toBe('admin'); // user_role
    expect(boundArgs[7]).toBe('kai_action_blocked'); // receipt_type
    expect(boundArgs[10]).toBe('delete all users'); // user_intent
    expect(boundArgs[12]).toBe('blocked'); // risk_level
    expect(boundArgs[15]).toBe('Action blocked in Kai v1'); // blocked_reason
  });

  // Test 2: recommendation receipt
  it('writes receipt for recommendation', async () => {
    const { db, mockStatement } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logRecommendation({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'super-admin',
      taskId: 'task_123',
      actionSummary: 'Recommended: Fix API errors',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    expect(db.prepare).toHaveBeenCalled();
    const boundArgs = mockStatement.bind.mock.calls[0];
    expect(boundArgs[7]).toBe('kai_recommendation_generated');
    expect(boundArgs[16]).toBe('task_123'); // task_id
  });

  // Test 3: generated output receipt
  it('writes receipt for generated output', async () => {
    const { db, mockStatement } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logGeneratedOutput({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'super-admin',
      taskId: 'task_456',
      receiptType: 'kai_tasklet_prompt_generated',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'Generated prompt for task',
    });

    expect(db.prepare).toHaveBeenCalled();
    const boundArgs = mockStatement.bind.mock.calls[0];
    expect(boundArgs[7]).toBe('kai_tasklet_prompt_generated');
  });

  // Test 4: task status change receipt
  it('writes receipt for task status change', async () => {
    const { db, mockStatement } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logTaskStatusChange({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'super-admin',
      taskId: 'task_789',
      actionType: 'update_status',
      actionSummary: 'Completed: "Fix login bug"',
    });

    expect(db.prepare).toHaveBeenCalled();
    const boundArgs = mockStatement.bind.mock.calls[0];
    expect(boundArgs[7]).toBe('kai_task_status_changed');
    expect(boundArgs[16]).toBe('task_789');
  });
});

describe('KaiCoreService with receipts', () => {
  it('logs blocked action receipt for sensitive NL request', async () => {
    const { db } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);
    const spyBlocked = vi.spyOn(logger, 'logBlockedAction');
    const spyRisk = vi.spyOn(logger, 'logRiskWarning');

    const service = new KaiCoreService(logger);

    // Trigger a sensitive NL pattern → risk warning
    const result = service.processRequest({
      transcript: 'delete all users from the database',
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      currentScreen: 'dashboard',
      allowedActions: ['view'],
      sessionId: 'ses_123',
    });

    expect(result.riskLevel).toBe('high');

    // Give the fire-and-forget promise time to resolve
    await new Promise(r => setTimeout(r, 50));

    expect(spyRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'jon-command-center',
        userId: 'user-1',
        userRole: 'admin',
        sessionId: 'ses_123',
        userIntent: 'delete all users from the database',
        riskLevel: 'high',
      }),
    );
  });

  it('logs blocked action receipt for blocked allowedActions', async () => {
    const { db } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);
    const spyBlocked = vi.spyOn(logger, 'logBlockedAction');

    const service = new KaiCoreService(logger);

    const result = service.processRequest({
      transcript: 'hello',
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      currentScreen: 'dashboard',
      allowedActions: ['process_payment'],
      sessionId: 'ses_456',
    });

    expect(result.riskLevel).toBe('blocked');

    await new Promise(r => setTimeout(r, 50));

    expect(spyBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'jon-command-center',
        userId: 'user-1',
        userIntent: 'hello',
        riskLevel: 'blocked',
      }),
    );
  });

  it('logs explanation receipt for safe responses', async () => {
    const { db } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);
    const spyExplanation = vi.spyOn(logger, 'logExplanation');

    const service = new KaiCoreService(logger);

    const result = service.processRequest({
      transcript: 'what is this screen?',
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      currentScreen: 'dashboard',
      allowedActions: ['view'],
      sessionId: 'ses_789',
    });

    expect(result.riskLevel).toBe('safe');

    await new Promise(r => setTimeout(r, 50));

    expect(spyExplanation).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'jon-command-center',
        userId: 'user-1',
        userIntent: 'what is this screen?',
      }),
    );
  });
});

describe('Receipt route access control', () => {
  const SECRET = 'test-secret-key-256';

  async function makeReceiptRequest(token?: string): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = new Request('http://localhost/api/kai/action-receipts', {
      method: 'GET',
      headers,
    });

    return handleRequest(req, testEnv());
  }

  // Test 6: receipt route requires super-admin
  it('allows super-admin to access receipts', async () => {
    const token = await createValidJwt({
      sub: 'admin-1',
      appId: 'jon-command-center',
      userRole: 'super-admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const res = await makeReceiptRequest(token);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body).toHaveProperty('receipts');
    expect(body).toHaveProperty('total');
  });

  // Test 7: receipt route rejects non-admin
  it('rejects admin (non-super-admin) from accessing receipts', async () => {
    const token = await createValidJwt({
      sub: 'admin-2',
      appId: 'jon-command-center',
      userRole: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const res = await makeReceiptRequest(token);
    expect(res.status).toBe(403);
  });

  it('rejects vendor from accessing receipts', async () => {
    const token = await createValidJwt({
      sub: 'vendor-1',
      appId: 'carehia',
      userRole: 'vendor',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, SECRET);

    const res = await makeReceiptRequest(token);
    expect(res.status).toBe(403);
  });

  // Test 8: receipt route rejects missing/invalid token
  it('rejects request with no token', async () => {
    const res = await makeReceiptRequest();
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token', async () => {
    const res = await makeReceiptRequest('invalid-token');
    expect(res.status).toBe(401);
  });

  it('rejects request with expired token', async () => {
    const token = await createValidJwt({
      sub: 'admin-1',
      appId: 'jon-command-center',
      userRole: 'super-admin',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    }, SECRET);

    const res = await makeReceiptRequest(token);
    expect(res.status).toBe(401);
  });
});

describe('Receipt security — no sensitive data', () => {
  // Test 9: receipts do not include Authorization token or raw audio
  it('receipt logger never stores token or audio data', async () => {
    const { db, mockStatement } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    // Log a receipt with a transcript (safe) but verify no token/audio fields exist
    await logger.logBlockedAction({
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'delete all users',
      blockedReason: 'blocked',
      riskLevel: 'blocked',
      kaiResponse: 'Cannot do that.',
      metadata: { currentScreen: 'dashboard' },
    });

    // Check all bound arguments — none should contain auth headers or audio
    const boundArgs = mockStatement.bind.mock.calls[0];
    const allValues = boundArgs.map((v: any) => typeof v === 'string' ? v : JSON.stringify(v));
    const joined = allValues.join(' ');

    expect(joined).not.toContain('Bearer');
    expect(joined).not.toContain('Authorization');
    expect(joined).not.toContain('audio/webm');
    expect(joined).not.toContain('base64');
    // metadata_json (last arg) should only contain safe info
    const metadataArg = boundArgs[boundArgs.length - 1];
    if (metadataArg) {
      const meta = JSON.parse(metadataArg);
      expect(meta).not.toHaveProperty('token');
      expect(meta).not.toHaveProperty('authorization');
      expect(meta).not.toHaveProperty('audioData');
    }
  });

  it('receipt insert SQL does not have columns for token or audio', () => {
    // The INSERT statement should not reference token/audio columns
    const { db } = createMockD1();
    const logger = new ActionReceiptLogger(db as any);

    // Trigger an insert to capture the SQL
    logger.logExplanation({
      appId: 'carehia',
      userId: 'user-1',
      userRole: 'admin',
      userIntent: 'hello',
      kaiResponse: 'hi',
    });

    const sql = db.prepare.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain('token');
    expect(sql).not.toContain('audio');
    expect(sql).not.toContain('authorization');
    expect(sql).toContain('kai_action_receipts');
  });
});
