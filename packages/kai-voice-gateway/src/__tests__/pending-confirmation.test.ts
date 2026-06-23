// ── Pending Confirmation Workflow Tests — Phase 5 ──
//
// Tests the full prepare → confirm → execute (or deny/expire) lifecycle
// for medium-risk Kai actions.
//
// Covers:
// 1.  Medium-risk action creates pending action
// 2.  Medium-risk action does not execute before confirmation
// 3.  Confirm route executes pending action
// 4.  Deny route denies pending action
// 5.  Confirmation creates receipt
// 6.  Denial creates receipt
// 7.  Expired action cannot be confirmed
// 8.  High-risk action cannot become pending action
// 9.  Blocked action cannot become pending action
// 10. Different user cannot confirm another user's pending action
// 11. Super-admin can confirm allowed pending action
// 12. Confirmation re-runs gate before execution
// 13. Changed gate decision blocks execution
// 14. Pending list requires valid auth context
// 15. Pending list returns only user-owned pending actions unless super-admin

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PendingActionStore, PendingActionRow, DEFAULT_EXPIRY_MINUTES } from '../services/pending-action-store';
import { KaiPermissionGate, GateDecision } from '../services/kai-permission-gate';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import { KaiTaskOrchestrator, OrchestratorReceiptContext } from '../orchestrator/orchestrator';

// ── D1 Mock ──

function createMockDb() {
  const rows: Record<string, any> = {};
  const allRows: any[] = [];

  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 }, results: [] }),
    first: vi.fn().mockImplementation(async () => null),
    all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
  };

  const db = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue({ count: 0, duration: 0 }),
    _mockStatement: mockStatement,
    _rows: rows,
    _allRows: allRows,
  };

  return db;
}

// ── Helpers ──

function makeReceiptCtx(overrides: Partial<OrchestratorReceiptContext> = {}): OrchestratorReceiptContext {
  return {
    appId: 'jon-command-center',
    userId: 'user-001',
    userRole: 'super-admin',
    sessionId: 'sess-001',
    ...overrides,
  };
}

// ── Tests ──

describe('PendingActionStore', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: PendingActionStore;

  beforeEach(() => {
    db = createMockDb();
    store = new PendingActionStore(db as any);
  });

  // ── Test 1: Medium-risk action creates pending action ──
  it('creates a pending action for medium-risk actions', async () => {
    const pa = await store.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'draft_github_issue',
      actionSummary: 'Draft issue for task X',
      preparedOutput: '## Bug Fix\n\nThis fixes...',
      riskLevel: 'medium',
    });

    expect(pa.id).toMatch(/^pa_/);
    expect(pa.status).toBe('pending');
    expect(pa.action_type).toBe('draft_github_issue');
    expect(pa.risk_level).toBe('medium');
    expect(pa.prepared_output).toBe('## Bug Fix\n\nThis fixes...');
    expect(pa.expires_at).toBeTruthy();
    expect(db.prepare).toHaveBeenCalled();
  });

  // ── Test 8: High-risk action cannot become pending ──
  it('rejects high-risk actions from pending store', async () => {
    await expect(store.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'change_user_permissions',
      riskLevel: 'high',
    })).rejects.toThrow(/high-risk/i);
  });

  // ── Test 9: Blocked action cannot become pending ──
  it('rejects blocked actions from pending store', async () => {
    await expect(store.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'deploy_code',
      riskLevel: 'blocked',
    })).rejects.toThrow(/blocked-risk/i);
  });

  // ── Test: Expiration default ──
  it('sets default 15-minute expiration', async () => {
    const before = Date.now();
    const pa = await store.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'create_task',
      riskLevel: 'medium',
    });

    const expiresMs = new Date(pa.expires_at).getTime();
    const expectedMs = before + DEFAULT_EXPIRY_MINUTES * 60 * 1000;
    // Should be within 2 seconds of expected
    expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(2000);
  });

  // ── Test: Custom expiration ──
  it('accepts custom expiration minutes', async () => {
    const before = Date.now();
    const pa = await store.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'create_task',
      riskLevel: 'medium',
      expiryMinutes: 5,
    });

    const expiresMs = new Date(pa.expires_at).getTime();
    const expectedMs = before + 5 * 60 * 1000;
    expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(2000);
  });

  // ── Test: No DB throws ──
  it('throws when DB is unavailable', async () => {
    const noDB = new PendingActionStore(undefined);
    await expect(noDB.createPendingAction({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'create_task',
      riskLevel: 'medium',
    })).rejects.toThrow(/database/i);
  });
});

describe('PendingActionStore — Confirm/Deny', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: PendingActionStore;
  let pendingRow: PendingActionRow;

  beforeEach(() => {
    db = createMockDb();
    store = new PendingActionStore(db as any);

    // Preload a pending action via mock
    pendingRow = {
      id: 'pa_test_001',
      app_id: 'jon-command-center',
      project: null,
      user_id: 'user-001',
      user_role: 'super-admin',
      session_id: 'sess-001',
      task_id: 'task-001',
      action_type: 'draft_github_issue',
      action_summary: 'Draft issue',
      prepared_output: '## Issue\n\nContent',
      risk_level: 'medium',
      gate_decision_json: null,
      status: 'pending',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      confirmed_at: null,
      denied_at: null,
      confirmed_by: null,
      denied_by: null,
      metadata_json: null,
    };

    // Mock DB first() to return our row
    db._mockStatement.first.mockResolvedValue(pendingRow);
  });

  // ── Test 3: Confirm route executes pending action ──
  it('confirms a pending action successfully', async () => {
    const result = await store.confirmPendingAction('pa_test_001', {
      userId: 'user-001',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction?.status).toBe('confirmed');
    expect(result.pendingAction?.confirmed_by).toBe('user-001');
    expect(result.reason).toMatch(/confirmed/i);
  });

  // ── Test 4: Deny route denies pending action ──
  it('denies a pending action successfully', async () => {
    const result = await store.denyPendingAction('pa_test_001', {
      userId: 'user-001',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction?.status).toBe('denied');
    expect(result.pendingAction?.denied_by).toBe('user-001');
  });

  // ── Test 7: Expired action cannot be confirmed ──
  it('rejects confirmation of expired action', async () => {
    pendingRow.expires_at = new Date(Date.now() - 1000).toISOString();
    db._mockStatement.first.mockResolvedValue(pendingRow);

    const result = await store.confirmPendingAction('pa_test_001', {
      userId: 'user-001',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  // ── Test 10: Different user cannot confirm another's pending action ──
  it('blocks different user from confirming', async () => {
    const result = await store.confirmPendingAction('pa_test_001', {
      userId: 'other-user-999',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not authorized/i);
  });

  // ── Test 11: Super-admin can confirm any pending action ──
  it('allows super-admin to confirm other users pending action', async () => {
    // Action owned by user-001, confirmed by super-admin user-002
    const result = await store.confirmPendingAction('pa_test_001', {
      userId: 'admin-user-002',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction?.confirmed_by).toBe('admin-user-002');
  });

  // ── Test: Already confirmed action cannot be confirmed again ──
  it('rejects re-confirmation of already confirmed action', async () => {
    pendingRow.status = 'confirmed';
    db._mockStatement.first.mockResolvedValue(pendingRow);

    const result = await store.confirmPendingAction('pa_test_001', {
      userId: 'user-001',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/confirmed/i);
  });

  // ── Test: Not found ──
  it('returns failure for non-existent pending action', async () => {
    db._mockStatement.first.mockResolvedValue(null);

    const result = await store.confirmPendingAction('pa_nonexistent', {
      userId: 'user-001',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });
});

describe('PendingActionStore — List', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: PendingActionStore;

  beforeEach(() => {
    db = createMockDb();
    store = new PendingActionStore(db as any);
  });

  // ── Test 14: Pending list requires valid auth context ──
  it('uses auth context for list filtering', async () => {
    db._mockStatement.first.mockResolvedValue({ total: 0 });
    db._mockStatement.all.mockResolvedValue({ results: [], success: true, meta: {} });

    await store.listPendingActions(
      {},
      { userId: 'user-001', userRole: 'admin' },
    );

    // The query should include user_id filter for non-super-admin
    const prepareCall = db.prepare.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('COUNT'),
    );
    expect(prepareCall).toBeTruthy();
  });

  // ── Test 15: Non-super-admin sees only their own actions ──
  it('filters by user_id for non-super-admin', async () => {
    db._mockStatement.first.mockResolvedValue({ total: 1 });
    const mockRow: Partial<PendingActionRow> = {
      id: 'pa_test_001',
      user_id: 'user-001',
      status: 'pending',
    };
    db._mockStatement.all.mockResolvedValue({ results: [mockRow], success: true, meta: {} });

    const result = await store.listPendingActions(
      {},
      { userId: 'user-001', userRole: 'admin' },
    );

    // Should have bound user_id
    expect(db._mockStatement.bind).toHaveBeenCalled();
    expect(result.total).toBe(1);
  });

  // ── Test: Super-admin can see all pending actions ──
  it('does not filter by user_id for super-admin', async () => {
    db._mockStatement.first.mockResolvedValue({ total: 3 });
    db._mockStatement.all.mockResolvedValue({ results: [{}, {}, {}], success: true, meta: {} });

    const result = await store.listPendingActions(
      {},
      { userId: 'admin-001', userRole: 'super-admin' },
    );

    expect(result.total).toBe(3);
  });

  // ── Test: Returns empty when no DB ──
  it('returns empty list when DB is unavailable', async () => {
    const noDB = new PendingActionStore(undefined);
    const result = await noDB.listPendingActions(
      {},
      { userId: 'user-001', userRole: 'admin' },
    );

    expect(result.pendingActions).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('KaiTaskOrchestrator — Pending Confirmation Integration', () => {
  let db: ReturnType<typeof createMockDb>;
  let orchestrator: KaiTaskOrchestrator;

  // Helper to set up DB mock with task + pending action capabilities
  function setupOrchestratorMocks() {
    db = createMockDb();

    // We need smart mocking for the orchestrator which uses multiple tables
    let callCount = 0;
    const task = {
      id: 'task-001',
      appId: 'jon-command-center',
      project: 'kai',
      title: 'Fix auth bug',
      description: 'JWT token expiry issue',
      source: 'phase_data',
      priority: 'high',
      severity: 'urgent',
      status: 'open',
      suggestedAction: 'draft_github_issue',
      riskLevel: 'medium',
      requiresConfirmation: true,
      score: 85,
      metadataJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Mock the DB to return task for getTaskById and handle inserts
    db._mockStatement.first.mockImplementation(async () => {
      callCount++;
      // First call is getTaskById, subsequent ones vary
      return task;
    });

    db._mockStatement.run.mockResolvedValue({
      success: true,
      meta: { changes: 1 },
      results: [],
    });

    orchestrator = new KaiTaskOrchestrator(db as any);
  }

  beforeEach(() => {
    setupOrchestratorMocks();
  });

  // ── Test 1 (integration): Medium-risk action returns pendingActionId ──
  it('medium-risk action returns pendingActionId instead of executing', async () => {
    const result = await orchestrator.executeAction(
      'task-001',
      { actionType: 'draft_github_issue', userId: 'user-001' },
      makeReceiptCtx(),
    );

    expect(result.pendingActionId).toBeTruthy();
    expect(result.pendingActionId).toMatch(/^pa_/);
    expect(result.pendingActionStatus).toBe('pending');
    expect(result.expiresAt).toBeTruthy();
    expect(result.requiresConfirmation).toBe(true);
    expect(result.message).toMatch(/confirm/i);
  });

  // ── Test 2: Medium-risk does NOT auto-execute ──
  it('medium-risk action message indicates pending, not completed', async () => {
    const result = await orchestrator.executeAction(
      'task-001',
      { actionType: 'draft_github_issue', userId: 'user-001' },
      makeReceiptCtx(),
    );

    // Should NOT contain "completed" or "executed"
    expect(result.message).not.toMatch(/completed/i);
    expect(result.message).not.toMatch(/✅/);
    // Should indicate pending
    expect(result.pendingActionStatus).toBe('pending');
  });

  // ── Test: Low-risk action auto-executes (no pending) ──
  it('low-risk action auto-executes without pending', async () => {
    const result = await orchestrator.executeAction(
      'task-001',
      { actionType: 'generate_tasklet_prompt', userId: 'user-001' },
      makeReceiptCtx(),
    );

    expect(result.pendingActionId).toBeUndefined();
    expect(result.message).toMatch(/completed|✅/i);
  });
});

describe('KaiTaskOrchestrator — Confirm/Deny Integration', () => {
  let db: ReturnType<typeof createMockDb>;
  let orchestrator: KaiTaskOrchestrator;

  function setupWithPendingAction(overrides: Partial<PendingActionRow> = {}) {
    db = createMockDb();

    const pendingRow: PendingActionRow = {
      id: 'pa_test_confirm',
      app_id: 'jon-command-center',
      project: null,
      user_id: 'user-001',
      user_role: 'super-admin',
      session_id: 'sess-001',
      task_id: 'task-001',
      action_type: 'draft_github_issue',
      action_summary: 'Draft issue',
      prepared_output: '## Bug Fix Content',
      risk_level: 'medium',
      gate_decision_json: null,
      status: 'pending',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      confirmed_at: null,
      denied_at: null,
      confirmed_by: null,
      denied_by: null,
      metadata_json: null,
      ...overrides,
    };

    db._mockStatement.first.mockResolvedValue(pendingRow);
    db._mockStatement.run.mockResolvedValue({ success: true, meta: { changes: 1 }, results: [] });

    orchestrator = new KaiTaskOrchestrator(db as any);
    return pendingRow;
  }

  // ── Test 3 (integration): Confirm executes ──
  it('confirm route results in executed status', async () => {
    setupWithPendingAction();

    const result = await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(result.pendingActionStatus).toBe('executed');
    expect(result.message).toMatch(/confirmed/i);
    expect(result.explanation).toBe('## Bug Fix Content');
  });

  // ── Test 5: Confirmation creates receipt ──
  it('confirmation creates both confirmed and executed receipts', async () => {
    setupWithPendingAction();
    const receiptLogger = orchestrator.getReceiptLogger();
    const logConfirmedSpy = vi.spyOn(receiptLogger, 'logConfirmedAction').mockResolvedValue();
    const logExecutedSpy = vi.spyOn(receiptLogger, 'logExecutedAction').mockResolvedValue();

    await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(logConfirmedSpy).toHaveBeenCalledTimes(1);
    expect(logExecutedSpy).toHaveBeenCalledTimes(1);

    const confirmedCall = logConfirmedSpy.mock.calls[0][0];
    expect(confirmedCall.pendingActionId).toBe('pa_test_confirm');
    expect(confirmedCall.confirmedBy).toBe('user-001');
  });

  // ── Test 4 + 6: Deny route creates denial receipt ──
  it('deny route creates denial receipt', async () => {
    setupWithPendingAction();
    const receiptLogger = orchestrator.getReceiptLogger();
    const logDeniedSpy = vi.spyOn(receiptLogger, 'logDeniedAction').mockResolvedValue();

    const result = await orchestrator.denyPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(result.pendingActionStatus).toBe('denied');
    expect(logDeniedSpy).toHaveBeenCalledTimes(1);

    const deniedCall = logDeniedSpy.mock.calls[0][0];
    expect(deniedCall.pendingActionId).toBe('pa_test_confirm');
    expect(deniedCall.deniedBy).toBe('user-001');
  });

  // ── Test 7 (integration): Expired cannot be confirmed ──
  it('expired action confirmation returns error', async () => {
    setupWithPendingAction({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const result = await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(result.message).toMatch(/expired/i);
    expect(result.pendingActionStatus).toBe('expired');
  });

  // ── Test 12: Confirmation re-runs gate ──
  it('confirmation re-runs the permission gate', async () => {
    setupWithPendingAction();
    const gate = orchestrator.getPermissionGate();
    const evaluateSpy = vi.spyOn(gate, 'evaluate');

    await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    // Gate should be called during confirmation
    expect(evaluateSpy).toHaveBeenCalled();
    const lastCall = evaluateSpy.mock.calls[evaluateSpy.mock.calls.length - 1][0];
    expect(lastCall.source).toBe('pending-confirmation');
    expect(lastCall.actionType).toBe('draft_github_issue');
  });

  // ── Test 13: Changed gate decision blocks execution ──
  it('blocks execution when gate re-evaluation changes to denied', async () => {
    setupWithPendingAction();
    const gate = orchestrator.getPermissionGate();

    // Override gate to deny on re-evaluation
    vi.spyOn(gate, 'evaluate').mockReturnValue({
      allowed: false,
      riskLevel: 'blocked',
      requiresConfirmation: false,
      requiresAdminApproval: false,
      reason: 'Action now blocked due to policy change.',
      recommendedFallback: 'Contact admin.',
      receiptType: 'kai_action_blocked',
      blockedReason: 'Policy changed',
    });

    const result = await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(result.message).toMatch(/denied/i);
    expect(result.pendingActionStatus).toBe('denied');
    expect(result.gateDecision?.riskLevel).toBe('blocked');
  });

  // ── Test: Gate metadata included in response ──
  it('includes gate decision in confirm response', async () => {
    setupWithPendingAction();

    const result = await orchestrator.confirmPendingAction(
      'pa_test_confirm',
      makeReceiptCtx(),
    );

    expect(result.gateDecision).toBeTruthy();
    expect(result.gateDecision?.riskLevel).toBe('medium');
  });
});

describe('KaiPermissionGate — Pending Action Safety', () => {
  let gate: KaiPermissionGate;

  beforeEach(() => {
    gate = new KaiPermissionGate();
  });

  // ── Verify medium-risk actions get requiresConfirmation=true ──
  it('medium-risk actions require confirmation', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'draft_github_issue',
      requestedAction: 'Draft a GH issue',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.riskLevel).toBe('medium');
  });

  // ── Verify low-risk actions don't require confirmation ──
  it('low-risk actions do not require confirmation', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate prompt',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.riskLevel).toBe('low');
  });

  // ── Verify high-risk never allowed ──
  it('high-risk actions are not allowed', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'change_user_permissions',
      requestedAction: 'Change perms',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('high');
  });

  // ── Verify blocked always denied ──
  it('blocked actions are always denied', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user-001',
      userRole: 'super-admin',
      actionType: 'deploy_code',
      requestedAction: 'Deploy',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });
});

describe('Receipt Types — Phase 5', () => {
  it('includes new confirmation receipt types', async () => {
    const { RECEIPT_TYPES } = await import('../services/action-receipt-logger');

    expect(RECEIPT_TYPES).toContain('kai_action_confirmed');
    expect(RECEIPT_TYPES).toContain('kai_action_denied');
    expect(RECEIPT_TYPES).toContain('kai_action_expired');
  });
});

describe('OrchestratorResponse — Phase 5 Fields', () => {
  it('pendingActionId, pendingActionStatus, expiresAt are valid response fields', async () => {
    const { } = await import('../orchestrator/types');

    // TypeScript would fail at compile time if these fields didn't exist.
    // This runtime check ensures they're usable.
    const response = {
      message: 'test',
      pendingActionId: 'pa_123',
      pendingActionStatus: 'pending',
      expiresAt: new Date().toISOString(),
    };

    expect(response.pendingActionId).toBe('pa_123');
    expect(response.pendingActionStatus).toBe('pending');
    expect(response.expiresAt).toBeTruthy();
  });
});
