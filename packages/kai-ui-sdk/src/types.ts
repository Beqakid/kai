// ── @kai/ui-sdk — Types ──
// Frontend-safe types mirrored from Phase 3 Cross-App UI Adapter Contract.
// These types define the contract between host apps and the Kai UI Adapter endpoint.

// ── App & Role Identifiers ──

export const KAI_APP_IDS = [
  'carehia',
  'viliniu',
  'volau',
  'jon-command-center',
  'kai',
] as const;
export type KaiAppId = (typeof KAI_APP_IDS)[number];

export const KAI_USER_ROLES = [
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
export type KaiUserRole = (typeof KAI_USER_ROLES)[number];

// ── Intent & Command Enums ──

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

export const KAI_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'blocked',
] as const;
export type KaiRiskLevel = (typeof KAI_RISK_LEVELS)[number];

// ── Request / Response ──

export interface KaiUiAdapterRequest {
  appId: KaiAppId;
  role: KaiUserRole;
  message: string;
  routeKey?: string;
  actionKey?: string;
  metadata?: Record<string, unknown>;
  clientRequestId?: string;
}

export interface KaiUiAdapterResponse {
  success: boolean;
  decision: KaiUiDecision;
  riskLevel: KaiRiskLevel;
  intentType: KaiUiIntentType;
  commands: KaiUiCommand[];
  message: string;
  supportSuggestion?: KaiSupportRequestSuggestion;
  confirmation?: KaiConfirmationRequest;
  adminReview?: KaiAdminReviewRequest;
  receipt?: KaiReceiptSummary;
  clientRequestId?: string;
  timestamp: string;
}

// ── Commands ──

export interface KaiUiCommand {
  type: KaiUiCommandType;
  routePath?: string;
  routeKey?: string;
  actionKey?: string;
  title?: string;
  message?: string;
  modalId?: string;
  severity?: 'info' | 'warning' | 'error';
  receiptId?: string;
  metadata?: Record<string, unknown>;
}

// ── Support ──

export interface KaiSupportRequestSuggestion {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory?: string;
  suggestedPriority?: string;
  relatedRouteKey?: string;
  relatedActionKey?: string;
  metadata?: Record<string, unknown>;
}

// ── Confirmation & Admin Review ──

export interface KaiConfirmationRequest {
  action: string;
  description: string;
  riskLevel: KaiRiskLevel;
  requiresExplicitConsent: boolean;
  metadata?: Record<string, unknown>;
}

export interface KaiAdminReviewRequest {
  action: string;
  reason: string;
  reviewerRole: KaiUserRole;
  riskLevel: KaiRiskLevel;
  metadata?: Record<string, unknown>;
}

// ── Receipts ──

export interface KaiReceiptSummary {
  receiptId: string;
  receiptType: string;
  actorId: string;
  appId: KaiAppId;
  timestamp: string;
  summary: string;
}

// ── Client Config ──

export interface KaiClientConfig {
  /** Base URL of the Kai API (e.g. https://kai-gateway.example.com) */
  baseUrl: string;
  /** The app using the SDK */
  appId: KaiAppId;
  /** Async function that returns a valid JWT — never stored by the SDK */
  getAuthToken: () => Promise<string>;
  /** Default role if not specified per-request */
  defaultRole?: KaiUserRole;
  /** Extra headers to include on every request */
  defaultHeaders?: Record<string, string>;
  /** Called when auth fails (401/403) */
  onAuthError?: (error: Error) => void;
  /** Called when network request fails */
  onNetworkError?: (error: Error) => void;
  /** Called when Kai returns an application error */
  onKaiError?: (error: Error) => void;
}

/** Function that returns an auth token — alias for config.getAuthToken */
export type KaiAuthProvider = () => Promise<string>;

// ── Command Handlers ──

export type KaiNavigationHandler = (command: KaiUiCommand) => void | Promise<void>;
export type KaiSupportHandler = (suggestion: KaiSupportRequestSuggestion) => void | Promise<void>;
export type KaiConfirmationHandler = (confirmation: KaiConfirmationRequest) => void | Promise<void>;
export type KaiAdminReviewHandler = (review: KaiAdminReviewRequest) => void | Promise<void>;
export type KaiBlockedHandler = (command: KaiUiCommand) => void | Promise<void>;
export type KaiUnsupportedHandler = (command: KaiUiCommand) => void | Promise<void>;
export type KaiMessageHandler = (command: KaiUiCommand) => void | Promise<void>;

export interface KaiCommandHandlerMap {
  onNavigate?: KaiNavigationHandler;
  onSupportForm?: KaiSupportHandler;
  onConfirmation?: KaiConfirmationHandler;
  onAdminReview?: KaiAdminReviewHandler;
  onBlocked?: KaiBlockedHandler;
  onUnsupported?: KaiUnsupportedHandler;
  onMessage?: KaiMessageHandler;
  onReceipt?: (command: KaiUiCommand) => void | Promise<void>;
  onModal?: (command: KaiUiCommand) => void | Promise<void>;
  onNoOp?: () => void;
}
