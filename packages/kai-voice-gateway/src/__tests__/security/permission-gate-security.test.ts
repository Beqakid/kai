import { describe, it, expect } from 'vitest';
import {
  KaiPermissionGate,
  BLOCKED_ACTIONS_GATE,
  LOW_RISK_ACTIONS,
  MEDIUM_RISK_ACTIONS,
  HIGH_RISK_ACTIONS,
} from '../../services/kai-permission-gate';
import { ActionReceiptLogger } from '../../services/action-receipt-logger';
import { ProofTrustBridgeLite } from '../../prooftrust/prooftrust-bridge';
import { validateAllowedActions } from '../../services/security';

function makeGateInput(overrides: Record<string, unknown> = {}) {
  return {
    appId: 'jon-command-center',
    userId: 'user-1',
    userRole: 'super-admin',
    actionType: 'generate_tasklet_prompt',
    requestedAction: 'test action',
    ...overrides,
  };
}

describe('Permission Gate Security Retest', () => {
  const gate = new KaiPermissionGate();

  // 1. blocked action always denied
  it('blocked action always denied', () => {
    const decision = gate.evaluate(makeGateInput({ actionType: 'deploy_code' }));
    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });

  // 2. high-risk action denied in v1
  it('high-risk action denied in v1', () => {
    const decision = gate.evaluate(makeGateInput({ actionType: 'change_user_permissions' }));
    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('high');
    expect(decision.requiresAdminApproval).toBe(true);
  });

  // 3. medium-risk action requires confirmation
  it('medium-risk action requires confirmation', () => {
    const decision = gate.evaluate(makeGateInput({ actionType: 'draft_github_issue' }));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.riskLevel).toBe('medium');
  });

  // 4. low-risk action allowed
  it('low-risk action allowed', () => {
    const decision = gate.evaluate(makeGateInput({ actionType: 'generate_tasklet_prompt' }));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.riskLevel).toBe('low');
  });

  // 5. unknown action denied
  it('unknown action denied', () => {
    const decision = gate.evaluate(makeGateInput({ actionType: 'totally_made_up_action' }));
    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });

  // 6. client-provided allowedActions cannot expand permissions
  it('client-provided allowedActions cannot expand permissions', () => {
    const result = validateAllowedActions(
      'jon-command-center' as any,
      'viewer' as any,
      ['view', 'manage-users', 'deploy_code'],
    );
    expect(result).toEqual(['view']);
    expect(result).not.toContain('manage-users');
    expect(result).not.toContain('deploy_code');
  });

  // 7. role cannot self-escalate
  it('role cannot self-escalate', () => {
    const decision = gate.evaluate(
      makeGateInput({ userRole: 'viewer', actionType: 'generate_tasklet_prompt' }),
    );
    expect(decision.allowed).toBe(false);
  });

  // 8. customer/viewer cannot execute admin actions
  it('customer/viewer cannot execute admin actions', () => {
    const decision = gate.evaluate(
      makeGateInput({ userRole: 'customer', actionType: 'summarize_blockers' }),
    );
    expect(decision.allowed).toBe(false);
  });

  // 9. vendor cannot execute super-admin actions
  it('vendor cannot execute super-admin actions', () => {
    const decision = gate.evaluate(
      makeGateInput({
        appId: 'jon-command-center',
        userRole: 'vendor',
        actionType: 'generate_tasklet_prompt',
      }),
    );
    expect(decision.allowed).toBe(false);
  });

  // 10. gate decision creates or supports receipt metadata
  it('gate decision creates or supports receipt metadata', () => {
    const receiptLogger = new ActionReceiptLogger(undefined);
    const gateWithLogger = new KaiPermissionGate(receiptLogger);
    const decision = gateWithLogger.evaluate(makeGateInput({ actionType: 'generate_tasklet_prompt' }));
    const metadata = gateWithLogger.toGateMetadata(decision);

    expect(metadata).toHaveProperty('gateAllowed');
    expect(metadata).toHaveProperty('gateRiskLevel');
    expect(metadata).toHaveProperty('gateReason');
    expect(metadata).toHaveProperty('gateRequiresConfirmation');
    expect(metadata).toHaveProperty('gateRequiresAdminApproval');
    expect(metadata.gateAllowed).toBe(true);
    expect(metadata.gateRiskLevel).toBe('low');
  });

  // 11. ProofTrust Bridge cannot loosen gate decision
  it('ProofTrust Bridge cannot loosen gate decision', () => {
    const receiptLogger = new ActionReceiptLogger(undefined);
    const gateWithBridge = new KaiPermissionGate(receiptLogger);
    const bridge = new ProofTrustBridgeLite(receiptLogger, gateWithBridge);

    // Gate says blocked for deploy_code
    const gateDecision = gateWithBridge.evaluate(makeGateInput({ actionType: 'deploy_code' }));
    expect(gateDecision.allowed).toBe(false);
    expect(gateDecision.riskLevel).toBe('blocked');

    // Bridge should also deny
    const bridgeResult = bridge.evaluateAction({
      appId: 'jon-command-center',
      actorId: 'user-1',
      actorRole: 'super-admin',
      actionType: 'deploy_code',
      actionSummary: 'deploy code to production',
      riskLevel: 'blocked',
      source: 'test',
    });
    expect(bridgeResult.decision).toBe('deny');
    expect(bridgeResult.decision).not.toBe('allow');
  });

  // 12. ProofTrust Bridge can tighten gate decision only
  it('ProofTrust Bridge can tighten gate decision only', () => {
    const receiptLogger = new ActionReceiptLogger(undefined);
    const gateWithBridge = new KaiPermissionGate(receiptLogger);
    const bridge = new ProofTrustBridgeLite(receiptLogger, gateWithBridge);

    // Gate would allow generate_tasklet_prompt for super-admin (low risk)
    const gateDecision = gateWithBridge.evaluate(makeGateInput({ actionType: 'generate_tasklet_prompt' }));
    expect(gateDecision.allowed).toBe(true);
    expect(gateDecision.riskLevel).toBe('low');

    // Bridge requireApproval should tighten to requiresConfirmation
    const bridgeResult = bridge.requireApproval({
      appId: 'jon-command-center',
      actorId: 'user-1',
      actorRole: 'super-admin',
      actionType: 'generate_tasklet_prompt',
      actionSummary: 'generate tasklet prompt',
      riskLevel: 'low',
      reason: 'Extra caution required',
    });
    expect(bridgeResult.decision).toBe('requiresConfirmation');
    expect(bridgeResult.requiresConfirmation).toBe(true);
  });
});
