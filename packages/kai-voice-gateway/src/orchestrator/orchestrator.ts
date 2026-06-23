// ── Kai Task Orchestrator — Core Engine ──
//
// Phase 5: Medium-risk actions enter pending confirmation workflow.
// Phase 4: All actions pass through the KaiPermissionGate.
// Phase 3: Integrated with ActionReceiptLogger for auditable receipts.

import { D1Database } from '../types';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import { KaiPermissionGate, GateDecision } from '../services/kai-permission-gate';
import { PendingActionStore, PendingActionRow } from '../services/pending-action-store';
import { ProofTrustBridgeLite } from '../prooftrust/prooftrust-bridge';
import type { ProofTrustRiskLevel } from '../prooftrust/types';
import { mapKaiRiskToProofTrust } from '../prooftrust/types';
import { TaskStore } from './task-store';
import {
  KaiTask,
  CreateTaskRequest,
  TaskActionRequest,
  OrchestratorResponse,
  GateDecisionSummary,
  TaskPriority,
  TaskStatus,
  BLOCKED_ACTIONS_V1,
  SAFE_ACTIONS,
} from './types';
import { calculatePriorityScore, scoreToPriority, explainPriority } from './priority-scorer';
import { executeSafeAction, validateActionSafety } from './safe-actions';

/** Context for receipt logging — provided by the gateway layer. */
export interface OrchestratorReceiptContext {
  appId: string;
  userId: string;
  userRole: string;
  sessionId?: string;
}

/** Convert a GateDecision to the API-facing summary */
function toGateDecisionSummary(d: GateDecision): GateDecisionSummary {
  return {
    riskLevel: d.riskLevel,
    requiresConfirmation: d.requiresConfirmation,
    requiresAdminApproval: d.requiresAdminApproval,
    reason: d.reason,
    recommendedFallback: d.recommendedFallback,
  };
}

export class KaiTaskOrchestrator {
  private readonly store: TaskStore;
  private readonly receiptLogger: ActionReceiptLogger;
  private readonly gate: KaiPermissionGate;
  private readonly pendingStore: PendingActionStore;
  private readonly proofTrustBridge: ProofTrustBridgeLite;

  constructor(db: D1Database | undefined) {
    this.store = new TaskStore(db);
    this.receiptLogger = new ActionReceiptLogger(db);
    this.gate = new KaiPermissionGate(this.receiptLogger);
    this.pendingStore = new PendingActionStore(db);
    // Phase 7: Initialize ProofTrust Bridge and attach to gate
    this.proofTrustBridge = new ProofTrustBridgeLite(this.receiptLogger, this.gate);
    this.gate.setProofTrustBridge(this.proofTrustBridge);
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
  async executeAction(
    taskId: string,
    req: TaskActionRequest,
    receiptCtx?: OrchestratorReceiptContext,
  ): Promise<OrchestratorResponse> {
    // ── Phase 4: Route through the Permission Gate ──
    const gateInput = {
      appId: receiptCtx?.appId || 'unknown',
      userId: receiptCtx?.userId || req.userId,
      userRole: receiptCtx?.userRole || 'viewer',
      actionType: req.actionType,
      requestedAction: `Execute action: ${req.actionType}`,
      taskId,
      taskRiskLevel: undefined as string | undefined,
      sessionId: receiptCtx?.sessionId,
      source: 'task-orchestrator',
    };

    // Try to get task risk level for gate evaluation
    const task = await this.store.getTaskById(taskId);
    if (!task) {
      return { message: `Task "${taskId}" not found.` };
    }
    gateInput.taskRiskLevel = task.riskLevel;

    const gateDecision = this.gate.evaluate(gateInput);
    const gateMeta = this.gate.toGateMetadata(gateDecision);

    // ── Gate denied: blocked or high-risk ──
    if (!gateDecision.allowed) {
      // Receipt already logged by the gate for denied actions
      return {
        message: `⛔ ${gateDecision.reason}`,
        requiresConfirmation: false,
        gateDecision: toGateDecisionSummary(gateDecision),
      };
    }

    // ── Gate allowed but action not in SAFE_ACTIONS registry ──
    if (!SAFE_ACTIONS.has(req.actionType)) {
      return {
        message: `Action "${req.actionType}" is not in the approved safe actions list for v1.`,
        requiresConfirmation: false,
        gateDecision: toGateDecisionSummary(gateDecision),
      };
    }

    // Execute the action to get prepared output
    const result = executeSafeAction(req.actionType, task, req.context);

    // ── Phase 5: Medium-risk → pending confirmation workflow ──
    if (gateDecision.requiresConfirmation) {
      // Create pending action
      const pendingAction = await this.pendingStore.createPendingAction({
        appId: receiptCtx?.appId || 'unknown',
        userId: receiptCtx?.userId || req.userId,
        userRole: receiptCtx?.userRole || 'viewer',
        sessionId: receiptCtx?.sessionId,
        taskId,
        actionType: req.actionType,
        actionSummary: `Pending confirmation: ${req.actionType} for "${task.title}"`,
        preparedOutput: result.output,
        riskLevel: gateDecision.riskLevel,
        gateDecision,
        metadata: gateMeta,
      });

      // Log the action in task history as pending
      const action = await this.store.logAction({
        taskId,
        userId: req.userId,
        actionType: req.actionType,
        actionSummary: `Pending confirmation: ${req.actionType} for "${task.title}"`,
        approvalStatus: 'pending',
        result: result.output,
      });

      // Phase 7: Notify ProofTrust bridge of prepared action
      this.proofTrustBridge.recordPreparedAction({
        appId: receiptCtx?.appId || 'unknown',
        actorId: receiptCtx?.userId || req.userId,
        actorRole: receiptCtx?.userRole || 'viewer',
        actionType: req.actionType,
        actionSummary: `Pending confirmation: ${req.actionType} for "${task.title}"`,
        riskLevel: mapKaiRiskToProofTrust(gateDecision.riskLevel),
        sessionId: receiptCtx?.sessionId,
        taskId,
        source: 'task-orchestrator',
        metadata: { pendingActionId: pendingAction.id },
      }).catch(() => {});

      // Log prepared action receipt with gate metadata
      if (receiptCtx) {
        this.receiptLogger.logPreparedAction({
          appId: receiptCtx.appId,
          userId: receiptCtx.userId,
          userRole: receiptCtx.userRole,
          sessionId: receiptCtx.sessionId,
          source: 'task-orchestrator',
          taskId,
          actionType: req.actionType,
          actionSummary: `Pending confirmation: ${req.actionType} for "${task.title}"`,
          riskLevel: gateDecision.riskLevel,
          requiresConfirmation: true,
          approvalStatus: 'pending',
          metadata: { ...gateMeta, pendingActionId: pendingAction.id },
        }).catch(() => {});
      }

      this.logGeneratedOutputReceipt(req.actionType, task, receiptCtx, gateMeta);

      return {
        message: `Action "${req.actionType}" prepared for "${task.title}". Confirm or deny within ${Math.round((new Date(pendingAction.expires_at).getTime() - Date.now()) / 60000)} minutes.`,
        task,
        action,
        requiresConfirmation: true,
        explanation: result.output,
        gateDecision: toGateDecisionSummary(gateDecision),
        pendingActionId: pendingAction.id,
        pendingActionStatus: 'pending',
        expiresAt: pendingAction.expires_at,
      };
    }

    // ── Low-risk: Auto-execute ──
    const action = await this.store.logAction({
      taskId,
      userId: req.userId,
      actionType: req.actionType,
      actionSummary: `Executed: ${req.actionType} for "${task.title}"`,
      approvalStatus: 'auto',
      result: result.output,
    });

    // Log executed action receipt with gate metadata
    if (receiptCtx) {
      this.receiptLogger.logExecutedAction({
        appId: receiptCtx.appId,
        userId: receiptCtx.userId,
        userRole: receiptCtx.userRole,
        sessionId: receiptCtx.sessionId,
        source: 'task-orchestrator',
        taskId,
        actionType: req.actionType,
        actionSummary: `Executed: ${req.actionType} for "${task.title}"`,
        riskLevel: gateDecision.riskLevel,
        kaiResponse: result.output,
        metadata: gateMeta,
      }).catch(() => {});
    }

    this.logGeneratedOutputReceipt(req.actionType, task, receiptCtx, gateMeta);

    // Update task status if appropriate
    if (req.actionType === 'update_status') {
      await this.store.updateTaskStatus(taskId, 'in_progress');
    }

    return {
      message: `✅ Action completed: ${req.actionType} for "${task.title}".`,
      task,
      action,
      explanation: result.output,
      gateDecision: toGateDecisionSummary(gateDecision),
    };
  }

  // ── POST /api/kai/orchestrator/help-me-out ──
  async helpMeOut(userId: string, receiptCtx?: OrchestratorReceiptContext): Promise<OrchestratorResponse> {
    const task = await this.store.getTopActionableTask();
    if (!task) {
      return {
        message: "You're all caught up! No actionable tasks right now. 🎉",
      };
    }

    const explanation = this.explainTopTask(task);
    const suggestedAction = task.suggestedAction || 'generate_tasklet_prompt';

    // ── Phase 4: Pre-evaluate the suggested action through the gate ──
    let gateDecision: GateDecision | undefined;
    if (receiptCtx) {
      gateDecision = this.gate.evaluate({
        appId: receiptCtx.appId,
        userId: receiptCtx.userId,
        userRole: receiptCtx.userRole,
        actionType: suggestedAction,
        requestedAction: `Recommended action: ${suggestedAction}`,
        taskId: task.id,
        taskRiskLevel: task.riskLevel,
        sessionId: receiptCtx.sessionId,
        source: 'task-orchestrator',
      });
    }

    // Log recommendation receipt
    if (receiptCtx) {
      const gateMeta = gateDecision ? this.gate.toGateMetadata(gateDecision) : undefined;
      this.receiptLogger.logRecommendation({
        appId: receiptCtx.appId,
        userId: receiptCtx.userId,
        userRole: receiptCtx.userRole,
        sessionId: receiptCtx.sessionId,
        source: 'task-orchestrator',
        taskId: task.id,
        actionSummary: `Recommended top task: "${task.title}" — ${suggestedAction}`,
        riskLevel: gateDecision?.riskLevel || task.riskLevel,
        requiresConfirmation: gateDecision?.requiresConfirmation ?? task.riskLevel !== 'low',
        metadata: gateMeta,
      }).catch(() => {});
    }

    const riskInfo = gateDecision
      ? (gateDecision.allowed
        ? (gateDecision.requiresConfirmation
          ? `This requires your confirmation (risk: ${gateDecision.riskLevel}).`
          : 'This is a low-risk action — I can execute it now.')
        : `⚠️ ${gateDecision.reason}`)
      : (task.riskLevel === 'low'
        ? 'This is a low-risk action — I can execute it now.'
        : `This requires your confirmation (risk: ${task.riskLevel}).`);

    return {
      message: [
        `Your highest priority is **${task.title}**.`,
        explanation,
        '',
        `Recommended next action: **${suggestedAction}**.`,
        riskInfo,
        '',
        'Say "go ahead" to proceed, "skip this" to move on, or "show me more".',
      ].join('\n'),
      task,
      explanation,
      nextRecommendation: suggestedAction,
      requiresConfirmation: gateDecision?.requiresConfirmation ?? task.riskLevel !== 'low',
      gateDecision: gateDecision ? toGateDecisionSummary(gateDecision) : undefined,
    };
  }

  // ── POST /api/kai/orchestrator/next ──
  async doNext(userId: string, command: string, receiptCtx?: OrchestratorReceiptContext): Promise<OrchestratorResponse> {
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

        if (receiptCtx) {
          this.receiptLogger.logTaskStatusChange({
            appId: receiptCtx.appId,
            userId: receiptCtx.userId,
            userRole: receiptCtx.userRole,
            sessionId: receiptCtx.sessionId,
            source: 'task-orchestrator',
            taskId: task.id,
            actionType: 'update_status',
            actionSummary: `Skipped: "${task.title}"`,
          }).catch(() => {});
        }

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

        if (receiptCtx) {
          this.receiptLogger.logTaskStatusChange({
            appId: receiptCtx.appId,
            userId: receiptCtx.userId,
            userRole: receiptCtx.userRole,
            sessionId: receiptCtx.sessionId,
            source: 'task-orchestrator',
            taskId: task.id,
            actionType: 'update_status',
            actionSummary: `Completed: "${task.title}"`,
          }).catch(() => {});
        }

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

      // ── Phase 4: Gate check before executing via doNext ──
      if (SAFE_ACTIONS.has(actionType)) {
        // executeAction will run the gate internally
        return this.executeAction(task.id, { actionType, userId }, receiptCtx);
      }

      // Not a safe action — gate it explicitly
      if (receiptCtx) {
        const gateDecision = this.gate.evaluate({
          appId: receiptCtx.appId,
          userId: receiptCtx.userId,
          userRole: receiptCtx.userRole,
          actionType,
          requestedAction: `doNext: ${actionType}`,
          taskId: task.id,
          taskRiskLevel: task.riskLevel,
          sessionId: receiptCtx.sessionId,
          source: 'task-orchestrator',
        });

        if (!gateDecision.allowed) {
          return {
            message: `⛔ ${gateDecision.reason}`,
            task,
            requiresConfirmation: false,
            gateDecision: toGateDecisionSummary(gateDecision),
          };
        }
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
      return this.executeAction(task.id, { actionType: 'generate_tasklet_prompt', userId }, receiptCtx);
    }

    // ── "summarize blockers" ──
    if (/summarize\s*blocker/i.test(normalized)) {
      const task = await this.store.getTopActionableTask();
      if (!task) return { message: 'No active blockers found.' };
      return this.executeAction(task.id, { actionType: 'summarize_blockers', userId }, receiptCtx);
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
      return this.helpMeOut(userId, receiptCtx);
    }

    // Default: treat as help-me-out
    return this.helpMeOut(userId, receiptCtx);
  }

  // ── Phase 5: Confirm a pending action ──
  async confirmPendingAction(
    pendingActionId: string,
    receiptCtx: OrchestratorReceiptContext,
  ): Promise<OrchestratorResponse> {
    // Step 1: Confirm in the pending store (checks ownership/expiration)
    const confirmResult = await this.pendingStore.confirmPendingAction(
      pendingActionId,
      { userId: receiptCtx.userId, userRole: receiptCtx.userRole },
    );

    if (!confirmResult.success || !confirmResult.pendingAction) {
      // If expired, log an expiration receipt
      if (confirmResult.pendingAction?.status === 'expired') {
        this.logExpiredReceipt(confirmResult.pendingAction, receiptCtx);
      }
      return {
        message: `⛔ ${confirmResult.reason}`,
        pendingActionStatus: confirmResult.pendingAction?.status,
      };
    }

    const pa = confirmResult.pendingAction;

    // Step 2: Re-run the Permission Gate before executing
    const gateDecision = this.gate.evaluate({
      appId: pa.app_id,
      userId: receiptCtx.userId,
      userRole: receiptCtx.userRole,
      actionType: pa.action_type,
      requestedAction: `Confirm pending action: ${pa.action_type}`,
      taskId: pa.task_id || undefined,
      sessionId: pa.session_id || undefined,
      source: 'pending-confirmation',
    });

    // Step 3: If gate decision changed (no longer allowed or risk escalated), block
    if (!gateDecision.allowed) {
      // Revert to denied since gate no longer allows it
      await this.pendingStore.denyPendingAction(
        pendingActionId,
        { userId: 'system', userRole: 'super-admin' },
      );

      this.receiptLogger.logDeniedAction({
        appId: pa.app_id,
        userId: pa.user_id,
        userRole: pa.user_role,
        sessionId: pa.session_id || undefined,
        source: 'pending-confirmation',
        taskId: pa.task_id || undefined,
        actionType: pa.action_type,
        actionSummary: `Gate re-evaluation denied: ${pa.action_type}`,
        riskLevel: gateDecision.riskLevel,
        pendingActionId: pa.id,
        deniedBy: 'system-gate-recheck',
      }).catch(() => {});

      return {
        message: `⛔ Gate re-evaluation denied this action: ${gateDecision.reason}`,
        pendingActionStatus: 'denied',
        gateDecision: toGateDecisionSummary(gateDecision),
      };
    }

    // Step 4: Execute the action
    await this.pendingStore.markExecuted(pendingActionId);

    // Phase 7: Notify ProofTrust bridge of confirmation + execution
    this.notifyBridgeEvent(pa, 'confirmed', receiptCtx);
    this.notifyBridgeEvent(pa, 'executed', receiptCtx);

    // Log confirmed receipt
    this.receiptLogger.logConfirmedAction({
      appId: pa.app_id,
      userId: pa.user_id,
      userRole: pa.user_role,
      sessionId: pa.session_id || undefined,
      source: 'pending-confirmation',
      taskId: pa.task_id || undefined,
      actionType: pa.action_type,
      actionSummary: `Confirmed and executed: ${pa.action_type}`,
      riskLevel: pa.risk_level,
      pendingActionId: pa.id,
      confirmedBy: receiptCtx.userId,
    }).catch(() => {});

    // Log executed receipt
    this.receiptLogger.logExecutedAction({
      appId: pa.app_id,
      userId: pa.user_id,
      userRole: pa.user_role,
      sessionId: pa.session_id || undefined,
      source: 'pending-confirmation',
      taskId: pa.task_id || undefined,
      actionType: pa.action_type,
      actionSummary: `Executed after confirmation: ${pa.action_type}`,
      riskLevel: pa.risk_level,
      kaiResponse: pa.prepared_output || undefined,
      metadata: {
        pendingActionId: pa.id,
        confirmedBy: receiptCtx.userId,
        ...this.gate.toGateMetadata(gateDecision),
      },
    }).catch(() => {});

    return {
      message: `✅ Action "${pa.action_type}" confirmed and executed.`,
      explanation: pa.prepared_output || undefined,
      pendingActionId: pa.id,
      pendingActionStatus: 'executed',
      gateDecision: toGateDecisionSummary(gateDecision),
    };
  }

  // ── Phase 5: Deny a pending action ──
  async denyPendingAction(
    pendingActionId: string,
    receiptCtx: OrchestratorReceiptContext,
  ): Promise<OrchestratorResponse> {
    const denyResult = await this.pendingStore.denyPendingAction(
      pendingActionId,
      { userId: receiptCtx.userId, userRole: receiptCtx.userRole },
    );

    if (!denyResult.success || !denyResult.pendingAction) {
      return {
        message: `⛔ ${denyResult.reason}`,
        pendingActionStatus: denyResult.pendingAction?.status,
      };
    }

    const pa = denyResult.pendingAction;

    // Phase 7: Notify ProofTrust bridge of denial
    this.notifyBridgeEvent(pa, 'denied', receiptCtx);

    // Log denial receipt
    this.receiptLogger.logDeniedAction({
      appId: pa.app_id,
      userId: pa.user_id,
      userRole: pa.user_role,
      sessionId: pa.session_id || undefined,
      source: 'pending-confirmation',
      taskId: pa.task_id || undefined,
      actionType: pa.action_type,
      actionSummary: `Denied: ${pa.action_type}`,
      riskLevel: pa.risk_level,
      pendingActionId: pa.id,
      deniedBy: receiptCtx.userId,
    }).catch(() => {});

    return {
      message: `Action "${pa.action_type}" has been denied.`,
      pendingActionId: pa.id,
      pendingActionStatus: 'denied',
    };
  }

  // ── Get recent actions for the history log ──
  async getRecentActions(limit = 20): Promise<OrchestratorResponse> {
    const actions = await this.store.getRecentActions(limit);
    return {
      message: `${actions.length} recent action${actions.length !== 1 ? 's' : ''}.`,
      tasks: [],
    };
  }

  // ── Receipt logger accessor (for the API route) ──
  getReceiptLogger(): ActionReceiptLogger {
    return this.receiptLogger;
  }

  // ── Permission gate accessor (for the API route / tests) ──
  getPermissionGate(): KaiPermissionGate {
    return this.gate;
  }

  // ── Pending action store accessor (for the API route) ──
  getPendingStore(): PendingActionStore {
    return this.pendingStore;
  }

  // ── Phase 7: ProofTrust bridge accessor ──
  getProofTrustBridge(): ProofTrustBridgeLite {
    return this.proofTrustBridge;
  }

  // ── Helpers ──

  /** Log expiration receipt (fire-and-forget) */
  private logExpiredReceipt(pa: PendingActionRow, receiptCtx: OrchestratorReceiptContext): void {
    // Phase 7: Notify ProofTrust bridge of expiration
    this.notifyBridgeEvent(pa, 'expired', receiptCtx);

    this.receiptLogger.logExpiredAction({
      appId: pa.app_id,
      userId: pa.user_id,
      userRole: pa.user_role,
      sessionId: pa.session_id || undefined,
      source: 'pending-confirmation',
      taskId: pa.task_id || undefined,
      actionType: pa.action_type,
      actionSummary: `Expired: ${pa.action_type}`,
      riskLevel: pa.risk_level,
      pendingActionId: pa.id,
    }).catch(() => {});
  }

  /** Log generated output receipt for specific action types. */
  private logGeneratedOutputReceipt(
    actionType: string,
    task: KaiTask,
    receiptCtx?: OrchestratorReceiptContext,
    gateMeta?: Record<string, unknown>,
  ): void {
    if (!receiptCtx) return;

    const typeMap: Record<string, 'kai_tasklet_prompt_generated' | 'kai_blocker_summary_generated'
      | 'kai_admin_note_drafted' | 'kai_user_message_drafted' | 'kai_github_issue_drafted'> = {
      'generate_tasklet_prompt': 'kai_tasklet_prompt_generated',
      'summarize_blockers': 'kai_blocker_summary_generated',
      'draft_admin_note': 'kai_admin_note_drafted',
      'draft_user_message': 'kai_user_message_drafted',
      'draft_github_issue': 'kai_github_issue_drafted',
    };

    const receiptType = typeMap[actionType];
    if (!receiptType) return;

    this.receiptLogger.logGeneratedOutput({
      appId: receiptCtx.appId,
      userId: receiptCtx.userId,
      userRole: receiptCtx.userRole,
      sessionId: receiptCtx.sessionId,
      source: 'task-orchestrator',
      taskId: task.id,
      receiptType,
      actionType,
      actionSummary: `Generated ${actionType} for "${task.title}"`,
      riskLevel: task.riskLevel,
      metadata: gateMeta,
    }).catch(() => {});
  }

  /**
   * Phase 7: Send a lifecycle event to the ProofTrust bridge.
   * Fire-and-forget — never blocks the user operation.
   */
  private notifyBridgeEvent(
    pa: PendingActionRow,
    event: 'prepared' | 'confirmed' | 'denied' | 'expired' | 'executed',
    receiptCtx: OrchestratorReceiptContext,
  ): void {
    const input = {
      appId: pa.app_id,
      actorId: pa.user_id,
      actorRole: pa.user_role,
      actionType: pa.action_type,
      actionSummary: `${event}: ${pa.action_type}`,
      riskLevel: mapKaiRiskToProofTrust(pa.risk_level) as ProofTrustRiskLevel,
      sessionId: pa.session_id || undefined,
      taskId: pa.task_id || undefined,
      source: 'pending-confirmation',
      metadata: { pendingActionId: pa.id },
    };

    const methodMap = {
      prepared: () => this.proofTrustBridge.recordPreparedAction(input),
      confirmed: () => this.proofTrustBridge.recordConfirmedAction(input),
      denied: () => this.proofTrustBridge.recordDeniedAction(input),
      expired: () => this.proofTrustBridge.recordExpiredAction(input),
      executed: () => this.proofTrustBridge.recordExecutedAction(input),
    };

    methodMap[event]().catch(() => {});
  }

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
