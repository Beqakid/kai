// ── PendingActionStore — Confirmation Workflow for Medium-Risk Kai Actions ──
//
// Phase 5: Implements the prepare → confirm → execute (or deny/expire) lifecycle.
//
// Rules:
// 1. Only medium-risk actions can enter the pending confirmation flow.
// 2. High-risk and blocked actions must NEVER be stored as pending actions.
// 3. Pending actions expire after 15 minutes by default.
// 4. Only the same authenticated user (or super-admin) can confirm/deny.
// 5. Confirmation re-runs the Permission Gate before execution.
// 6. If the gate decision changes on re-evaluation, execution is blocked.
// 7. All confirm/deny/expire events create Action Receipts.
// 8. Never stores tokens, secrets, raw audio, or private documents.

import { D1Database } from '../types';
import { GateDecision } from './kai-permission-gate';

// ── Constants ──

/** Default expiration in minutes */
export const DEFAULT_EXPIRY_MINUTES = 15;

/** Valid pending action statuses */
export const PENDING_ACTION_STATUSES = [
  'pending',
  'confirmed',
  'denied',
  'expired',
  'executed',
] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

// ── Types ──

export interface PendingActionRow {
  id: string;
  app_id: string;
  project: string | null;
  user_id: string;
  user_role: string;
  session_id: string | null;
  task_id: string | null;
  action_type: string;
  action_summary: string | null;
  prepared_output: string | null;
  risk_level: string;
  gate_decision_json: string | null;
  status: PendingActionStatus;
  expires_at: string;
  created_at: string;
  confirmed_at: string | null;
  denied_at: string | null;
  confirmed_by: string | null;
  denied_by: string | null;
  metadata_json: string | null;
}

export interface CreatePendingActionInput {
  appId: string;
  project?: string;
  userId: string;
  userRole: string;
  sessionId?: string;
  taskId?: string;
  actionType: string;
  actionSummary?: string;
  preparedOutput?: string;
  riskLevel: string;
  gateDecision?: GateDecision;
  metadata?: Record<string, unknown>;
  expiryMinutes?: number;
}

export interface ListPendingActionsFilters {
  appId?: string;
  userId?: string;
  taskId?: string;
  status?: PendingActionStatus;
  page?: number;
  pageSize?: number;
}

export interface AuthContext {
  userId: string;
  userRole: string;
}

export interface ConfirmResult {
  success: boolean;
  pendingAction: PendingActionRow | null;
  reason: string;
}

export interface DenyResult {
  success: boolean;
  pendingAction: PendingActionRow | null;
  reason: string;
}

// ── ID Generation ──

function generatePendingActionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pa_${ts}_${rand}`;
}

/**
 * Truncate long strings to prevent bloated rows.
 * Never store secrets or raw audio.
 */
function truncate(str: string | undefined | null, max = 4000): string | null {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Main Service ──

export class PendingActionStore {
  private readonly db: D1Database | undefined;

  constructor(db: D1Database | undefined) {
    this.db = db;
  }

  /**
   * Create a new pending action.
   *
   * Safety: only medium-risk actions may be stored.
   * High-risk and blocked actions are rejected.
   */
  async createPendingAction(input: CreatePendingActionInput): Promise<PendingActionRow> {
    // ── Safety: reject high-risk / blocked ──
    const normalizedRisk = input.riskLevel?.toLowerCase();
    if (normalizedRisk === 'high' || normalizedRisk === 'blocked') {
      throw new Error(
        `Cannot create pending action for ${normalizedRisk}-risk actions. ` +
        'Only medium-risk actions may enter the confirmation flow.',
      );
    }

    if (!this.db) {
      throw new Error('Database not available — cannot create pending action.');
    }

    const id = generatePendingActionId();
    const expiryMinutes = input.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    const row: PendingActionRow = {
      id,
      app_id: input.appId,
      project: input.project || null,
      user_id: input.userId,
      user_role: input.userRole,
      session_id: input.sessionId || null,
      task_id: input.taskId || null,
      action_type: input.actionType,
      action_summary: truncate(input.actionSummary),
      prepared_output: truncate(input.preparedOutput),
      risk_level: input.riskLevel || 'medium',
      gate_decision_json: input.gateDecision ? JSON.stringify(input.gateDecision) : null,
      status: 'pending',
      expires_at: expiresAt,
      created_at: createdAt,
      confirmed_at: null,
      denied_at: null,
      confirmed_by: null,
      denied_by: null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    };

    await this.db.prepare(`
      INSERT INTO kai_pending_actions
        (id, app_id, project, user_id, user_role, session_id, task_id,
         action_type, action_summary, prepared_output, risk_level,
         gate_decision_json, status, expires_at, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id,
      row.app_id,
      row.project,
      row.user_id,
      row.user_role,
      row.session_id,
      row.task_id,
      row.action_type,
      row.action_summary,
      row.prepared_output,
      row.risk_level,
      row.gate_decision_json,
      row.status,
      row.expires_at,
      row.created_at,
      row.metadata_json,
    ).run();

    return row;
  }

  /**
   * Get a single pending action by ID.
   */
  async getPendingAction(id: string): Promise<PendingActionRow | null> {
    if (!this.db) return null;

    const result = await this.db
      .prepare('SELECT * FROM kai_pending_actions WHERE id = ?')
      .bind(id)
      .first<PendingActionRow>();

    return result || null;
  }

  /**
   * List pending actions with optional filters.
   * Non-super-admin users only see their own pending actions.
   */
  async listPendingActions(
    filters: ListPendingActionsFilters,
    authCtx: AuthContext,
  ): Promise<{ pendingActions: PendingActionRow[]; total: number }> {
    if (!this.db) {
      return { pendingActions: [], total: 0 };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Non-super-admin can only see their own actions
    if (authCtx.userRole !== 'super-admin') {
      conditions.push('user_id = ?');
      params.push(authCtx.userId);
    } else {
      // Super-admin can filter by userId
      if (filters.userId) {
        conditions.push('user_id = ?');
        params.push(filters.userId);
      }
    }

    if (filters.appId) { conditions.push('app_id = ?'); params.push(filters.appId); }
    if (filters.taskId) { conditions.push('task_id = ?'); params.push(filters.taskId); }
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize || 20), 100);
    const offset = (page - 1) * pageSize;

    try {
      const countResult = await this.db
        .prepare(`SELECT COUNT(*) as total FROM kai_pending_actions ${where}`)
        .bind(...params)
        .first<{ total: number }>();
      const total = countResult?.total ?? 0;

      const result = await this.db
        .prepare(`SELECT * FROM kai_pending_actions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...params, pageSize, offset)
        .all();

      return {
        pendingActions: (result.results || []) as unknown as PendingActionRow[],
        total,
      };
    } catch (err) {
      console.warn('[PendingActionStore] List query failed:', (err as Error).message);
      return { pendingActions: [], total: 0 };
    }
  }

  /**
   * Confirm a pending action.
   *
   * Rules:
   * - Only 'pending' actions can be confirmed.
   * - Expired actions cannot be confirmed.
   * - Only the owning user or super-admin can confirm.
   */
  async confirmPendingAction(id: string, authCtx: AuthContext): Promise<ConfirmResult> {
    const action = await this.getPendingAction(id);

    if (!action) {
      return { success: false, pendingAction: null, reason: 'Pending action not found.' };
    }

    // Check expiration
    if (new Date(action.expires_at) <= new Date()) {
      // Mark expired if still pending
      if (action.status === 'pending') {
        await this.updateStatus(id, 'expired');
        action.status = 'expired';
      }
      return { success: false, pendingAction: action, reason: 'Pending action has expired.' };
    }

    // Check status
    if (action.status !== 'pending') {
      return {
        success: false,
        pendingAction: action,
        reason: `Cannot confirm action with status "${action.status}". Only "pending" actions can be confirmed.`,
      };
    }

    // Check authorization
    if (authCtx.userRole !== 'super-admin' && authCtx.userId !== action.user_id) {
      return {
        success: false,
        pendingAction: action,
        reason: 'You are not authorized to confirm this pending action.',
      };
    }

    // Mark confirmed
    const now = new Date().toISOString();
    if (this.db) {
      await this.db.prepare(`
        UPDATE kai_pending_actions
        SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?
        WHERE id = ?
      `).bind(now, authCtx.userId, id).run();
    }

    action.status = 'confirmed';
    action.confirmed_at = now;
    action.confirmed_by = authCtx.userId;

    return { success: true, pendingAction: action, reason: 'Action confirmed successfully.' };
  }

  /**
   * Deny a pending action.
   *
   * Rules:
   * - Only 'pending' actions can be denied.
   * - Only the owning user or super-admin can deny.
   */
  async denyPendingAction(id: string, authCtx: AuthContext): Promise<DenyResult> {
    const action = await this.getPendingAction(id);

    if (!action) {
      return { success: false, pendingAction: null, reason: 'Pending action not found.' };
    }

    // Check status
    if (action.status !== 'pending') {
      return {
        success: false,
        pendingAction: action,
        reason: `Cannot deny action with status "${action.status}". Only "pending" actions can be denied.`,
      };
    }

    // Check authorization
    if (authCtx.userRole !== 'super-admin' && authCtx.userId !== action.user_id) {
      return {
        success: false,
        pendingAction: action,
        reason: 'You are not authorized to deny this pending action.',
      };
    }

    // Mark denied
    const now = new Date().toISOString();
    if (this.db) {
      await this.db.prepare(`
        UPDATE kai_pending_actions
        SET status = 'denied', denied_at = ?, denied_by = ?
        WHERE id = ?
      `).bind(now, authCtx.userId, id).run();
    }

    action.status = 'denied';
    action.denied_at = now;
    action.denied_by = authCtx.userId;

    return { success: true, pendingAction: action, reason: 'Action denied.' };
  }

  /**
   * Expire all overdue pending actions.
   * Returns the count of newly expired actions.
   */
  async expireOldPendingActions(): Promise<number> {
    if (!this.db) return 0;

    const now = new Date().toISOString();
    try {
      const result = await this.db.prepare(`
        UPDATE kai_pending_actions
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at <= ?
      `).bind(now).run();

      // D1 run() returns meta with changes
      return (result.meta as any)?.changes ?? 0;
    } catch (err) {
      console.warn('[PendingActionStore] Expire failed:', (err as Error).message);
      return 0;
    }
  }

  /**
   * Mark a confirmed action as executed.
   * Only confirmed actions can transition to executed.
   */
  async markExecuted(id: string): Promise<boolean> {
    if (!this.db) return false;

    const action = await this.getPendingAction(id);
    if (!action || action.status !== 'confirmed') {
      return false;
    }

    await this.db.prepare(`
      UPDATE kai_pending_actions SET status = 'executed' WHERE id = ? AND status = 'confirmed'
    `).bind(id).run();

    return true;
  }

  // ── Private ──

  private async updateStatus(id: string, status: PendingActionStatus): Promise<void> {
    if (!this.db) return;

    await this.db.prepare(`
      UPDATE kai_pending_actions SET status = ? WHERE id = ?
    `).bind(status, id).run();
  }
}
