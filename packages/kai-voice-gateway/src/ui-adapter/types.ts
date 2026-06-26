// ── Kai UI Adapter — Types ──
//
// Phase 11 Phase 3: Cross-app UI adapter contract types.
// Defines the request/response shapes for any frontend app
// integrating with Kai Navigation Core and Support Layer.
//
// Safety: These types describe recommendation-only responses.
// Commands are never executed server-side.

// ── App IDs ──

export const KAI_UI_ADAPTER_APP_IDS = [
  'carehia',
  'viliniu',
  'volau',
  'jon-command-center',
  'kai',
] as const;

export type KaiUiAdapterAppId = (typeof KAI_UI_ADAPTER_APP_IDS)[number];

// ── Roles ──

export const KAI_UI_ADAPTER_ROLES = [
  'caregiver',
  'client',
  'agency-admin',
  'vendor',
  'customer',
  'driver',
  'public-user',
  'contributor',
  'reviewer',
  'admin',
  'super-admin',
  'viewer',
] as const;

export type KaiUiAdapterRole = (typeof KAI_UI_ADAPTER_ROLES)[number];

// ── Intent Types ──

export const KAI_UI_INTENT_TYPES = [
  'navigate',
  'explain',
  'create_support_request',
  'evaluate_action',
  'request_help',
  'report_issue',
  'open_settings',
  'open_proof',
  'unknown',
] as const;

export type KaiUiIntentType = (typeof KAI_UI_INTENT_TYPES)[number];

// ── Command Types ──

export const KAI_UI_COMMAND_TYPES = [
  'show_message',
  'navigate_to_route',
  'open_modal',
  'open_support_form',
  'request_confirmation',
  'request_admin_review',
  'show_blocked_notice',
  'show_unsupported_notice',
  'show_receipt',
  'no_op',
] as const;

export type KaiUiCommandType = (typeof KAI_UI_COMMAND_TYPES)[number];

// ── Decision Types ──

export const KAI_UI_DECISIONS = [
  'allowed',
  'recommended',
  'requires_confirmation',
  'requires_admin_review',
  'blocked',
  'unsupported',
  'not_found',
  'failed',
] as const;

export type KaiUiDecision = (typeof KAI_UI_DECISIONS)[number];

// ── Risk Levels ──

export const KAI_UI_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'blocked',
] as const;

export type KaiUiRiskLevel = (typeof KAI_UI_RISK_LEVELS)[number];

// ── Request ──

export interface KaiUiAdapterRequest {
  appId: string;
  userRole: string;
  currentScreen?: string;
  currentRouteKey?: string;
  message?: string;
  intentType?: KaiUiIntentType;
  routeKey?: string;
  actionKey?: string;
  supportRequestType?: string;
  metadata?: Record<string, unknown>;
  clientRequestId?: string;
}

// ── Response ──

export interface KaiUiAdapterResponse {
  appId: KaiUiAdapterAppId;
  decision: KaiUiDecision;
  riskLevel: KaiUiRiskLevel;
  message: string;
  commands: KaiUiCommand[];
  routeKey?: string;
  actionKey?: string;
  supportRequestSuggestion?: KaiUiSupportRequestSuggestion;
  confirmation?: KaiUiConfirmation;
  adminReview?: KaiUiAdminReview;
  receiptSummary?: KaiUiReceiptSummary;
  errors?: string[];
  clientRequestId?: string;
}

// ── Command ──

export interface KaiUiCommand {
  type: KaiUiCommandType;
  label?: string;
  routeKey?: string;
  routePath?: string;
  modalKey?: string;
  supportRequestDraft?: KaiUiSupportRequestSuggestion;
  confirmationText?: string;
  blockedReason?: string;
  metadata?: Record<string, unknown>;
}

// ── Support Request Suggestion ──

export interface KaiUiSupportRequestSuggestion {
  requestType: string;
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  requiresAdminReview: boolean;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  suggestedNextStep: string;
}

// ── Confirmation ──

export interface KaiUiConfirmation {
  required: boolean;
  reason: string;
  confirmationLabel: string;
  riskLevel: KaiUiRiskLevel;
}

// ── Admin Review ──

export interface KaiUiAdminReview {
  required: boolean;
  reason: string;
  reviewType: string;
  suggestedQueue: string;
}

// ── Receipt Summary ──

export interface KaiUiReceiptSummary {
  receiptType: string;
  created: string;
  receiptId?: string;
  summary: string;
}
