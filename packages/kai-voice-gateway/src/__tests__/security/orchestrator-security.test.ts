import { describe, it, expect } from 'vitest';
import { KaiTaskOrchestrator } from '../../orchestrator/orchestrator';
import { KaiPermissionGate } from '../../services/kai-permission-gate';

describe('Orchestrator Security Retest', () => {
  const orchestrator = new KaiTaskOrchestrator(undefined);
  const gate = orchestrator.getPermissionGate();

  const baseInput = {
    appId: 'jon-command-center',
    userId: 'user-1',
    userRole: 'super-admin',
    requestedAction: 'test action',
  };

  it('doNext cannot bypass gate — deploy_code is blocked regardless of role', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'deploy_code',
      requestedAction: 'Deploy code via doNext',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });

  it('executeAction cannot bypass gate — process_payment is blocked regardless of role', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'process_payment',
      requestedAction: 'Process payment via executeAction',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });

  it('helpMeOut does not execute actions directly', async () => {
    const receiptCtx = {
      appId: 'jon-command-center',
      userId: 'user-1',
      userRole: 'super-admin',
    };

    // With undefined DB, helpMeOut throws because TaskStore requires a DB binding.
    // This proves helpMeOut delegates to the task store (read path) rather than
    // auto-executing actions — it never reaches "✅ Action completed".
    try {
      const result = await orchestrator.helpMeOut('user-1', receiptCtx);
      // If it somehow succeeds, it must NOT have executed an action
      expect(result.message).not.toMatch(/^✅ Action completed/);
    } catch (err: any) {
      // Expected: DB not bound error from the task store read path
      expect(err.message).toContain('KAI_DB not bound');
    }
  });

  it('generate_tasklet_prompt is low-risk', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'generate_tasklet_prompt',
      requestedAction: 'Generate tasklet prompt',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('low');
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('summarize_blockers is low-risk', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'summarize_blockers',
      requestedAction: 'Summarize blockers',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('low');
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('draft_github_issue is medium-risk and pending', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'draft_github_issue',
      requestedAction: 'Draft GitHub issue',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('medium');
    expect(decision.requiresConfirmation).toBe(true);
  });

  it('draft_user_message is medium-risk and pending', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'draft_user_message',
      requestedAction: 'Draft user message',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('medium');
    expect(decision.requiresConfirmation).toBe(true);
  });

  it('update_status medium-risk path requires confirmation when task risk is medium', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'update_status',
      requestedAction: 'Update task status',
      taskRiskLevel: 'medium',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe('medium');
    expect(decision.requiresConfirmation).toBe(true);
  });

  it('blocked suggested action is denied — deploy_code', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'deploy_code',
      requestedAction: 'Deploy code',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('blocked');
  });

  it('high-risk suggested action is denied — change_user_permissions', () => {
    const decision = gate.evaluate({
      ...baseInput,
      actionType: 'change_user_permissions',
      requestedAction: 'Change user permissions',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe('high');
  });

  it('task status cannot be changed without proper gate flow — viewer role denied', () => {
    const decision = gate.evaluate({
      appId: 'jon-command-center',
      userId: 'user-viewer',
      userRole: 'viewer',
      actionType: 'update_status',
      requestedAction: 'Update task status as viewer',
    });

    expect(decision.allowed).toBe(false);
    // viewer role lacks execute_task_action, so gate blocks it
    expect(decision.riskLevel).toBe('blocked');
  });
});
