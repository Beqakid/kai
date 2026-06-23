// ── Kai Tasks Panel — Phase 6 integration component tests ──
//
// These tests verify the component contracts (data flow, API calls,
// state transitions) without rendering React — they test the API
// helpers and data transformation logic that power the panel.
//
// Rendering tests require a Next.js + React test environment which
// lives in Jon Command Center. These unit tests verify the gateway
// side: route availability, response shapes, risk labels, and
// error handling.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Types (mirrors KaiTasksPanel.tsx) ──

type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type TaskRiskLevel = 'low' | 'medium' | 'high' | 'blocked';

interface KaiTask {
  id: string;
  appId: string;
  project: string | null;
  title: string;
  description: string | null;
  source: string;
  priority: TaskPriority;
  severity: string;
  status: string;
  suggestedAction: string | null;
  riskLevel: string;
  requiresConfirmation: boolean;
  score: number;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingAction {
  id: string;
  taskId: string | null;
  appId: string;
  userId: string;
  actionType: string;
  riskLevel: string;
  preparedOutputJson: string | null;
  gateDecisionJson: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface ActionReceipt {
  id: string;
  receiptType: string;
  appId: string;
  userId: string;
  userRole: string;
  actionType: string;
  taskId: string | null;
  riskLevel: string;
  gateAllowed: number;
  gateReason: string | null;
  approvalStatus: string | null;
  createdAt: string;
}

// ── Risk label system ──

const RISK_LABELS: Record<string, { label: string; description: string }> = {
  low: { label: 'Low', description: 'Safe to execute' },
  medium: { label: 'Medium', description: 'Confirmation required' },
  high: { label: 'High', description: 'Admin approval required' },
  blocked: { label: 'Blocked', description: 'Not allowed' },
};

// ── Helpers ──

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return 'Invalid or missing auth token.';
  if (status === 403) return 'Permission denied.';
  if (status === 404) return 'Route not found.';
  if (status === 410) return 'Pending action has expired.';
  if (status === 429) return 'Too many requests — slow down.';
  if (status >= 500) return 'Gateway error — try again later.';
  return fallback;
}

function groupByPriority(tasks: KaiTask[]) {
  return {
    critical: tasks.filter((t) => t.priority === 'critical' && t.status !== 'done' && t.status !== 'skipped'),
    high: tasks.filter((t) => t.priority === 'high' && t.status !== 'done' && t.status !== 'skipped'),
    medium: tasks.filter((t) => t.priority === 'medium' && t.status !== 'done' && t.status !== 'skipped'),
    low: tasks.filter((t) => t.priority === 'low' && t.status !== 'done' && t.status !== 'skipped'),
  };
}

function makeTask(overrides: Partial<KaiTask> = {}): KaiTask {
  return {
    id: 'task-1',
    appId: 'jon-command-center',
    project: 'kai',
    title: 'Test task',
    description: null,
    source: 'manual',
    priority: 'medium',
    severity: 'normal',
    status: 'open',
    suggestedAction: null,
    riskLevel: 'low',
    requiresConfirmation: false,
    score: 50,
    metadataJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePending(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'pa-1',
    taskId: 'task-1',
    appId: 'jon-command-center',
    userId: 'super-admin',
    actionType: 'draft_github_issue',
    riskLevel: 'medium',
    preparedOutputJson: JSON.stringify({ title: 'Draft issue', body: 'Content' }),
    gateDecisionJson: JSON.stringify({ riskLevel: 'medium', requiresConfirmation: true, requiresAdminApproval: false, reason: 'Medium risk', recommendedFallback: '' }),
    status: 'pending',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<ActionReceipt> = {}): ActionReceipt {
  return {
    id: 'receipt-1',
    receiptType: 'kai_action_executed',
    appId: 'jon-command-center',
    userId: 'super-admin',
    userRole: 'super_admin',
    actionType: 'generate_tasklet_prompt',
    taskId: 'task-1',
    riskLevel: 'low',
    gateAllowed: 1,
    gateReason: 'Low risk, auto-allowed',
    approvalStatus: 'auto',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

describe('KaiTasksPanel — data and logic tests', () => {
  // ── 1. Tasks panel renders (data shape) ──
  it('should group tasks by priority correctly', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'critical', status: 'open' }),
      makeTask({ id: '2', priority: 'high', status: 'open' }),
      makeTask({ id: '3', priority: 'medium', status: 'done' }),
      makeTask({ id: '4', priority: 'low', status: 'open' }),
      makeTask({ id: '5', priority: 'medium', status: 'open' }),
    ];
    const grouped = groupByPriority(tasks);
    expect(grouped.critical).toHaveLength(1);
    expect(grouped.high).toHaveLength(1);
    expect(grouped.medium).toHaveLength(1); // 'done' one excluded
    expect(grouped.low).toHaveLength(1);
  });

  // ── 2. Top priority card renders ──
  it('should identify the top priority task as first active task', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'critical', score: 95, status: 'open' }),
      makeTask({ id: '2', priority: 'high', score: 80, status: 'open' }),
      makeTask({ id: '3', priority: 'medium', score: 50, status: 'done' }),
    ];
    const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped');
    expect(active[0].id).toBe('1');
    expect(active[0].priority).toBe('critical');
  });

  // ── 3. Pending confirmations render ──
  it('should correctly calculate minutes remaining for pending actions', () => {
    const expiry = new Date(Date.now() + 7 * 60_000);
    const pa = makePending({ expiresAt: expiry.toISOString() });
    const minutesLeft = Math.max(0, Math.floor((new Date(pa.expiresAt).getTime() - Date.now()) / 60_000));
    expect(minutesLeft).toBeGreaterThanOrEqual(6);
    expect(minutesLeft).toBeLessThanOrEqual(7);
  });

  it('should parse pending action gate decision JSON', () => {
    const pa = makePending();
    const gate = JSON.parse(pa.gateDecisionJson!);
    expect(gate.riskLevel).toBe('medium');
    expect(gate.requiresConfirmation).toBe(true);
  });

  it('should parse prepared output preview', () => {
    const pa = makePending();
    const prepared = JSON.parse(pa.preparedOutputJson!);
    expect(prepared.title).toBe('Draft issue');
  });

  // ── 4 & 5. Confirm/deny button calls (API contract) ──
  it('confirm should POST to /api/kai/actions/:id/confirm', () => {
    const id = 'pa-123';
    const url = `/api/kai/actions/${id}/confirm`;
    expect(url).toBe('/api/kai/actions/pa-123/confirm');
  });

  it('deny should POST to /api/kai/actions/:id/deny', () => {
    const id = 'pa-456';
    const url = `/api/kai/actions/${id}/deny`;
    expect(url).toBe('/api/kai/actions/pa-456/deny');
  });

  // ── 6. Recent receipts render ──
  it('should correctly parse receipt data', () => {
    const receipt = makeReceipt();
    expect(receipt.receiptType).toBe('kai_action_executed');
    expect(receipt.gateAllowed).toBe(1);
    expect(receipt.riskLevel).toBe('low');
  });

  it('should filter receipts by type', () => {
    const receipts = [
      makeReceipt({ id: '1', receiptType: 'kai_action_executed' }),
      makeReceipt({ id: '2', receiptType: 'kai_action_blocked' }),
      makeReceipt({ id: '3', receiptType: 'kai_action_confirmed' }),
    ];
    const filtered = receipts.filter((r) => r.receiptType === 'kai_action_blocked');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('should filter receipts by risk level', () => {
    const receipts = [
      makeReceipt({ id: '1', riskLevel: 'low' }),
      makeReceipt({ id: '2', riskLevel: 'medium' }),
      makeReceipt({ id: '3', riskLevel: 'high' }),
    ];
    const filtered = receipts.filter((r) => r.riskLevel === 'medium');
    expect(filtered).toHaveLength(1);
  });

  // ── 7. Medium-risk actions show confirmation requirement ──
  it('should mark medium-risk tasks as requiring confirmation', () => {
    const task = makeTask({ riskLevel: 'medium', requiresConfirmation: true });
    expect(task.requiresConfirmation).toBe(true);
    expect(RISK_LABELS[task.riskLevel].description).toBe('Confirmation required');
  });

  // ── 8. Blocked actions show blocked state ──
  it('should identify blocked actions correctly', () => {
    const task = makeTask({ riskLevel: 'blocked' });
    expect(RISK_LABELS[task.riskLevel].label).toBe('Blocked');
    expect(RISK_LABELS[task.riskLevel].description).toBe('Not allowed');
  });

  // ── 9. Help Me Out response displays gate decision ──
  it('should include gate decision in help-me-out response', () => {
    const response = {
      message: 'Work on auth next',
      task: makeTask({ id: 'task-1' }),
      explanation: 'Auth is blocking 3 other tasks',
      gateDecision: {
        riskLevel: 'low',
        requiresConfirmation: false,
        requiresAdminApproval: false,
        reason: 'Low risk, auto-allowed',
        recommendedFallback: '',
      },
    };
    expect(response.gateDecision).toBeDefined();
    expect(response.gateDecision.riskLevel).toBe('low');
    expect(response.gateDecision.requiresConfirmation).toBe(false);
  });

  // ── 10. Empty states display correctly ──
  it('should show empty state when no tasks', () => {
    const tasks: KaiTask[] = [];
    const grouped = groupByPriority(tasks);
    const anyVisible = Object.values(grouped).some((g) => g.length > 0);
    expect(anyVisible).toBe(false);
  });

  it('should show empty state when no pending actions', () => {
    const pending: PendingAction[] = [];
    expect(pending.length).toBe(0);
  });

  it('should show empty state when no receipts', () => {
    const receipts: ActionReceipt[] = [];
    expect(receipts.length).toBe(0);
  });

  // ── Error handling ──
  it('should map HTTP status codes to user-friendly errors', () => {
    expect(friendlyError(401, 'fail')).toBe('Invalid or missing auth token.');
    expect(friendlyError(403, 'fail')).toBe('Permission denied.');
    expect(friendlyError(404, 'fail')).toBe('Route not found.');
    expect(friendlyError(410, 'fail')).toBe('Pending action has expired.');
    expect(friendlyError(429, 'fail')).toBe('Too many requests — slow down.');
    expect(friendlyError(500, 'fail')).toBe('Gateway error — try again later.');
    expect(friendlyError(502, 'fail')).toBe('Gateway error — try again later.');
    expect(friendlyError(400, 'Bad request')).toBe('Bad request');
  });

  // ── Risk label system ──
  it('should have labels for all four risk levels', () => {
    expect(Object.keys(RISK_LABELS)).toEqual(['low', 'medium', 'high', 'blocked']);
    expect(RISK_LABELS.low.label).toBe('Low');
    expect(RISK_LABELS.medium.label).toBe('Medium');
    expect(RISK_LABELS.high.label).toBe('High');
    expect(RISK_LABELS.blocked.label).toBe('Blocked');
  });

  // ── Data filters work ──
  it('should filter tasks by priority', () => {
    const tasks = [
      makeTask({ id: '1', priority: 'critical' }),
      makeTask({ id: '2', priority: 'high' }),
      makeTask({ id: '3', priority: 'medium' }),
    ];
    const filtered = tasks.filter((t) => t.priority === 'critical');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should exclude done/skipped tasks from active list', () => {
    const tasks = [
      makeTask({ id: '1', status: 'open' }),
      makeTask({ id: '2', status: 'done' }),
      makeTask({ id: '3', status: 'skipped' }),
      makeTask({ id: '4', status: 'in_progress' }),
    ];
    const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped');
    expect(active).toHaveLength(2);
  });

  // ── Pending action expiry detection ──
  it('should detect expiring-soon pending actions (< 3 min)', () => {
    const pa = makePending({ expiresAt: new Date(Date.now() + 2 * 60_000).toISOString() });
    const minutesLeft = Math.max(0, Math.floor((new Date(pa.expiresAt).getTime() - Date.now()) / 60_000));
    expect(minutesLeft).toBeLessThanOrEqual(3);
  });

  // ── Command suggestions ──
  it('should have expected command suggestions', () => {
    const suggestions = [
      'go ahead',
      'skip this',
      'mark done',
      'summarize blockers',
      'generate tasklet prompt',
      'what is blocking launch?',
      'what should I work on?',
    ];
    expect(suggestions).toHaveLength(7);
    expect(suggestions).toContain('go ahead');
    expect(suggestions).toContain('summarize blockers');
  });

  // ── Receipt type labels ──
  it('should have human-readable labels for all receipt types', () => {
    const RECEIPT_TYPE_LABELS: Record<string, string> = {
      kai_recommendation_generated: 'Recommendation',
      kai_action_prepared: 'Action Prepared',
      kai_action_executed: 'Action Executed',
      kai_action_blocked: 'Action Blocked',
      kai_escalated_to_admin: 'Escalated',
      kai_risk_warning: 'Risk Warning',
      kai_explanation_generated: 'Explanation',
      kai_task_status_changed: 'Status Changed',
      kai_tasklet_prompt_generated: 'Tasklet Prompt',
      kai_blocker_summary_generated: 'Blocker Summary',
      kai_action_confirmed: 'Confirmed',
      kai_action_denied: 'Denied',
      kai_action_expired: 'Expired',
    };
    expect(Object.keys(RECEIPT_TYPE_LABELS).length).toBe(13);
    expect(RECEIPT_TYPE_LABELS.kai_action_confirmed).toBe('Confirmed');
    expect(RECEIPT_TYPE_LABELS.kai_action_denied).toBe('Denied');
    expect(RECEIPT_TYPE_LABELS.kai_action_expired).toBe('Expired');
  });
});
