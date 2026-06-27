// ── @kai/ui-integration — Public API ──
// Host-app integration layer for Kai assistant.
// Provides assistant profile, authenticated orb, visibility rules,
// and command handler templates for host apps.
//
// Security boundaries (inherited from @kai/ui-sdk):
// - No token storage
// - No auto-execution of commands
// - No auto-navigation
// - No payment/payout/refund processing
// - Sensitive actions routed to admin review / support
// - Blocked commands are terminal

// ── Types ──
export type {
  AssistantProfile,
  AssistantProfileOverrides,
  AssistantOrbProps,
  AssistantVisibilityConfig,
  HostAppCallbacks,
  AssistantPanelContainerProps,
  SensitiveActionCategory,
  // Re-exported SDK types
  KaiAppId,
  KaiUserRole,
  KaiCommandHandlerMap,
} from './types';

export {
  DEFAULT_HIDDEN_ROUTE_PATTERNS,
  SENSITIVE_ACTION_CATEGORIES,
} from './types';

// ── Profile ──
export {
  getAssistantProfile,
  getAvailableProfiles,
  isValidProfile,
} from './profile';

// ── Visibility ──
export {
  canRenderAssistantOrb,
  isRouteHidden,
  getHiddenRoutePatterns,
} from './visibility';

// ── Handlers ──
export {
  createHostCommandHandlers,
  createViliniuCommandHandlers,
  isSensitiveAction,
  getSensitiveCategory,
} from './handlers';

// ── Components ──
export { AuthenticatedAssistantOrb, ORB_Z_INDEX } from './components/AuthenticatedAssistantOrb';
export { AssistantPanelContainer, PANEL_Z_INDEX, PANEL_BACKDROP_Z_INDEX } from './components/AssistantPanelContainer';
