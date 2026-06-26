// ── Kai UI Adapter — Index ──
// Phase 11 Phase 3: Cross-app UI adapter contract exports.

// Types
export type {
  KaiUiAdapterAppId,
  KaiUiAdapterRole,
  KaiUiIntentType,
  KaiUiCommandType,
  KaiUiDecision,
  KaiUiRiskLevel,
  KaiUiAdapterRequest,
  KaiUiAdapterResponse,
  KaiUiCommand,
  KaiUiSupportRequestSuggestion,
  KaiUiConfirmation,
  KaiUiAdminReview,
  KaiUiReceiptSummary,
} from './types';

export {
  KAI_UI_ADAPTER_APP_IDS,
  KAI_UI_ADAPTER_ROLES,
  KAI_UI_INTENT_TYPES,
  KAI_UI_COMMAND_TYPES,
  KAI_UI_DECISIONS,
  KAI_UI_RISK_LEVELS,
} from './types';

// Client Contract
export {
  KAI_UI_ADAPTER_VERSION,
  SUPPORTED_UI_ADAPTER_APPS,
  SUPPORTED_UI_ADAPTER_ROLES,
  SUPPORTED_UI_INTENTS,
  SUPPORTED_UI_COMMANDS,
  validateUiAdapterRequest,
  validateUiAdapterAppId,
  validateUiAdapterRole,
  sanitizeUiAdapterMetadata,
} from './client-contract';

// Command Builder
export {
  buildNavigationCommand,
  buildSupportFormCommand,
  buildConfirmationCommand,
  buildAdminReviewCommand,
  buildBlockedCommand,
  buildUnsupportedCommand,
  buildMessageCommand,
  buildReceiptCommand,
} from './ui-command-builder';

// Adapter Service
export {
  processUiAdapterRequest,
  inferIntentFromMessage,
  resolveRequestedRouteOrAction,
  mapNavigationDecisionToUiResponse,
  mapSupportDecisionToUiResponse,
  createUiAdapterReceipt,
} from './adapter-service';
export type { UiAdapterAuthContext } from './adapter-service';

// Example Adapters
export {
  ALL_EXAMPLES,
  CAREHIA_CPR_EXAMPLE,
  VILINIU_PAYOUT_EXAMPLE,
  VOLAU_WRONG_INFO_EXAMPLE,
  JCC_BLOCKERS_EXAMPLE,
  runExample,
} from './example-adapters';
