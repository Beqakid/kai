// ── ProofTrust Bridge Types ──
//
// Phase 7: Generic, reusable types for the ProofTrust Bridge interface.
//
// These types are designed to be app-agnostic. No Carehia, Viliniu, Volau,
// or Jon Command Center-specific logic is encoded here. Future app-specific
// rule packs will extend these types without modifying them.
//
// Safety:
// - No tokens, secrets, raw audio, or private documents in metadata.
// - No fields that encode app-specific business rules.

// ── Identity Types ──

/** Application identifier — matches Kai's existing AppId type */
export type ProofTrustAppId = string;

/** Optional tenant/organization identifier for multi-tenant apps */
export type ProofTrustTenantId = string;

/** Actor who performed or requested the action */
export interface ProofTrustActor {
  actorId: string;
  actorRole: string;
  actorWorkspace?: string;
}

/** Target of the action (e.g. a task, user, record) */
export interface ProofTrustTarget {
  targetType?: string;
  targetId?: string;
}

// ── Enums ──

/** Receipt types — mapped from existing Kai receipt types */
export const PROOFTRUST_RECEIPT_TYPES = [
  'ai_recommendation_generated',
  'ai_action_prepared',
  'ai_action_confirmed',
  'ai_action_denied',
  'ai_action_expired',
  'ai_action_executed',
  'ai_action_blocked',
  'ai_risk_warning',
  'ai_explanation_generated',
  'task_status_changed',
  'tasklet_prompt_generated',
  'blocker_summary_generated',
  'admin_note_drafted',
  'user_message_drafted',
  'github_issue_drafted',
] as const;

export type ProofTrustReceiptType = (typeof PROOFTRUST_RECEIPT_TYPES)[number];

/** Risk levels — aligned with Kai's existing risk classification */
export const PROOFTRUST_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'blocked',
] as const;

export type ProofTrustRiskLevel = (typeof PROOFTRUST_RISK_LEVELS)[number];

/** Decisions the bridge can return */
export const PROOFTRUST_DECISIONS = [
  'allow',
  'deny',
  'requiresConfirmation',
  'requiresAdminApproval',
] as const;

export type ProofTrustDecision = (typeof PROOFTRUST_DECISIONS)[number];

// ── Input Types ──

/** Input for creating a ProofTrust-shaped receipt */
export interface ProofTrustReceiptInput {
  appId: ProofTrustAppId;
  tenantId?: ProofTrustTenantId;
  project?: string;
  actorId: string;
  actorRole: string;
  actorWorkspace?: string;
  actionType: string;
  actionSummary: string;
  targetType?: string;
  targetId?: string;
  source: string;
  riskLevel: ProofTrustRiskLevel;
  decision: ProofTrustDecision;
  reason: string;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  receiptType: ProofTrustReceiptType;
  sessionId?: string;
  taskId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/** Input for evaluating an action through the bridge */
export interface ProofTrustActionInput {
  appId: ProofTrustAppId;
  tenantId?: ProofTrustTenantId;
  project?: string;
  actorId: string;
  actorRole: string;
  actorWorkspace?: string;
  actionType: string;
  actionSummary?: string;
  targetType?: string;
  targetId?: string;
  source?: string;
  riskLevel: ProofTrustRiskLevel;
  sessionId?: string;
  taskId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/** Input for requiring approval */
export interface ProofTrustApprovalRequest {
  appId: ProofTrustAppId;
  tenantId?: ProofTrustTenantId;
  project?: string;
  actorId: string;
  actorRole: string;
  actionType: string;
  actionSummary: string;
  targetType?: string;
  targetId?: string;
  riskLevel: ProofTrustRiskLevel;
  reason: string;
  sessionId?: string;
  taskId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

// ── Output Types ──

/** Result of evaluating an action through the bridge */
export interface ProofTrustEvaluationResult {
  decision: ProofTrustDecision;
  riskLevel: ProofTrustRiskLevel;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  reason: string;
  bridgeMode: 'lite' | 'full';
}

/** Trust status for the bridge system */
export interface ProofTrustTrustStatus {
  bridgeMode: 'lite' | 'full';
  engineConnected: boolean;
  receiptBackend: string;
  supportedApps: ProofTrustAppId[];
  supportedReceiptTypes: readonly string[];
  supportedRiskLevels: readonly string[];
  proofTrustBridgeVersion: string;
  note: string;
}

// ── Mapping Helpers ──

/** Map from Kai receipt types to ProofTrust receipt types */
export const KAI_TO_PROOFTRUST_RECEIPT_MAP: Record<string, ProofTrustReceiptType> = {
  'kai_recommendation_generated': 'ai_recommendation_generated',
  'kai_action_prepared': 'ai_action_prepared',
  'kai_action_confirmed': 'ai_action_confirmed',
  'kai_action_denied': 'ai_action_denied',
  'kai_action_expired': 'ai_action_expired',
  'kai_action_executed': 'ai_action_executed',
  'kai_action_blocked': 'ai_action_blocked',
  'kai_risk_warning': 'ai_risk_warning',
  'kai_explanation_generated': 'ai_explanation_generated',
  'kai_task_status_changed': 'task_status_changed',
  'kai_tasklet_prompt_generated': 'tasklet_prompt_generated',
  'kai_blocker_summary_generated': 'blocker_summary_generated',
  'kai_admin_note_drafted': 'admin_note_drafted',
  'kai_user_message_drafted': 'user_message_drafted',
  'kai_github_issue_drafted': 'github_issue_drafted',
  'kai_escalated_to_admin': 'ai_action_blocked',
};

/** Map from Kai gate risk levels to ProofTrust risk levels */
export function mapKaiRiskToProofTrust(kaiRisk: string): ProofTrustRiskLevel {
  switch (kaiRisk) {
    case 'low':
    case 'safe':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'blocked':
      return 'blocked';
    default:
      return 'medium';
  }
}

/** Map a Kai gate decision to a ProofTrust decision */
export function mapKaiGateDecisionToProofTrust(gate: {
  allowed: boolean;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  riskLevel: string;
}): ProofTrustDecision {
  if (!gate.allowed) {
    if (gate.requiresAdminApproval) return 'requiresAdminApproval';
    return 'deny';
  }
  if (gate.requiresConfirmation) return 'requiresConfirmation';
  return 'allow';
}

// ── Sensitive Data Guard ──

/** Keys that must NEVER appear in ProofTrust metadata */
const FORBIDDEN_METADATA_KEYS = new Set([
  'token', 'secret', 'password', 'apiKey', 'api_key',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'rawAudio', 'raw_audio', 'audioData', 'audio_data',
  'privateDocument', 'private_document', 'ssn', 'creditCard',
  'credit_card', 'bankAccount', 'bank_account',
]);

/**
 * Strip forbidden keys from metadata to prevent sensitive data leakage.
 * Returns a new object without the forbidden keys.
 */
export function sanitizeProofTrustMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!FORBIDDEN_METADATA_KEYS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}
