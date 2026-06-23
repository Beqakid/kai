// ── ProofTrust Bridge — Phase 7 Tests ──
//
// 14 test cases covering:
// 1. ProofTrustBridgeLite can create receipt through ActionReceiptLogger
// 2. ProofTrustBridgeLite evaluateAction mirrors gate decision
// 3. blocked action maps to ai_action_blocked receipt
// 4. prepared action maps to ai_action_prepared receipt
// 5. confirmed action maps to ai_action_confirmed receipt
// 6. denied action maps to ai_action_denied receipt
// 7. expired action maps to ai_action_expired receipt
// 8. executed action maps to ai_action_executed receipt
// 9. status route requires super-admin
// 10. evaluate route requires super-admin
// 11. bridge does not execute actions
// 12. bridge does not override gate
// 13. no Carehia-specific logic is hardcoded
// 14. metadata does not store tokens, secrets, raw audio, or private documents

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProofTrustBridgeLite, PROOFTRUST_BRIDGE_VERSION } from '../prooftrust/prooftrust-bridge';
import {
  PROOFTRUST_RECEIPT_TYPES,
  PROOFTRUST_RISK_LEVELS,
  KAI_TO_PROOFTRUST_RECEIPT_MAP,
  mapKaiRiskToProofTrust,
  mapKaiGateDecisionToProofTrust,
  sanitizeProofTrustMetadata,
} from '../prooftrust/types';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import { KaiPermissionGate } from '../services/kai-permission-gate';
import { handleRequest } from '../router';

// ── Helpers ──

function createMockDb() {
  const rows: any[] = [];
  return {
    rows,
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockImplementation(async () => {
          rows.push({ inserted: true });
          return { meta: { changes: 1 } };
        }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
      }),
    }),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue({ count: 0, duration: 0 }),
  } as any;
}

function createBridge(db?: any) {
  const mockDb = db || createMockDb();
  const receiptLogger = new ActionReceiptLogger(mockDb);
  const gate = new KaiPermissionGate(receiptLogger);
  const bridge = new ProofTrustBridgeLite(receiptLogger, gate);
  gate.setProofTrustBridge(bridge);
  return { bridge, receiptLogger, gate, mockDb };
}

function createJWT(payload: Record<string, unknown>, secret = 'test-secret'): Promise<string> {
  // Simple HMAC-SHA256 JWT for testing
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const data = `${header}.${body}`;

  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  ).then(key =>
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)),
  ).then(sig => {
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${data}.${sigB64}`;
  });
}

async function makeAuthedRequest(
  path: string,
  method: string,
  body?: unknown,
  role = 'super-admin',
) {
  const now = Math.floor(Date.now() / 1000);
  const token = await createJWT({
    sub: 'test-user-001',
    appId: 'jon-command-center',
    userRole: role,
    iat: now,
    exp: now + 3600,
  });

  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new Request(`https://kai.test${path}`, init);
}

// ── Tests ──

describe('ProofTrust Bridge Types', () => {
  it('maps Kai risk levels to ProofTrust risk levels', () => {
    expect(mapKaiRiskToProofTrust('low')).toBe('low');
    expect(mapKaiRiskToProofTrust('safe')).toBe('low');
    expect(mapKaiRiskToProofTrust('medium')).toBe('medium');
    expect(mapKaiRiskToProofTrust('high')).toBe('high');
    expect(mapKaiRiskToProofTrust('blocked')).toBe('blocked');
    expect(mapKaiRiskToProofTrust('unknown')).toBe('medium');
  });

  it('maps Kai gate decisions to ProofTrust decisions', () => {
    expect(mapKaiGateDecisionToProofTrust({
      allowed: true, requiresConfirmation: false, requiresAdminApproval: false, riskLevel: 'low',
    })).toBe('allow');

    expect(mapKaiGateDecisionToProofTrust({
      allowed: true, requiresConfirmation: true, requiresAdminApproval: false, riskLevel: 'medium',
    })).toBe('requiresConfirmation');

    expect(mapKaiGateDecisionToProofTrust({
      allowed: false, requiresConfirmation: false, requiresAdminApproval: true, riskLevel: 'high',
    })).toBe('requiresAdminApproval');

    expect(mapKaiGateDecisionToProofTrust({
      allowed: false, requiresConfirmation: false, requiresAdminApproval: false, riskLevel: 'blocked',
    })).toBe('deny');
  });

  it('receipt type mappings cover all Kai receipt types', () => {
    const kaiTypes = [
      'kai_recommendation_generated', 'kai_action_prepared', 'kai_action_confirmed',
      'kai_action_denied', 'kai_action_expired', 'kai_action_executed',
      'kai_action_blocked', 'kai_risk_warning', 'kai_explanation_generated',
      'kai_task_status_changed', 'kai_tasklet_prompt_generated',
      'kai_blocker_summary_generated', 'kai_admin_note_drafted',
      'kai_user_message_drafted', 'kai_github_issue_drafted',
      'kai_escalated_to_admin',
    ];

    for (const kaiType of kaiTypes) {
      expect(KAI_TO_PROOFTRUST_RECEIPT_MAP[kaiType]).toBeDefined();
    }
  });
});

describe('ProofTrustBridgeLite', () => {
  let bridge: ProofTrustBridgeLite;
  let receiptLogger: ActionReceiptLogger;
  let gate: KaiPermissionGate;
  let mockDb: any;

  beforeEach(() => {
    const setup = createBridge();
    bridge = setup.bridge;
    receiptLogger = setup.receiptLogger;
    gate = setup.gate;
    mockDb = setup.mockDb;
  });

  // Test 1: Can create receipt through ActionReceiptLogger
  it('creates receipt through ActionReceiptLogger', async () => {
    await bridge.createReceipt({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'Generated tasklet prompt',
      source: 'test',
      riskLevel: 'low',
      decision: 'allow',
      reason: 'Low risk action',
      requiresConfirmation: false,
      requiresAdminApproval: false,
      receiptType: 'ai_action_executed',
    });

    // Verify the DB was called (receipt was inserted)
    expect(mockDb.prepare).toHaveBeenCalled();
    expect(mockDb.rows.length).toBeGreaterThan(0);
  });

  // Test 2: evaluateAction mirrors gate decision
  it('evaluateAction mirrors gate decision for low-risk action', () => {
    const result = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      riskLevel: 'low',
      source: 'test',
    });

    expect(result.decision).toBe('allow');
    expect(result.riskLevel).toBe('low');
    expect(result.requiresConfirmation).toBe(false);
    expect(result.requiresAdminApproval).toBe(false);
    expect(result.bridgeMode).toBe('lite');
  });

  it('evaluateAction mirrors gate decision for medium-risk action', () => {
    const result = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'draft_github_issue',
      riskLevel: 'medium',
      source: 'test',
    });

    expect(result.decision).toBe('requiresConfirmation');
    expect(result.riskLevel).toBe('medium');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('evaluateAction mirrors gate decision for blocked action', () => {
    const result = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'deploy_code',
      riskLevel: 'blocked',
      source: 'test',
    });

    expect(result.decision).toBe('deny');
    expect(result.riskLevel).toBe('blocked');
    expect(result.requiresConfirmation).toBe(false);
  });

  // Test 3: blocked action maps to ai_action_blocked receipt
  it('recordBlockedAction maps to ai_action_blocked receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordBlockedAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'deploy_code',
      riskLevel: 'blocked',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_blocked');
  });

  // Test 4: prepared action maps to ai_action_prepared receipt
  it('recordPreparedAction maps to ai_action_prepared receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordPreparedAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'draft_github_issue',
      riskLevel: 'medium',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_prepared');
  });

  // Test 5: confirmed action maps to ai_action_confirmed receipt
  it('recordConfirmedAction maps to ai_action_confirmed receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordConfirmedAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'draft_github_issue',
      riskLevel: 'medium',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_confirmed');
  });

  // Test 6: denied action maps to ai_action_denied receipt
  it('recordDeniedAction maps to ai_action_denied receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordDeniedAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'draft_github_issue',
      riskLevel: 'medium',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_denied');
  });

  // Test 7: expired action maps to ai_action_expired receipt
  it('recordExpiredAction maps to ai_action_expired receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordExpiredAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'draft_github_issue',
      riskLevel: 'medium',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_expired');
  });

  // Test 8: executed action maps to ai_action_executed receipt
  it('recordExecutedAction maps to ai_action_executed receipt', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logProofTrustReceipt');

    await bridge.recordExecutedAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      riskLevel: 'low',
      source: 'test',
    });

    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[0][0];
    expect(call.metadata?.proofTrustReceiptType).toBe('ai_action_executed');
  });

  // Test 11: bridge does not execute actions
  it('bridge does not execute actions', () => {
    // The bridge has no execute method — it only records and evaluates.
    // Verify there's no method that could execute an action.
    const bridgeMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(bridge),
    );

    // Should NOT have executeAction, runAction, performAction, etc.
    const executionMethods = bridgeMethods.filter(m =>
      /^(execute|run|perform|invoke)(Action|Task|Command)?$/i.test(m),
    );
    expect(executionMethods).toEqual([]);
  });

  // Test 12: bridge does not override gate
  it('bridge does not override gate decision', () => {
    // Gate says blocked → bridge must also say deny
    const blockedResult = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'deploy_code',
      riskLevel: 'blocked',
      source: 'test',
    });
    expect(blockedResult.decision).toBe('deny');

    // Gate says high-risk → bridge must also deny
    const highResult = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'change_user_permissions',
      riskLevel: 'high',
      source: 'test',
    });
    expect(highResult.decision).toBe('requiresAdminApproval');

    // requireApproval can tighten but not loosen
    const approvalResult = bridge.requireApproval({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'deploy_code',
      actionSummary: 'Deploy code',
      riskLevel: 'blocked',
      reason: 'Test reason',
    });
    // Blocked by gate — bridge cannot loosen to "allow"
    expect(approvalResult.decision).toBe('deny');
  });

  // Test 13: no Carehia-specific logic is hardcoded
  it('has no Carehia-specific logic hardcoded', () => {
    // Read the source files and verify no app-specific logic
    const sourceCode = [
      ProofTrustBridgeLite.toString(),
    ].join('\n');

    // Should not contain app-specific business rules
    expect(sourceCode).not.toContain('carehia_');
    expect(sourceCode).not.toContain('viliniu_');
    expect(sourceCode).not.toContain('volau_');

    // The bridge types are generic
    expect(PROOFTRUST_RECEIPT_TYPES).not.toContain('carehia_specific');
    expect(PROOFTRUST_RISK_LEVELS).not.toContain('carehia_risk');

    // The bridge itself is app-agnostic — it always delegates to the gate.
    // Different apps may get different gate results (because the gate has
    // per-app permissions), but the bridge adds no app-specific logic on top.
    const jccResult = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      riskLevel: 'low',
      source: 'test',
    });

    const carehiaResult = bridge.evaluateAction({
      appId: 'carehia',
      actorId: 'user-001',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      riskLevel: 'low',
      source: 'test',
    });

    // Both use the same bridge mode — bridge adds no app-specific behavior
    expect(jccResult.bridgeMode).toBe(carehiaResult.bridgeMode);
    expect(jccResult.bridgeMode).toBe('lite');
    // Both return a valid ProofTrust decision shape
    expect(['allow', 'deny', 'requiresConfirmation', 'requiresAdminApproval']).toContain(jccResult.decision);
    expect(['allow', 'deny', 'requiresConfirmation', 'requiresAdminApproval']).toContain(carehiaResult.decision);
  });

  // Test 14: metadata does not store tokens, secrets, raw audio, or private documents
  it('sanitizes forbidden keys from metadata', () => {
    const dirty = {
      normal_field: 'ok',
      token: 'secret-jwt-value',
      secret: 'my-secret',
      password: 'hunter2',
      apiKey: 'sk-12345',
      api_key: 'key-67890',
      accessToken: 'at-abc',
      access_token: 'at-def',
      refreshToken: 'rt-ghi',
      refresh_token: 'rt-jkl',
      rawAudio: '<binary>',
      raw_audio: '<binary>',
      audioData: '<binary>',
      audio_data: '<binary>',
      privateDocument: '<doc>',
      private_document: '<doc>',
      ssn: '123-45-6789',
      creditCard: '4111111111111111',
      credit_card: '4111111111111111',
      bankAccount: '123456789',
      bank_account: '123456789',
      safe_info: 'this stays',
    };

    const sanitized = sanitizeProofTrustMetadata(dirty);

    expect(sanitized).toBeDefined();
    expect(sanitized!.normal_field).toBe('ok');
    expect(sanitized!.safe_info).toBe('this stays');

    // All forbidden keys should be removed
    expect(sanitized!.token).toBeUndefined();
    expect(sanitized!.secret).toBeUndefined();
    expect(sanitized!.password).toBeUndefined();
    expect(sanitized!.apiKey).toBeUndefined();
    expect(sanitized!.api_key).toBeUndefined();
    expect(sanitized!.accessToken).toBeUndefined();
    expect(sanitized!.rawAudio).toBeUndefined();
    expect(sanitized!.privateDocument).toBeUndefined();
    expect(sanitized!.ssn).toBeUndefined();
    expect(sanitized!.creditCard).toBeUndefined();
    expect(sanitized!.bankAccount).toBeUndefined();
  });

  it('sanitizeProofTrustMetadata handles undefined input', () => {
    expect(sanitizeProofTrustMetadata(undefined)).toBeUndefined();
  });

  // getTrustStatus
  it('getTrustStatus returns correct bridge status', () => {
    const status = bridge.getTrustStatus();

    expect(status.bridgeMode).toBe('lite');
    expect(status.engineConnected).toBe(false);
    expect(status.receiptBackend).toBe('kai_action_receipts');
    expect(status.supportedApps).toContain('jon-command-center');
    expect(status.supportedApps).toContain('carehia');
    expect(status.supportedApps).toContain('viliniu');
    expect(status.supportedApps).toContain('volau');
    expect(status.supportedReceiptTypes).toEqual(PROOFTRUST_RECEIPT_TYPES);
    expect(status.supportedRiskLevels).toEqual(PROOFTRUST_RISK_LEVELS);
    expect(status.proofTrustBridgeVersion).toBe(PROOFTRUST_BRIDGE_VERSION);
    expect(status.note).toContain('ProofTrustBridgeLite is active');
    expect(status.note).toContain('not connected yet');
  });
});

// ── Route Tests ──

describe('ProofTrust Routes', () => {
  const env = {
    KAI_STT_PROVIDER: 'mock',
    KAI_TTS_PROVIDER: 'mock',
    KAI_CORE_PROVIDER: 'mock',
    ENABLE_KAI_AUDIO_STORAGE: 'false',
    KAI_AUTH_SECRET: 'test-secret',
    KAI_DB: createMockDb(),
  };

  // Test 9: status route requires super-admin
  it('GET /api/kai/prooftrust/status rejects non-admin', async () => {
    const req = await makeAuthedRequest('/api/kai/prooftrust/status', 'GET', undefined, 'viewer');
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(403);
  });

  it('GET /api/kai/prooftrust/status returns status for super-admin', async () => {
    const req = await makeAuthedRequest('/api/kai/prooftrust/status', 'GET');
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.bridgeMode).toBe('lite');
    expect(data.engineConnected).toBe(false);
    expect(data.receiptBackend).toBe('kai_action_receipts');
    expect(data.proofTrustBridgeVersion).toBeDefined();
    expect(data.supportedApps).toBeInstanceOf(Array);
    expect(data.supportedReceiptTypes).toBeInstanceOf(Array);
    expect(data.supportedRiskLevels).toBeInstanceOf(Array);
    expect(data.note).toContain('ProofTrustBridgeLite');
  });

  // Test 10: evaluate route requires super-admin
  it('POST /api/kai/prooftrust/evaluate rejects non-admin', async () => {
    const req = await makeAuthedRequest(
      '/api/kai/prooftrust/evaluate',
      'POST',
      { appId: 'jon-command-center', actionType: 'generate_tasklet_prompt', actorRole: 'super-admin', riskLevel: 'low' },
      'viewer',
    );
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(403);
  });

  it('POST /api/kai/prooftrust/evaluate returns evaluation for super-admin', async () => {
    const req = await makeAuthedRequest(
      '/api/kai/prooftrust/evaluate',
      'POST',
      {
        appId: 'jon-command-center',
        actionType: 'generate_tasklet_prompt',
        actorRole: 'super-admin',
        riskLevel: 'low',
      },
    );
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.decision).toBeDefined();
    expect(data.riskLevel).toBeDefined();
    expect(data.requiresConfirmation).toBeDefined();
    expect(data.requiresAdminApproval).toBeDefined();
    expect(data.reason).toBeDefined();
    expect(data.bridgeMode).toBe('lite');
  });

  it('POST /api/kai/prooftrust/evaluate rejects missing fields', async () => {
    const req = await makeAuthedRequest(
      '/api/kai/prooftrust/evaluate',
      'POST',
      { appId: 'jon-command-center' }, // missing actionType, actorRole, riskLevel
    );
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(400);
  });

  it('POST /api/kai/prooftrust/evaluate returns deny for blocked actions', async () => {
    const req = await makeAuthedRequest(
      '/api/kai/prooftrust/evaluate',
      'POST',
      {
        appId: 'jon-command-center',
        actionType: 'deploy_code',
        actorRole: 'super-admin',
        riskLevel: 'blocked',
      },
    );
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.decision).toBe('deny');
    expect(data.riskLevel).toBe('blocked');
  });

  it('POST /api/kai/prooftrust/evaluate returns requiresConfirmation for medium-risk', async () => {
    const req = await makeAuthedRequest(
      '/api/kai/prooftrust/evaluate',
      'POST',
      {
        appId: 'jon-command-center',
        actionType: 'draft_github_issue',
        actorRole: 'super-admin',
        riskLevel: 'medium',
      },
    );
    const res = await handleRequest(req, env as any);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.decision).toBe('requiresConfirmation');
    expect(data.requiresConfirmation).toBe(true);
  });
});

// ── Gate Integration Tests ──

describe('KaiPermissionGate + ProofTrust Integration', () => {
  it('gate enrichment adds ProofTrust metadata', () => {
    const { bridge, gate } = createBridge();

    const gateInput = {
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate tasklet prompt',
      source: 'test',
    };

    const decision = gate.evaluate(gateInput);
    const ptMeta = gate.enrichWithProofTrust(gateInput, decision);

    expect(ptMeta).toBeDefined();
    expect(ptMeta!.proofTrustDecision).toBe('allow');
    expect(ptMeta!.proofTrustRiskLevel).toBe('low');
    expect(ptMeta!.proofTrustBridgeMode).toBe('lite');
    expect(ptMeta!.proofTrustBridgeVersion).toBe(PROOFTRUST_BRIDGE_VERSION);
  });

  it('gate without bridge returns undefined enrichment', () => {
    const receiptLogger = new ActionReceiptLogger(undefined);
    const gate = new KaiPermissionGate(receiptLogger);
    // No bridge attached

    const gateInput = {
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'test',
      source: 'test',
    };

    const decision = gate.evaluate(gateInput);
    const ptMeta = gate.enrichWithProofTrust(gateInput, decision);

    expect(ptMeta).toBeUndefined();
  });
});
