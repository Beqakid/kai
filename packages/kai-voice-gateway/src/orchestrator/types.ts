// ── Kai Task Orchestrator — Types ──

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskSeverity = 'critical' | 'urgent' | 'normal' | 'minor';
export type TaskStatus = 'open' | 'in_progress' | 'waiting_approval' | 'done' | 'skipped';
export type TaskSource = 'phase_data' | 'admin_note' | 'kai_recommendation' | 'error_summary' | 'user_feedback' | 'manual' | 'github' | 'tasklet';
export type TaskRiskLevel = 'low' | 'medium' | 'high' | 'blocked';
export type ActionType = 'generate_tasklet_prompt' | 'draft_github_issue' | 'create_task' | 'update_status' | 'mark_reviewed' | 'summarize_blockers' | 'draft_admin_note' | 'draft_user_message';
export type ApprovalStatus = 'auto' | 'pending' | 'approved' | 'denied';

export interface KaiTask {
  id: string;
  appId: string;
  project: string | null;
  title: string;
  description: string | null;
  source: TaskSource;
  priority: TaskPriority;
  severity: TaskSeverity;
  status: TaskStatus;
  suggestedAction: string | null;
  riskLevel: TaskRiskLevel;
  requiresConfirmation: boolean;
  score: number;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KaiTaskAction {
  id: string;
  taskId: string;
  userId: string;
  actionType: ActionType;
  actionSummary: string | null;
  approvalStatus: ApprovalStatus;
  result: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface KaiRecommendation {
  id: string;
  appId: string;
  project: string | null;
  recommendationType: string;
  title: string;
  evidence: string | null;
  severity: TaskSeverity;
  suggestedFix: string | null;
  riskLevel: TaskRiskLevel;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Priority scoring weights */
export interface PriorityWeights {
  userBlocking: number;      // 0-10: blocks end users
  launchBlocking: number;    // 0-10: blocks launch
  securityRisk: number;      // 0-10: security/compliance
  revenueImpact: number;     // 0-10: affects revenue
  affectedUsers: number;     // 0-10: scope of impact
  dependencyImportance: number; // 0-10: other tasks depend on this
  founderUrgency: number;    // 0-10: founder flagged
  estimatedEffort: number;   // 0-10: inverse (10 = quick win, 1 = massive)
}

export interface CreateTaskRequest {
  appId: string;
  project?: string;
  title: string;
  description?: string;
  source?: TaskSource;
  priority?: TaskPriority;
  severity?: TaskSeverity;
  suggestedAction?: string;
  riskLevel?: TaskRiskLevel;
  requiresConfirmation?: boolean;
  weights?: Partial<PriorityWeights>;
  metadataJson?: string;
}

export interface TaskActionRequest {
  actionType: ActionType;
  userId: string;
  context?: Record<string, unknown>;
}

export interface OrchestratorResponse {
  message: string;
  task?: KaiTask;
  action?: KaiTaskAction;
  tasks?: KaiTask[];
  explanation?: string;
  nextRecommendation?: string;
  requiresConfirmation?: boolean;
}

/** Safe actions Kai can auto-execute in v1 */
export const SAFE_ACTIONS: ReadonlySet<ActionType> = new Set([
  'generate_tasklet_prompt',
  'draft_github_issue',
  'create_task',
  'update_status',
  'mark_reviewed',
  'summarize_blockers',
  'draft_admin_note',
  'draft_user_message',
]);

/** Blocked actions — Kai must NEVER perform these */
export const BLOCKED_ACTIONS_V1 = new Set([
  'deploy_code',
  'modify_production_schema',
  'delete_user',
  'process_payment',
  'issue_refund',
  'change_payout',
  'change_bank_details',
  'approve_background_check',
  'approve_identity_verification',
  'send_external_email',
  'change_compliance_settings',
  'modify_security_rules',
]);

/** Actions that require confirmation even if technically safe */
export const CONFIRMATION_REQUIRED_ACTIONS: ReadonlySet<ActionType> = new Set([
  'draft_user_message',
  'draft_github_issue',
]);
