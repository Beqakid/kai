// ── Permission Gate Tests — Phase 4 ──
//
// Validates that the KaiPermissionGate correctly:
// 1. Blocks blocked actions
// 2. Blocks unknown actions
// 3. Allows low-risk actions
// 4. Requires confirmation for medium-risk actions
// 5. Requires admin approval for high-risk actions
// 6. Blocked action creates receipt
// 7. Denied unknown action creates receipt
// 8. doNext cannot bypass gate
// 9. executeAction cannot bypass gate
// 10. Client cannot pass unauthorized allowedActions to bypass gate
// 11. Gate uses JWT identity context
// 12. Sensitive natural-language request returns gate-style denial

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KaiPermissionGate,
  BLOCKED_ACTIONS_GATE,
  LOW_RISK_ACTIONS,
  MEDIUM_RISK_ACTIONS,
  HIGH_RISK_ACTIONS,
} from '../services/kai-permission-gate';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import { KaiTaskOrchestrator, OrchestratorReceiptContext } from '../orchestrator/orchestrator';
import { KaiCoreService, KaiCoreContext } from '../services/kai-core';

// ── Mock D1 database ──

function mockD1() {
  const runMock = vi.fn().mockResolvedValue({ success: true });
  const bindMock = vi.fn().mockReturnValue({ run: runMock, first: vi.fn(), all: vi.fn() });
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

  return {
    db: {
      prepare: prepareMock,
      batch: vi.fn(),
      exec: vi.fn(),
    },
    prepareMock,
    bindMock,
    runMock,
  };
}

// ── Mock task store for orchestrator tests ──

function mockTaskForOrchestrator() {
  return {
    id: 'task_test1',
    appId: 'jon-command-center',
    project: 'kai',
    title: 'Test Task',
    description: 'A test task',
    source: 'manual' as const,
    priority: 'medium' as const,
    severity: 'normal' as const,
    status: 'open' as const,
    suggestedAction: 'generate_tasklet_prompt',
    riskLevel: 'low' as const,
    requiresConfirmation: false,
    score: 50,
    metadataJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const defaultReceiptCtx: OrchestratorReceiptContext = {
  appId: 'jon-command-center',
  userId: 'user_123',
  userRole: 'super-admin',
  sessionId: 'sess_test',
};

describe('KaiPermissionGate', () => {
  let gate: KaiPermissionGate;
  let mockDb: ReturnType<typeof mockD1>;
  let receiptLogger: ActionReceiptLogger;

  beforeEach(() => {
    mockDb = mockD1();
    receiptLogger = new ActionReceiptLogger(mockDb.db as any);
    gate = new KaiPermissionGate(receiptLogger);
  });

  // ── Test 1: Blocked action returns allowed=false ──
  it('should block blocked actions', () => {
    for (const action of ['deploy_code', 'delete_user', 'process_payment', 'grant_admin', 'transfer_funds', 'truncate_table']) {
      const decision = gate.evaluate({
        appId: 'jon-command-center',
        userId: 'user_1',
        userRole: 'super-admin',
        actionType: action,
        requestedAction: `Execute: ${action}`,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('blocked');
      expect(decision.receiptType).toBe('kai_action_blocked');
      expect(decision.blockedReason).toContain(action);
    }
  });

  // ── Test 2: Unknown action returns allowed=false ──
  it('should block unknown actions', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      actionType: 'some_random_action_that_does_not_exist',
      requestedAction: 'Execute unknown action',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
    expect(decision.reason).toContain('not recognized');
    expect(decision.blockedReason).toContain('Unknown action');
  });

  // ── Test 3: Low-risk action allowed ──
  it('should allow low-risk actions', () => {
    for (const action of ['generate_tasklet_prompt', 'summarize_blockers', 'draft_admin_note', 'mark_reviewed']) {
      const decision = gate.evaluate({
        appId: 'jon-command-center',
        userId: 'user_1',
        userRole: 'super-admin',
        actionType: action,
        requestedAction: `Execute: ${action}`,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('low');
      expect(decision.requiresConfirmation).toBe(false);
      expect(decision.requiresAdminApproval).toBe(false);
    }
  });

  // ── Test 4: Medium-risk action requires confirmation ──
  it('should require confirmation for medium-risk actions', () => {
    for (const action of ['draft_github_issue', 'draft_user_message', 'update_status', 'create_task']) {
      const decision = gate.evaluate({
        appId: 'jon-command-center',
        userId: 'user_1',
        userRole: 'super-admin',
        actionType: action,
        requestedAction: `Execute: ${action}`,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe('medium');
      expect(decision.requiresConfirmation).toBe(true);
      expect(decision.requiresAdminApproval).toBe(false);
    }
  });

  // ── Test 5: High-risk action requires admin approval ──
  it('should require admin approval and deny high-risk actions', () => {
    for (const action of ['change_user_permissions', 'modify_production_state', 'bulk_update_records']) {
      const decision = gate.evaluate({
        appId: 'jon-command-center',
        userId: 'user_1',
        userRole: 'super-admin',
        actionType: action,
        requestedAction: `Execute: ${action}`,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe('high');
      expect(decision.requiresAdminApproval).toBe(true);
      expect(decision.recommendedFallback).toContain('Manual admin approval');
    }
  });

  // ── Test 6: Blocked action creates receipt ──
  it('should create a receipt for blocked actions', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logBlockedAction');

    gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      actionType: 'deploy_code',
      requestedAction: 'Deploy the code',
      sessionId: 'sess_1',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'jon-command-center',
        userId: 'user_1',
        actionType: 'deploy_code',
        riskLevel: 'blocked',
      }),
    );
  });

  // ── Test 7: Denied unknown action creates receipt ──
  it('should create a receipt for denied unknown actions', async () => {
    const logSpy = vi.spyOn(receiptLogger, 'logBlockedAction');

    gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      actionType: 'totally_made_up_action',
      requestedAction: 'Do something unknown',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        blockedReason: expect.stringContaining('Unknown action'),
      }),
    );
  });

  // ── Test 10: Client cannot pass unauthorized allowedActions to bypass gate ──
  it('should not trust client-provided allowedActions', () => {
    // A viewer trying to execute a task action that requires elevated permissions
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'viewer_1',
      userRole: 'viewer',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate prompt',
      allowedActions: ['generate_tasklet_prompt', 'deploy_code'],
    });

    // Even though client sent allowedActions with generate_tasklet_prompt,
    // the gate checks server-side registry where viewers don't have task actions
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('not permitted for role');
  });

  // ── Test 11: Gate uses JWT identity context ──
  it('should use the provided identity context in decisions', () => {
    // Super-admin should be allowed
    const adminDecision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'admin_1',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate prompt',
    });
    expect(adminDecision.allowed).toBe(true);

    // Viewer should be denied for task actions
    const viewerDecision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'viewer_1',
      userRole: 'viewer',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate prompt',
    });
    expect(viewerDecision.allowed).toBe(false);
    expect(viewerDecision.reason).toContain('viewer');
  });

  // ── Test 12: Sensitive NL request returns gate-style denial ──
  it('should detect sensitive natural-language requests', () => {
    const blocked = gate.evaluateNaturalLanguage({
      transcript: 'delete all users from the database',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
    });

    expect(blocked).not.toBeNull();
    expect(blocked!.allowed).toBe(false);
    expect(blocked!.riskLevel).toBe('blocked');
    expect(blocked!.receiptType).toBe('kai_action_blocked');
  });

  it('should detect high-risk NL requests', () => {
    const highRisk = gate.evaluateNaturalLanguage({
      transcript: 'change user permissions for all vendors',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
    });

    expect(highRisk).not.toBeNull();
    expect(highRisk!.allowed).toBe(false);
    expect(highRisk!.riskLevel).toBe('high');
    expect(highRisk!.requiresAdminApproval).toBe(true);
  });

  it('should not flag safe NL requests', () => {
    const safe = gate.evaluateNaturalLanguage({
      transcript: 'what should I work on today?',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
    });

    expect(safe).toBeNull();
  });

  // ── Gate metadata ──
  it('should produce gate metadata for receipts', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'test',
    });

    const meta = gate.toGateMetadata(decision);
    expect(meta.gateAllowed).toBe(true);
    expect(meta.gateRiskLevel).toBe('low');
    expect(meta.gateRequiresConfirmation).toBe(false);
    expect(meta.gateRequiresAdminApproval).toBe(false);
    expect(typeof meta.gateReason).toBe('string');
  });

  // ── Task risk elevation ──
  it('should elevate low-risk actions to medium when task risk is medium/high', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate prompt',
      taskRiskLevel: 'medium',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('medium');
    expect(decision.requiresConfirmation).toBe(true);
  });
});

// ── Orchestrator integration tests ──

describe('KaiTaskOrchestrator — Gate Integration', () => {
  let orchestrator: KaiTaskOrchestrator;
  let mockDb: ReturnType<typeof mockD1>;

  beforeEach(() => {
    mockDb = mockD1();
    orchestrator = new KaiTaskOrchestrator(mockDb.db as any);
  });

  // ── Test 8: doNext cannot bypass gate ──
  it('doNext should route through the gate for blocked actions', async () => {
    // Mock getTopActionableTask to return a task with a blocked suggested action
    const task = mockTaskForOrchestrator();
    task.suggestedAction = 'deploy_code';

    const store = (orchestrator as any).store;
    vi.spyOn(store, 'getTopActionableTask').mockResolvedValue(task);

    const result = await orchestrator.doNext('user_1', 'go ahead', defaultReceiptCtx);

    // Gate should block deploy_code
    expect(result.message).toContain('⛔');
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.riskLevel).toBe('blocked');
  });

  // ── Test 9: executeAction cannot bypass gate ──
  it('executeAction should route through the gate', async () => {
    const task = mockTaskForOrchestrator();

    const store = (orchestrator as any).store;
    vi.spyOn(store, 'getTaskById').mockResolvedValue(task);

    // Try a blocked action
    const result = await orchestrator.executeAction(
      'task_1',
      { actionType: 'deploy_code' as any, userId: 'user_1' },
      defaultReceiptCtx,
    );

    expect(result.message).toContain('⛔');
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.riskLevel).toBe('blocked');
  });

  it('executeAction should include gate decision for allowed actions', async () => {
    const task = mockTaskForOrchestrator();

    const store = (orchestrator as any).store;
    vi.spyOn(store, 'getTaskById').mockResolvedValue(task);
    vi.spyOn(store, 'logAction').mockResolvedValue({
      id: 'action_1',
      taskId: task.id,
      userId: 'user_1',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'test',
      approvalStatus: 'auto',
      result: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    });

    const result = await orchestrator.executeAction(
      'task_1',
      { actionType: 'generate_tasklet_prompt', userId: 'user_1' },
      defaultReceiptCtx,
    );

    expect(result.message).toContain('✅');
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.riskLevel).toBe('low');
    expect(result.gateDecision!.requiresConfirmation).toBe(false);
  });

  it('doNext with "go ahead" for safe actions goes through gate and executes', async () => {
    const task = mockTaskForOrchestrator();
    task.suggestedAction = 'generate_tasklet_prompt';

    const store = (orchestrator as any).store;
    vi.spyOn(store, 'getTopActionableTask').mockResolvedValue(task);
    vi.spyOn(store, 'getTaskById').mockResolvedValue(task);
    vi.spyOn(store, 'logAction').mockResolvedValue({
      id: 'action_1',
      taskId: task.id,
      userId: 'user_1',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'test',
      approvalStatus: 'auto',
      result: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    });

    const result = await orchestrator.doNext('user_1', 'go ahead', defaultReceiptCtx);

    expect(result.message).toContain('✅');
    expect(result.gateDecision).toBeDefined();
    expect(result.gateDecision!.riskLevel).toBe('low');
  });
});

// ── KaiCoreService gate integration ──

describe('KaiCoreService — Gate Integration', () => {
  it('should route sensitive NL through the gate', () => {
    const service = new KaiCoreService();

    const response = service.processRequest({
      transcript: 'deploy this to production now',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      currentScreen: 'dashboard',
      allowedActions: ['view'],
      sessionId: 'sess_1',
    });

    expect(response.riskLevel).toBe('blocked');
    expect(response.responseText).toContain("can't perform");
  });

  it('should route high-risk NL through the gate', () => {
    const service = new KaiCoreService();

    const response = service.processRequest({
      transcript: 'bulk update all user records',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      currentScreen: 'dashboard',
      allowedActions: ['view'],
      sessionId: 'sess_1',
    });

    expect(response.riskLevel).toBe('high');
    expect(response.requiresConfirmation).toBe(true);
  });

  it('should allow safe NL requests', () => {
    const service = new KaiCoreService();

    const response = service.processRequest({
      transcript: 'hello',
      appId: 'jon-command-center',
      userId: 'user_1',
      userRole: 'super-admin',
      currentScreen: 'dashboard',
      allowedActions: ['view'],
      sessionId: 'sess_1',
    });

    expect(response.riskLevel).toBe('safe');
  });
});

// ── Completeness checks ──

describe('Gate — Completeness', () => {
  it('BLOCKED_ACTIONS_GATE contains all required blocked actions', () => {
    const required = [
      'deploy_code', 'modify_production_schema', 'delete_user',
      'process_payment', 'issue_refund', 'change_payout',
      'change_bank_details', 'approve_background_check',
      'approve_identity_verification', 'send_external_email',
      'change_compliance_settings', 'modify_security_rules',
      'grant_admin', 'revoke_access', 'transfer_funds',
      'delete_database', 'truncate_table',
    ];

    for (const action of required) {
      expect(BLOCKED_ACTIONS_GATE.has(action)).toBe(true);
    }
  });

  it('risk classification sets are disjoint', () => {
    for (const action of LOW_RISK_ACTIONS) {
      expect(MEDIUM_RISK_ACTIONS.has(action)).toBe(false);
      expect(HIGH_RISK_ACTIONS.has(action)).toBe(false);
      expect(BLOCKED_ACTIONS_GATE.has(action)).toBe(false);
    }
    for (const action of MEDIUM_RISK_ACTIONS) {
      expect(LOW_RISK_ACTIONS.has(action)).toBe(false);
      expect(HIGH_RISK_ACTIONS.has(action)).toBe(false);
      expect(BLOCKED_ACTIONS_GATE.has(action)).toBe(false);
    }
    for (const action of HIGH_RISK_ACTIONS) {
      expect(LOW_RISK_ACTIONS.has(action)).toBe(false);
      expect(MEDIUM_RISK_ACTIONS.has(action)).toBe(false);
      expect(BLOCKED_ACTIONS_GATE.has(action)).toBe(false);
    }
  });
});
