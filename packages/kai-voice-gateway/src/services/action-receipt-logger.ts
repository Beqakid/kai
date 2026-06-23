// ── ActionReceiptLogger — Kai Action Receipt Service ──
//
// Phase 3: Every Kai recommendation, action, escalation, blocked action,
// and generated output creates an auditable receipt in D1.
//
// Safety rules:
// - Never blocks the user response on a logging failure.
// - Fails safely when D1 is unavailable (console.warn only).
// - Never stores secrets, tokens, raw audio, or private documents.

import { D1Database, AppId, UserRole, RiskLevel } from '../types';

// ── Receipt Types ──

export const RECEIPT_TYPES = [
  'kai_recommendation_generated',
  'kai_action_prepared',
  'kai_action_executed',
  'kai_action_blocked',
  'kai_escalated_to_admin',
  'kai_risk_warning',
  'kai_explanation_generated',
  'kai_task_status_changed',
  'kai_tasklet_prompt_generated',
  'kai_blocker_summary_generated',
  'kai_admin_note_drafted',
  'kai_user_message_drafted',
  'kai_github_issue_drafted',
] as const;

export type ReceiptType = (typeof RECEIPT_TYPES)[number];

// ── Input types for each logger method ──

export interface ReceiptBase {
  appId: string;
  userId: string;
  userRole: string;
  project?: string;
  sessionId?: string;
  source?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface RecommendationInput extends ReceiptBase {
  taskId?: string;
  actionSummary: string;
  riskLevel: string;
  requiresConfirmation: boolean;
  kaiResponse?: string;
}

export interface PreparedActionInput extends ReceiptBase {
  taskId?: string;
  actionType: string;
  actionSummary: string;
  riskLevel: string;
  requiresConfirmation: boolean;
  approvalStatus?: string;
}

export interface ExecutedActionInput extends ReceiptBase {
  taskId?: string;
  actionType: string;
  actionSummary: string;
  riskLevel: string;
  kaiResponse?: string;
}

export interface BlockedActionInput extends ReceiptBase {
  actionType?: string;
  userIntent: string;
  blockedReason: string;
  riskLevel: string;
  kaiResponse?: string;
  taskId?: string;
}

export interface EscalationInput extends ReceiptBase {
  taskId?: string;
  actionSummary: string;
  riskLevel: string;
  kaiResponse?: string;
}

export interface RiskWarningInput extends ReceiptBase {
  userIntent: string;
  riskLevel: string;
  kaiResponse: string;
  requiresConfirmation: boolean;
}

export interface ExplanationInput extends ReceiptBase {
  userIntent: string;
  kaiResponse: string;
}

export interface TaskStatusChangeInput extends ReceiptBase {
  taskId: string;
  actionType: string;
  actionSummary: string;
  approvalStatus?: string;
}

export interface GeneratedOutputInput extends ReceiptBase {
  taskId?: string;
  receiptType: 'kai_tasklet_prompt_generated' | 'kai_blocker_summary_generated'
    | 'kai_admin_note_drafted' | 'kai_user_message_drafted' | 'kai_github_issue_drafted';
  actionType: string;
  actionSummary: string;
  riskLevel?: string;
  requiresConfirmation?: boolean;
}

// ── Internal receipt row ──

interface ReceiptRow {
  id: string;
  app_id: string;
  project: string | null;
  user_id: string;
  user_role: string;
  session_id: string | null;
  source: string | null;
  receipt_type: string;
  action_type: string | null;
  action_summary: string | null;
  user_intent: string | null;
  kai_response: string | null;
  risk_level: string;
  requires_confirmation: number;
  approval_status: string;
  blocked_reason: string | null;
  task_id: string | null;
  request_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

/** Generate unique receipt ID */
function generateReceiptId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rcpt_${ts}_${rand}`;
}

/**
 * Truncate a string to a safe length for DB storage.
 * Prevents excessively long transcripts or responses from bloating the table.
 */
function truncate(str: string | undefined | null, max = 2000): string | null {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Main Service ──

export class ActionReceiptLogger {
  private readonly db: D1Database | undefined;

  constructor(db: D1Database | undefined) {
    this.db = db;
  }

  /** Log a Kai recommendation (e.g. helpMeOut selecting a top task). */
  async logRecommendation(input: RecommendationInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_recommendation_generated',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel,
      requiresConfirmation: input.requiresConfirmation,
      kaiResponse: input.kaiResponse,
      metadata: input.metadata,
    });
  }

  /** Log an action that has been prepared but may need confirmation. */
  async logPreparedAction(input: PreparedActionInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_action_prepared',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel,
      requiresConfirmation: input.requiresConfirmation,
      approvalStatus: input.approvalStatus || 'pending',
      metadata: input.metadata,
    });
  }

  /** Log a safe action that was auto-executed. */
  async logExecutedAction(input: ExecutedActionInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_action_executed',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel,
      kaiResponse: input.kaiResponse,
      metadata: input.metadata,
    });
  }

  /** Log a blocked sensitive action. */
  async logBlockedAction(input: BlockedActionInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_action_blocked',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionType: input.actionType,
      userIntent: input.userIntent,
      blockedReason: input.blockedReason,
      riskLevel: input.riskLevel,
      kaiResponse: input.kaiResponse,
      metadata: input.metadata,
    });
  }

  /** Log an escalation to admin. */
  async logEscalation(input: EscalationInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_escalated_to_admin',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel,
      kaiResponse: input.kaiResponse,
      metadata: input.metadata,
    });
  }

  /** Log a risk warning (sensitive NL pattern detected). */
  async logRiskWarning(input: RiskWarningInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_risk_warning',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      userIntent: input.userIntent,
      riskLevel: input.riskLevel,
      kaiResponse: input.kaiResponse,
      requiresConfirmation: input.requiresConfirmation,
      metadata: input.metadata,
    });
  }

  /** Log a general explanation (screen help, status, etc.). */
  async logExplanation(input: ExplanationInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_explanation_generated',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      userIntent: input.userIntent,
      kaiResponse: input.kaiResponse,
      riskLevel: 'safe',
      metadata: input.metadata,
    });
  }

  /** Log a task status change (skip, done, in_progress). */
  async logTaskStatusChange(input: TaskStatusChangeInput): Promise<void> {
    await this.insert({
      receiptType: 'kai_task_status_changed',
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      riskLevel: 'safe',
      approvalStatus: input.approvalStatus || 'auto',
      metadata: input.metadata,
    });
  }

  /** Log a generated output (tasklet prompt, blocker summary, admin note, etc.). */
  async logGeneratedOutput(input: GeneratedOutputInput): Promise<void> {
    await this.insert({
      receiptType: input.receiptType,
      appId: input.appId,
      userId: input.userId,
      userRole: input.userRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel || 'safe',
      requiresConfirmation: input.requiresConfirmation ?? false,
      metadata: input.metadata,
    });
  }

  // ── Query receipts (for the admin API) ──

  async queryReceipts(filters: {
    appId?: string;
    userId?: string;
    receiptType?: string;
    riskLevel?: string;
    taskId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ receipts: ReceiptRow[]; total: number }> {
    if (!this.db) {
      return { receipts: [], total: 0 };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.appId) { conditions.push('app_id = ?'); params.push(filters.appId); }
    if (filters.userId) { conditions.push('user_id = ?'); params.push(filters.userId); }
    if (filters.receiptType) { conditions.push('receipt_type = ?'); params.push(filters.receiptType); }
    if (filters.riskLevel) { conditions.push('risk_level = ?'); params.push(filters.riskLevel); }
    if (filters.taskId) { conditions.push('task_id = ?'); params.push(filters.taskId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize || 20), 100);
    const offset = (page - 1) * pageSize;

    try {
      // Count
      const countResult = await this.db
        .prepare(`SELECT COUNT(*) as total FROM kai_action_receipts ${where}`)
        .bind(...params)
        .first<{ total: number }>();
      const total = countResult?.total ?? 0;

      // Fetch page
      const result = await this.db
        .prepare(`SELECT * FROM kai_action_receipts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...params, pageSize, offset)
        .all();

      return {
        receipts: (result.results || []) as unknown as ReceiptRow[],
        total,
      };
    } catch (err) {
      console.warn('[ActionReceiptLogger] Query failed:', (err as Error).message);
      return { receipts: [], total: 0 };
    }
  }

  // ── Private: insert receipt ──

  private async insert(params: {
    receiptType: ReceiptType;
    appId: string;
    userId: string;
    userRole: string;
    project?: string;
    sessionId?: string;
    source?: string;
    requestId?: string;
    taskId?: string;
    actionType?: string;
    actionSummary?: string;
    userIntent?: string;
    kaiResponse?: string;
    riskLevel: string;
    requiresConfirmation?: boolean;
    approvalStatus?: string;
    blockedReason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.db) {
      // D1 not available — silent no-op
      return;
    }

    const id = generateReceiptId();

    try {
      await this.db.prepare(`
        INSERT INTO kai_action_receipts
          (id, app_id, project, user_id, user_role, session_id, source,
           receipt_type, action_type, action_summary, user_intent, kai_response,
           risk_level, requires_confirmation, approval_status, blocked_reason,
           task_id, request_id, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        params.appId,
        params.project || null,
        params.userId,
        params.userRole,
        params.sessionId || null,
        params.source || null,
        params.receiptType,
        params.actionType || null,
        truncate(params.actionSummary),
        truncate(params.userIntent),
        truncate(params.kaiResponse),
        params.riskLevel,
        params.requiresConfirmation ? 1 : 0,
        params.approvalStatus || 'auto',
        params.blockedReason || null,
        params.taskId || null,
        params.requestId || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ).run();
    } catch (err) {
      // Never throw — receipt failures must not block the user response
      console.warn(
        '[ActionReceiptLogger] Failed to write receipt:',
        params.receiptType,
        'for user', params.userId,
        '—', (err as Error).message,
      );
    }
  }
}
