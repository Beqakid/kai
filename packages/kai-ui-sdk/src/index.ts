// ── @kai/ui-sdk — Public API ──
// Frontend SDK for Kai Navigation Core, Support Layer, and Cross-App UI Adapter.
//
// Security boundaries:
// - Never stores auth tokens
// - Never logs tokens or Authorization headers
// - Never auto-executes commands without host app handlers
// - Never modifies external app data
// - Never processes payments
// - Never sends emails
// - Blocked commands are terminal

// ── Types ──
export type {
  KaiAppId,
  KaiUserRole,
  KaiUiIntentType,
  KaiUiCommandType,
  KaiUiDecision,
  KaiRiskLevel,
  KaiUiAdapterRequest,
  KaiUiAdapterResponse,
  KaiUiCommand,
  KaiSupportRequestSuggestion,
  KaiConfirmationRequest,
  KaiAdminReviewRequest,
  KaiReceiptSummary,
  KaiClientConfig,
  KaiAuthProvider,
  KaiCommandHandlerMap,
  KaiNavigationHandler,
  KaiSupportHandler,
  KaiConfirmationHandler,
  KaiAdminReviewHandler,
  KaiBlockedHandler,
  KaiUnsupportedHandler,
  KaiMessageHandler,
} from './types';

export {
  KAI_APP_IDS,
  KAI_USER_ROLES,
  KAI_UI_INTENT_TYPES,
  KAI_UI_COMMAND_TYPES,
  KAI_UI_DECISIONS,
  KAI_RISK_LEVELS,
} from './types';

// ── Client ──
export { createKaiClient, sanitizeMetadata } from './client';
export type { KaiClient } from './client';

// ── Commands ──
export {
  handleKaiCommand,
  handleKaiCommands,
  createDefaultCommandHandlers,
  isNavigationCommand,
  isSupportCommand,
  isConfirmationCommand,
  isAdminReviewCommand,
  isBlockedCommand,
  isUnsupportedCommand,
  isReceiptCommand,
} from './commands';

// ── Support ──
export {
  buildSupportDraftFromSuggestion,
  isAdminReviewRequired,
  isConfirmationRequired,
  getSupportRequestType,
  getSafeSupportTitle,
  getSafeSupportDescription,
} from './support';

// ── Errors ──
export {
  KaiSdkError,
  KaiAuthError,
  KaiNetworkError,
  KaiValidationError,
  KaiCommandError,
} from './errors';

// ── Storage ──
export { KaiResponseStore, generateClientRequestId } from './storage';

// ── React Hooks (optional — requires react peer dependency) ──
export {
  useKaiClient,
  useKaiIntent,
  useKaiNavigation,
  useKaiSupport,
  useKaiCommandHandler,
} from './hooks';
