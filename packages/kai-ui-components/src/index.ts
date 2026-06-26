// ── @kai/ui-components — Public API ──
// Reusable UI components for rendering Kai SDK command responses.

// ── Types ──
export type {
  KaiThemeMode,
  KaiComponentSize,
  KaiComponentTone,
  KaiUiComponentTheme,
  KaiMessageBubbleProps,
  KaiNavigationCardProps,
  KaiConfirmationDialogProps,
  KaiAdminReviewBannerProps,
  KaiSupportPrefillCardProps,
  KaiBlockedNoticeProps,
  KaiUnsupportedNoticeProps,
  KaiReceiptCardProps,
  KaiCommandResultPanelProps,
  KaiAssistantPanelProps,
  KaiCommandRendererProps,
  KaiSdkAssistantPanelProps,
  // Re-exported SDK types
  KaiAppId,
  KaiUserRole,
  KaiUiAdapterResponse,
  KaiUiCommand,
  KaiUiCommandType,
  KaiRiskLevel,
  KaiUiDecision,
  KaiSupportRequestSuggestion,
  KaiConfirmationRequest,
  KaiAdminReviewRequest,
  KaiReceiptSummary,
  KaiCommandHandlerMap,
} from './types';

// ── Theme Tokens ──
export {
  DEFAULT_THEME,
  LIGHT_TOKENS,
  DARK_TOKENS,
  RISK_TONE_MAP,
  SPACING,
  FONT_SIZES,
  SHADOWS,
  resolveTheme,
  getToneColor,
} from './styles/tokens';

// ── Format Utilities ──
export {
  formatRiskLabel,
  formatDecisionLabel,
  formatCommandLabel,
  getRiskTone,
  getDefaultCommandMessage,
  getSafeDisplayText,
} from './utils/format';

// ── Command Group Utilities ──
export {
  groupCommandsByType,
  getPrimaryCommand,
  hasBlockingCommand,
  hasConfirmationCommand,
  hasAdminReviewCommand,
  hasSupportCommand,
  hasNavigationCommand,
} from './utils/command-groups';

// ── Components ──
export { KaiMessageBubble } from './components/KaiMessageBubble';
export { KaiNavigationCard } from './components/KaiNavigationCard';
export { KaiConfirmationDialog } from './components/KaiConfirmationDialog';
export { KaiAdminReviewBanner } from './components/KaiAdminReviewBanner';
export { KaiSupportPrefillCard } from './components/KaiSupportPrefillCard';
export { KaiBlockedNotice } from './components/KaiBlockedNotice';
export { KaiUnsupportedNotice } from './components/KaiUnsupportedNotice';
export { KaiReceiptCard } from './components/KaiReceiptCard';
export { KaiCommandResultPanel } from './components/KaiCommandResultPanel';
export { KaiAssistantPanel } from './components/KaiAssistantPanel';
export { KaiSdkAssistantPanel } from './components/KaiSdkAssistantPanel';
