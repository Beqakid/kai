// ── Kai Permission and Risk Gate ──
//
// Phase 4: Central permission/risk decision layer.
// Every Kai action must pass through this gate before it is prepared,
// executed, blocked, escalated, or logged.
//
// The gate sits between user intent and Kai action execution. It:
// - Enforces the BLOCKED_ACTIONS_V1 blocklist (always)
// - Rejects unknown/unrecognized actions
// - Classifies safe actions by risk level
// - Requires confirmation for medium-risk actions
// - Requires admin approval (and denies) high-risk actions
// - Never trusts client-provided allowedActions — intersects with server registry
// - Creates receipts for every denied action
//
// Safety invariants:
// - Sensitive actions remain blocked in Kai v1.
// - High-risk actions do not execute.
// - Blocked actions always fail.

import { AppId, UserRole, ALLOWED_ACTIONS_REGISTRY } from '../types';
import { BLOCKED_ACTIONS_V1 } from '../orchestrator/types';
import { ActionReceiptLogger } from './action-receipt-logger';

// ── Extended blocked actions (Phase 4 — superset of BLOCKED_ACTIONS_V1) ──

export const BLOCKED_ACTIONS_GATE = new Set([
  // Original BLOCKED_ACTIONS_V1
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
  // Additional Phase 4 blocked actions
  'grant_admin',
  'revoke_access',
  'transfer_funds',
  'delete_database',
  'truncate_table',
]);

// ── Risk classification maps ──

/** Low-risk actions that can auto-execute */
export const LOW_RISK_ACTIONS = new Set([
  'generate_tasklet_prompt',
  'summarize_blockers',
  'draft_admin_note',
  'mark_reviewed',
]);

/** Medium-risk actions that require user confirmation */
export const MEDIUM_RISK_ACTIONS = new Set([
  'draft_github_issue',
  'draft_user_message',
  'update_status',
  'create_task',
]);

/** High-risk actions — never execute through Kai v1 */
export const HIGH_RISK_ACTIONS = new Set([
  'change_user_permissions',
  'modify_production_state',
  'escalate_to_external',
  'bulk_update_records',
  'override_safety_rules',
  'modify_auth_config',
  'change_feature_flags',
  'modify_rate_limits',
]);

// All known actions = low + medium + high
const ALL_KNOWN_ACTIONS = new Set([
  ...LOW_RISK_ACTIONS,
  ...MEDIUM_RISK_ACTIONS,
  ...HIGH_RISK_ACTIONS,
]);

// ── Gate Types ──

export type GateRiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface GateInput {
  appId: string;
  userId: string;
  userRole: string;
  actionType: string;
  requestedAction: string;
  taskId?: string;
  taskRiskLevel?: string;
  allowedActions?: string[];
  currentScreen?: string;
  source?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GateDecision {
  allowed: boolean;
  riskLevel: GateRiskLevel;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  reason: string;
  recommendedFallback: string;
  receiptType: string;
  blockedReason: string | null;
}

/** Gate metadata to attach to receipts */
export interface GateMetadata {
  gateAllowed: boolean;
  gateRiskLevel: GateRiskLevel;
  gateReason: string;
  gateRequiresConfirmation: boolean;
  gateRequiresAdminApproval: boolean;
  [key: string]: unknown;
}

// ── Main Service ──

export class KaiPermissionGate {
  private readonly receiptLogger: ActionReceiptLogger | undefined;

  constructor(receiptLogger?: ActionReceiptLogger) {
    this.receiptLogger = receiptLogger;
  }

  /**
   * Evaluate whether an action is permitted.
   *
   * This is the single entry point — every Kai action must call this
   * before preparing, executing, blocking, or logging.
   */
  evaluate(input: GateInput): GateDecision {
    const normalizedAction = input.actionType.toLowerCase().replace(/\s+/g, '_');

    // ── Rule 1: Blocked actions always fail ──
    if (BLOCKED_ACTIONS_GATE.has(normalizedAction) || BLOCKED_ACTIONS_V1.has(normalizedAction)) {
      const decision: GateDecision = {
        allowed: false,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        requiresAdminApproval: false,
        reason: `Action "${input.actionType}" is permanently blocked in Kai v1 for safety.`,
        recommendedFallback: 'Use the platform UI to perform this action manually.',
        receiptType: 'kai_action_blocked',
        blockedReason: `Blocked action: ${input.actionType}`,
      };

      this.logDeniedReceipt(input, decision);
      return decision;
    }

    // ── Rule 2: Unknown actions fail ──
    if (!ALL_KNOWN_ACTIONS.has(normalizedAction)) {
      const decision: GateDecision = {
        allowed: false,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        requiresAdminApproval: false,
        reason: `Action "${input.actionType}" is not recognized. Unknown actions are blocked by default.`,
        recommendedFallback: 'Ask Kai what actions are available, or use the platform UI.',
        receiptType: 'kai_action_blocked',
        blockedReason: `Unknown action: ${input.actionType}`,
      };

      this.logDeniedReceipt(input, decision);
      return decision;
    }

    // ── Rule 6: Validate allowedActions server-side ──
    // Never trust client-provided allowedActions. Intersect with server registry.
    if (!this.isActionPermittedForRole(normalizedAction, input.appId, input.userRole)) {
      const decision: GateDecision = {
        allowed: false,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        requiresAdminApproval: false,
        reason: `Action "${input.actionType}" is not permitted for role "${input.userRole}" in app "${input.appId}".`,
        recommendedFallback: 'Contact an admin if you believe you should have access.',
        receiptType: 'kai_action_blocked',
        blockedReason: `Role not permitted: ${input.userRole} cannot ${input.actionType} in ${input.appId}`,
      };

      this.logDeniedReceipt(input, decision);
      return decision;
    }

    // ── Rule 5: High-risk actions require admin approval and do NOT execute ──
    if (HIGH_RISK_ACTIONS.has(normalizedAction)) {
      const decision: GateDecision = {
        allowed: false,
        riskLevel: 'high',
        requiresConfirmation: false,
        requiresAdminApproval: true,
        reason: `Action "${input.actionType}" is high-risk and requires manual admin approval. Kai v1 cannot execute high-risk actions.`,
        recommendedFallback: 'Manual admin approval required. Use the platform UI.',
        receiptType: 'kai_escalated_to_admin',
        blockedReason: null,
      };

      this.logDeniedReceipt(input, decision);
      return decision;
    }

    // ── Rule 4: Medium-risk actions require confirmation ──
    if (MEDIUM_RISK_ACTIONS.has(normalizedAction) || this.isElevatedByTaskRisk(normalizedAction, input.taskRiskLevel)) {
      return {
        allowed: true,
        riskLevel: 'medium',
        requiresConfirmation: true,
        requiresAdminApproval: false,
        reason: `Action "${input.actionType}" is medium-risk and requires confirmation before execution.`,
        recommendedFallback: 'Review the drafted output before confirming.',
        receiptType: 'kai_action_prepared',
        blockedReason: null,
      };
    }

    // ── Rule 3: Safe low-risk actions may execute ──
    return {
      allowed: true,
      riskLevel: 'low',
      requiresConfirmation: false,
      requiresAdminApproval: false,
      reason: `Action "${input.actionType}" is low-risk and approved for auto-execution.`,
      recommendedFallback: '',
      receiptType: 'kai_action_executed',
      blockedReason: null,
    };
  }

  /**
   * Evaluate a natural-language request for sensitive content.
   * Returns a gate-style decision if the request is sensitive.
   */
  evaluateNaturalLanguage(input: {
    transcript: string;
    appId: string;
    userId: string;
    userRole: string;
    sessionId?: string;
  }): GateDecision | null {
    const normalizedTranscript = input.transcript.toLowerCase();

    // Check for blocked action patterns in natural language
    const blockedPatterns: Array<{ pattern: RegExp; action: string }> = [
      { pattern: /\b(delete|remove|drop)\s+(all\s+)?(user|account|data|table|database)/i, action: 'delete_user' },
      { pattern: /\b(process|make|issue)\s+(a\s+)?(payment|refund|payout|transfer)/i, action: 'process_payment' },
      { pattern: /\b(change|update|modify)\s+(bank|payout|billing)\s*(detail|info|account)/i, action: 'change_bank_details' },
      { pattern: /\b(deploy|push)\s+(\w+\s+)*(to\s+)?(prod|production|live)/i, action: 'deploy_code' },
      { pattern: /\b(approve|verify)\s+(background|identity|id)\s*(check|verification)/i, action: 'approve_background_check' },
      { pattern: /\b(grant|give)\s+(admin|superadmin|root)\s*(access|role|permission)/i, action: 'grant_admin' },
      { pattern: /\b(truncate|wipe|purge)\s+(table|data|record)/i, action: 'truncate_table' },
      { pattern: /\b(transfer)\s+(fund|money|balance)/i, action: 'transfer_funds' },
      { pattern: /\b(revoke)\s+(access|permission|role)/i, action: 'revoke_access' },
    ];

    for (const { pattern, action } of blockedPatterns) {
      if (pattern.test(input.transcript)) {
        const decision: GateDecision = {
          allowed: false,
          riskLevel: 'blocked',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          reason: `Sensitive action detected in natural language: "${action}". This action is blocked in Kai v1.`,
          recommendedFallback: 'Use the platform UI to perform this action manually.',
          receiptType: 'kai_action_blocked',
          blockedReason: `NL-detected blocked action: ${action}`,
        };

        this.logDeniedReceipt(
          {
            appId: input.appId,
            userId: input.userId,
            userRole: input.userRole,
            actionType: action,
            requestedAction: input.transcript,
            sessionId: input.sessionId,
            source: 'kai-core-nl',
          },
          decision,
        );

        return decision;
      }
    }

    // Check for high-risk patterns
    const highRiskPatterns = [
      /\b(change|modify|update)\s+(user\s+)?(permission|role|access)/i,
      /\b(bulk|mass)\s+(update|delete|modify|change)/i,
      /\b(override|bypass|disable)\s+(safety|security|rule|gate)/i,
    ];

    for (const pattern of highRiskPatterns) {
      if (pattern.test(input.transcript)) {
        const decision: GateDecision = {
          allowed: false,
          riskLevel: 'high',
          requiresConfirmation: false,
          requiresAdminApproval: true,
          reason: 'This request involves high-risk operations that require manual admin approval.',
          recommendedFallback: 'Manual admin approval required. Use the platform UI.',
          receiptType: 'kai_escalated_to_admin',
          blockedReason: null,
        };

        this.logDeniedReceipt(
          {
            appId: input.appId,
            userId: input.userId,
            userRole: input.userRole,
            actionType: 'high_risk_nl_request',
            requestedAction: input.transcript,
            sessionId: input.sessionId,
            source: 'kai-core-nl',
          },
          decision,
        );

        return decision;
      }
    }

    return null; // No sensitive content detected
  }

  /**
   * Extract gate metadata for receipt logging.
   */
  toGateMetadata(decision: GateDecision): GateMetadata {
    return {
      gateAllowed: decision.allowed,
      gateRiskLevel: decision.riskLevel,
      gateReason: decision.reason,
      gateRequiresConfirmation: decision.requiresConfirmation,
      gateRequiresAdminApproval: decision.requiresAdminApproval,
    };
  }

  // ── Private helpers ──

  /**
   * Check whether the action is permitted for the given role via
   * the server-side ALLOWED_ACTIONS_REGISTRY.
   *
   * For task orchestrator actions (low/medium risk safe actions),
   * we check if the user's role has task-related permissions.
   */
  private isActionPermittedForRole(
    actionType: string,
    appId: string,
    userRole: string,
  ): boolean {
    const registry = ALLOWED_ACTIONS_REGISTRY[appId as AppId];
    if (!registry) {
      // Unknown app — allow through (the app validation happens elsewhere)
      return true;
    }

    const roleActions = registry[userRole as UserRole];
    if (!roleActions) {
      return false;
    }

    // Direct match in the registry
    if (roleActions.includes(actionType)) {
      return true;
    }

    // Map task orchestrator actions to registry capabilities
    const taskActionMap: Record<string, string[]> = {
      'generate_tasklet_prompt': ['execute_task_action', 'help_me_out'],
      'summarize_blockers': ['summarize_blockers', 'execute_task_action', 'help_me_out'],
      'draft_admin_note': ['execute_task_action', 'help_me_out'],
      'mark_reviewed': ['execute_task_action', 'help_me_out'],
      'draft_github_issue': ['execute_task_action', 'help_me_out'],
      'draft_user_message': ['execute_task_action', 'help_me_out'],
      'update_status': ['execute_task_action', 'help_me_out'],
      'create_task': ['create_task', 'execute_task_action'],
    };

    const mappedCapabilities = taskActionMap[actionType];
    if (mappedCapabilities) {
      return mappedCapabilities.some(cap => roleActions.includes(cap));
    }

    // For high-risk actions, they are rejected before reaching here,
    // but if they somehow get here, only super-admin could have them
    if (HIGH_RISK_ACTIONS.has(actionType)) {
      return userRole === 'super-admin';
    }

    return false;
  }

  /**
   * Check if a normally low-risk action is elevated to medium risk
   * because the associated task has a medium or higher risk level.
   */
  private isElevatedByTaskRisk(actionType: string, taskRiskLevel?: string): boolean {
    if (!taskRiskLevel) return false;

    // If the task itself is medium/high risk, elevate low-risk actions to medium
    if (LOW_RISK_ACTIONS.has(actionType) && (taskRiskLevel === 'medium' || taskRiskLevel === 'high')) {
      return true;
    }

    return false;
  }

  /**
   * Log a receipt for any denied action (blocked, unknown, high-risk, role-denied).
   * Fire-and-forget — never throws.
   */
  private logDeniedReceipt(input: GateInput, decision: GateDecision): void {
    if (!this.receiptLogger) return;

    const gateMetadata = this.toGateMetadata(decision);

    if (decision.riskLevel === 'blocked') {
      this.receiptLogger.logBlockedAction({
        appId: input.appId,
        userId: input.userId,
        userRole: input.userRole,
        sessionId: input.sessionId,
        source: input.source || 'permission-gate',
        actionType: input.actionType,
        taskId: input.taskId,
        userIntent: input.requestedAction,
        blockedReason: decision.blockedReason || decision.reason,
        riskLevel: 'blocked',
        metadata: { ...input.metadata, ...gateMetadata },
      }).catch(() => {});
    } else if (decision.riskLevel === 'high') {
      this.receiptLogger.logEscalation({
        appId: input.appId,
        userId: input.userId,
        userRole: input.userRole,
        sessionId: input.sessionId,
        source: input.source || 'permission-gate',
        taskId: input.taskId,
        actionSummary: `High-risk action denied: ${input.actionType}`,
        riskLevel: 'high',
        kaiResponse: decision.reason,
        metadata: { ...input.metadata, ...gateMetadata },
      }).catch(() => {});
    }
  }
}
