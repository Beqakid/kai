// ── Kai Task Orchestrator — D1 Task Store ──

import { D1Database } from '../types';
import {
  KaiTask,
  KaiTaskAction,
  KaiRecommendation,
  CreateTaskRequest,
  TaskStatus,
  TaskPriority,
  ActionType,
  ApprovalStatus,
} from './types';
import { calculatePriorityScore, scoreToPriority } from './priority-scorer';

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

export class TaskStore {
  constructor(private readonly db: D1Database | undefined) {}

  private ensureDb(): D1Database {
    if (!this.db) throw new Error('KAI_DB not bound — task storage unavailable.');
    return this.db;
  }

  // ── Tasks CRUD ──

  async createTask(req: CreateTaskRequest): Promise<KaiTask> {
    const db = this.ensureDb();
    const id = generateId('task');
    const now = new Date().toISOString();
    const score = req.weights ? calculatePriorityScore(req.weights) : 50;
    const priority = req.priority || scoreToPriority(score);

    const task: KaiTask = {
      id,
      appId: req.appId,
      project: req.project || null,
      title: req.title,
      description: req.description || null,
      source: req.source || 'manual',
      priority,
      severity: req.severity || 'normal',
      status: 'open',
      suggestedAction: req.suggestedAction || null,
      riskLevel: req.riskLevel || 'low',
      requiresConfirmation: req.requiresConfirmation ?? true,
      score,
      metadataJson: req.metadataJson || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.prepare(`
      INSERT INTO kai_tasks (id, app_id, project, title, description, source, priority, severity, status, suggested_action, risk_level, requires_confirmation, score, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      task.id, task.appId, task.project, task.title, task.description,
      task.source, task.priority, task.severity, task.status,
      task.suggestedAction, task.riskLevel, task.requiresConfirmation ? 1 : 0,
      task.score, task.metadataJson, task.createdAt, task.updatedAt
    ).run();

    return task;
  }

  async getTasks(filters?: {
    appId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    project?: string;
    limit?: number;
  }): Promise<KaiTask[]> {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.appId) { conditions.push('app_id = ?'); params.push(filters.appId); }
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters?.priority) { conditions.push('priority = ?'); params.push(filters.priority); }
    if (filters?.project) { conditions.push('project = ?'); params.push(filters.project); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit || 50;

    const result = await db.prepare(
      `SELECT * FROM kai_tasks ${where} ORDER BY score DESC, created_at DESC LIMIT ?`
    ).bind(...params, limit).all();

    return (result.results as Record<string, unknown>[]).map(this.rowToTask);
  }

  async getTaskById(id: string): Promise<KaiTask | null> {
    const db = this.ensureDb();
    const row = await db.prepare('SELECT * FROM kai_tasks WHERE id = ?').bind(id).first();
    return row ? this.rowToTask(row as Record<string, unknown>) : null;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<KaiTask | null> {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    await db.prepare('UPDATE kai_tasks SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id).run();
    return this.getTaskById(id);
  }

  async getTopActionableTask(): Promise<KaiTask | null> {
    const db = this.ensureDb();
    const row = await db.prepare(
      `SELECT * FROM kai_tasks WHERE status IN ('open', 'in_progress') ORDER BY score DESC, created_at ASC LIMIT 1`
    ).first();
    return row ? this.rowToTask(row as Record<string, unknown>) : null;
  }

  async getTasksByPriorityGroup(): Promise<Record<TaskPriority, KaiTask[]>> {
    const tasks = await this.getTasks({ limit: 100 });
    const groups: Record<TaskPriority, KaiTask[]> = { critical: [], high: [], medium: [], low: [] };
    for (const t of tasks) {
      if (t.status !== 'done' && t.status !== 'skipped') {
        groups[t.priority].push(t);
      }
    }
    return groups;
  }

  // ── Task Actions (audit log) ──

  async logAction(params: {
    taskId: string;
    userId: string;
    actionType: ActionType;
    actionSummary: string;
    approvalStatus: ApprovalStatus;
    result?: string;
    errorMessage?: string;
  }): Promise<KaiTaskAction> {
    const db = this.ensureDb();
    const id = generateId('tact');
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO kai_task_actions (id, task_id, user_id, action_type, action_summary, approval_status, result, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, params.taskId, params.userId, params.actionType,
      params.actionSummary, params.approvalStatus,
      params.result || null, params.errorMessage || null, now
    ).run();

    return {
      id, taskId: params.taskId, userId: params.userId,
      actionType: params.actionType, actionSummary: params.actionSummary,
      approvalStatus: params.approvalStatus,
      result: params.result || null, errorMessage: params.errorMessage || null,
      createdAt: now,
    };
  }

  async getActionsForTask(taskId: string, limit = 20): Promise<KaiTaskAction[]> {
    const db = this.ensureDb();
    const result = await db.prepare(
      'SELECT * FROM kai_task_actions WHERE task_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(taskId, limit).all();

    return (result.results as Record<string, unknown>[]).map(this.rowToAction);
  }

  async getRecentActions(limit = 20): Promise<KaiTaskAction[]> {
    const db = this.ensureDb();
    const result = await db.prepare(
      'SELECT * FROM kai_task_actions ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();

    return (result.results as Record<string, unknown>[]).map(this.rowToAction);
  }

  // ── Row mappers ──

  private rowToTask(row: Record<string, unknown>): KaiTask {
    return {
      id: row.id as string,
      appId: row.app_id as string,
      project: row.project as string | null,
      title: row.title as string,
      description: row.description as string | null,
      source: row.source as KaiTask['source'],
      priority: row.priority as KaiTask['priority'],
      severity: row.severity as KaiTask['severity'],
      status: row.status as KaiTask['status'],
      suggestedAction: row.suggested_action as string | null,
      riskLevel: row.risk_level as KaiTask['riskLevel'],
      requiresConfirmation: Boolean(row.requires_confirmation),
      score: row.score as number,
      metadataJson: row.metadata_json as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToAction(row: Record<string, unknown>): KaiTaskAction {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      userId: row.user_id as string,
      actionType: row.action_type as ActionType,
      actionSummary: row.action_summary as string | null,
      approvalStatus: row.approval_status as ApprovalStatus,
      result: row.result as string | null,
      errorMessage: row.error_message as string | null,
      createdAt: row.created_at as string,
    };
  }
}
