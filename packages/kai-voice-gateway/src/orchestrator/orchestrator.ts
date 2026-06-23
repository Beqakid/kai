// ── Kai Task Orchestrator — Core Engine ──

import { D1Database } from '../types';
import { TaskStore } from './task-store';
import {
  KaiTask,
  CreateTaskRequest,
  TaskActionRequest,
  OrchestratorResponse,
  TaskPriority,
  TaskStatus,
  BLOCKED_ACTIONS_V1,
  SAFE_ACTIONS,
} from './types';
import { calculatePriorityScore, scoreToPriority, explainPriority } from './priority-scorer';
import { executeSafeAction, validateActionSafety } from './safe-actions';

export class KaiTaskOrchestrator {
  private readonly store: TaskStore;

  constructor(db: D1Database | undefined) {
    this.store = new TaskStore(db);
  }

  // ── GET /api/kai/tasks ──
  async listTasks(filters?: {
    appId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    project?: string;
  }): Promise<OrchestratorResponse> {
    const groups = await this.store.getTasksByPriorityGroup();
    const allTasks = [
      ...groups.critical,
      ...groups.high,
      ...groups.medium,
      ...groups.low,
    ];

    // Filter if requested
    let filtered = allTasks;
    if (filters?.appId) filtered = filtered.filter(t => t.appId === filters.appId);
    if (filters?.status) filtered = filtered.filter(t => t.status === filters.status);
    if (filters?.priority) filtered = filtered.filter(t => t.priority === filters.priority);
    if (filters?.project) filtered = filtered.filter(t => t.project === filters.project);

    const top = filtered[0];
    let explanation: string | undefined;
    if (top) {
      const weights = top.metadataJson ? JSON.parse(top.metadataJson)?.weights : undefined;
      explanation = this.explainTopTask(top, weights);
    }

    return {
      message: filtered.length > 0
        ? `Found ${filtered.length} active task${filtered.length > 1 ? 's' : ''}. ${explanation || ''}`
        : 'No active tasks found. Nice work! 🎉',
      tasks: filtered,
      explanation,
    };
  }

  // ── POST /api/kai/tasks ──
  async createTask(req: CreateTaskRequest): Promise<OrchestratorResponse> {
    const task = await this.store.createTask(req);
    return {
      message: `Task created: "${task.title}" — ${task.priority} priority (score: ${task.score}/100).`,
      task,
    };
  }

  // ── POST /api/kai/tasks/prioritize ──
  async reprioritize(): Promise<OrchestratorResponse> {
    const tasks = await this.store.getTasks({ limit: 100 });
    const groups: Record<TaskPriority, KaiTask[]> = { critical: [], high: [], medium: [], low: [] };

    for (const t of tasks) {
      if (t.status !== 'done' && t.status !== 'skipped') {
        groups[t.priority].push(t);
      }
    }

    const summary = [
      `🔴 Critical: ${groups.critical.length}`,
      `🟠 High: ${groups.high.length}`,
      `🟡 Medium: ${groups.medium.length}`,
      `🟢 Low: ${groups.low.length}`,
    ].join(' | ');

    const top = groups.critical[0] || groups.high[0] || groups.medium[0] || groups.low[0];
    let explanation: string | undefined;
    let nextRecommendation: string | undefined;

    if (top) {
      explanation = this.explainTopTask(top);
      nextRecommendation = top.suggestedAction || `Review and address: ${top.title}`;
    }

    const allActive = [...groups.critical, ...groups.high, ...groups.medium, ...groups.low];

    return {
      message: `Task priorities refreshed. ${summary}`,
      tasks: allActive,
      explanation,
      nextRecommendation,
    };
  }

  // ── POST /api/kai/tasks/:id/action ──
  async executeAction(taskId: string, req: TaskActionRequest): Promise<OrchestratorResponse> {
    // Safety check
    const safety = validateActionSafety(req.actionType);
    if (!safety.safe) {
      return {
        message: `⛔ ${safety.reason}`,
        requiresConfirmation: false,
      };
    }

    if (!SAFE_ACTIONS.has(req.actionType)) {
      return {
        message: `Action "${req.actionType}" is not in the approved safe actions list for v1.`,
        requiresConfirmation: false,
      };
    }

    const task = await this.store.getTaskById(taskId);
    if (!task) {
      return { message: `Task "${taskId}" not found.` };
    }

    // Execute
    const result = executeSafeAction(req.actionType, task, req.context);

    if (result.requiresConfirmation) {
      // Log as pending
      const action = await this.store.logAction({
        taskId,
        userId: req.userId,
        actionType: req.actionType,
        actionSummary: `Pending confirmation: ${req.actionType} for "${task.title}"`,
        approvalStatus: 'pending',
        result: result.output,
      });

      return {
        message: `Action "${req.actionType}" drafted for "${task.title}". Please review and confirm.`,
        task,
        action,
        requiresConfirmation: true,
        explanation: result.output,
      };
    }

    // Auto-execute low-risk action
    const action = await this.store.logAction({
      taskId,
      userId: req.userId,
      actionType: req.actionType,
      actionSummary: `Executed: ${req.actionType} for "${task.title}"`,
      approvalStatus: 'auto',
      result: result.output,
    });

    // Update task status if appropriate
    if (req.actionType === 'update_status') {
      await this.store.updateTaskStatus(taskId, 'in_progress');
    }

    return {
      message: `✅ Action completed: ${req.actionType} for "${task.title}".`,
      task,
      action,
      explanation: result.output,
    };
  }

  // ── POST /api/kai/orchestrator/help-me-out ──
  async helpMeOut(userId: string): Promise<OrchestratorResponse> {
    const task = await this.store.getTopActionableTask();
    if (!task) {
      return {
        message: "You're all caught up! No actionable tasks right now. 🎉",
      };
    }

    const explanation = this.explainTopTask(task);
    const suggestedAction = task.suggestedAction || 'generate_tasklet_prompt';

    return {
      message: [
        `Your highest priority is **${task.title}**.`,
        explanation,
        '',
        `Recommended next action: **${suggestedAction}**.`,
        task.riskLevel === 'low'
          ? 'This is a low-risk action — I can execute it now.'
          : `This requires your confirmation (risk: ${task.riskLevel}).`,
        '',
        'Say "go ahead" to proceed, "skip this" to move on, or "show me more".',
      ].join('\n'),
      task,
      explanation,
      nextRecommendation: suggestedAction,
      requiresConfirmation: task.riskLevel !== 'low',
    };
  }

  // ── POST /api/kai/orchestrator/next ──
  async doNext(userId: string, command: string): Promise<OrchestratorResponse> {
    const normalized = command.toLowerCase().trim();

    // ── "skip this" ──
    if (/^(skip\s*(this|it)?|pass|next)$/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (task) {
        await this.store.updateTaskStatus(task.id, 'skipped');
        await this.store.logAction({
          taskId: task.id,
          userId,
          actionType: 'update_status',
          actionSummary: `Skipped: "${task.title}"`,
          approvalStatus: 'auto',
        });

        // Get the next one
        const next = await this.store.getTopActionableTask();
        if (next) {
          return {
            message: `Skipped "${task.title}". Next up: **${next.title}** (${next.priority} priority, score ${next.score}).`,
            task: next,
            explanation: this.explainTopTask(next),
          };
        }
        return { message: `Skipped "${task.title}". No more tasks — you're done! 🎉` };
      }
      return { message: 'No tasks to skip.' };
    }

    // ── "mark this done" ──
    if (/^(mark\s*(this\s*)?(done|complete|finished)|done|complete)$/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (task) {
        await this.store.updateTaskStatus(task.id, 'done');
        await this.store.logAction({
          taskId: task.id,
          userId,
          actionType: 'update_status',
          actionSummary: `Completed: "${task.title}"`,
          approvalStatus: 'auto',
        });

        const next = await this.store.getTopActionableTask();
        return {
          message: `✅ Marked "${task.title}" as done!${next ? ` Next: **${next.title}** (${next.priority}).` : ' All clear! 🎉'}`,
          task: next || task,
        };
      }
      return { message: 'No active task to mark done.' };
    }

    // ── "do the next one" / "continue" / "go ahead" ──
    if (/^(do\s*(the\s*)?next(\s*one)?|continue|go\s*ahead|proceed|yes|do\s*it)$/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (!task) return { message: 'No actionable tasks remaining.' };

      const actionType = (task.suggestedAction as any) || 'generate_tasklet_prompt';
      if (SAFE_ACTIONS.has(actionType)) {
        return this.executeAction(task.id, { actionType, userId });
      }

      return {
        message: `The suggested action for "${task.title}" is "${actionType}" which requires manual execution. Would you like me to generate a Tasklet prompt instead?`,
        task,
        requiresConfirmation: true,
      };
    }

    // ── "create a tasklet prompt" ──
    if (/tasklet\s*prompt/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (!task) return { message: 'No task selected for prompt generation.' };
      return this.executeAction(task.id, { actionType: 'generate_tasklet_prompt', userId });
    }

    // ── "summarize blockers" ──
    if (/summarize\s*blocker/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (!task) return { message: 'No active blockers found.' };
      return this.executeAction(task.id, { actionType: 'summarize_blockers', userId });
    }

    // ── "show high priority only" / "what is blocking launch?" ──
    if (/high\s*priority|blocking\s*launch|critical/i.test(normalized)) {
      const groups = await this.store.getTasksByPriorityGroup();
      const urgent = [...groups.critical, ...groups.high];
      if (urgent.length === 0) return { message: 'No critical or high priority tasks. 🎉' };
      return {
        message: `${urgent.length} high-priority task${urgent.length > 1 ? 's' : ''}:`,
        tasks: urgent,
        explanation: this.explainTopTask(urgent[0]),
      };
    }

    // ── "stop" ──
    if (/^(stop|quit|exit|cancel|enough)$/i.test(normalized)) {
      return { message: 'Got it — stopping task flow. Say "help me out" anytime to resume.' };
    }

    // ── "what should I work on?" ──
    if (/what\s*should\s*i\s*(work|focus|do)/i.test(normalized)) {
      return this.helpMeOut(userId);
    }

    // Default: treat as help-me-out
    return this.helpMeOut(userId);
  }

  // ── Get recent actions for the history log ──
  async getRecentActions(limit = 20): Promise<OrchestratorResponse> {
    const actions = await this.store.getRecentActions(limit);
    return {
      message: `${actions.length} recent action${actions.length !== 1 ? 's' : ''}.`,
      tasks: [],
    };
  }

  // ── Helpers ──

  private explainTopTask(task: KaiTask, weights?: any): string {
    const reasons: string[] = [];

    if (task.priority === 'critical') reasons.push('critical priority');
    if (task.severity === 'critical' || task.severity === 'urgent') reasons.push(`${task.severity} severity`);
    if (task.score >= 80) reasons.push(`high impact score (${task.score}/100)`);
    if (task.source === 'error_summary') reasons.push('linked to active errors');
    if (task.source === 'user_feedback') reasons.push('user-reported issue');

    if (weights) {
      return explainPriority(weights, task.score);
    }

    if (reasons.length === 0) reasons.push(`score ${task.score}/100`);

    return `This is first because: ${reasons.join(', ')}.`;
  }
}
