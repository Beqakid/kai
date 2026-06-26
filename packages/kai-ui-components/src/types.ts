// ── @kai/ui-components — Component Types ──
// Typed props for every Kai UI component.
// Imports SDK types to ensure contract alignment.

import type {
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
} from '@kai/ui-sdk';

// Re-export SDK types used by component consumers
export type {
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
};

// ── Theme ──

export type KaiThemeMode = 'light' | 'dark';
export type KaiComponentSize = 'sm' | 'md' | 'lg';
export type KaiComponentTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'blocked';

export interface KaiUiComponentTheme {
  mode: KaiThemeMode;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  borderRadius: string;
  dangerColor: string;
  warningColor: string;
  successColor: string;
  blockedColor: string;
  fontFamily: string;
  compact: boolean;
}

// ── Component Props ──

export interface KaiMessageBubbleProps {
  message: string;
  tone?: KaiComponentTone;
  size?: KaiComponentSize;
  icon?: React.ReactNode;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiNavigationCardProps {
  command: KaiUiCommand;
  onNavigate?: (command: KaiUiCommand) => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiConfirmationDialogProps {
  command: KaiUiCommand;
  confirmation: KaiConfirmationRequest;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiAdminReviewBannerProps {
  command: KaiUiCommand;
  adminReview: KaiAdminReviewRequest;
  onCreateSupportRequest?: () => void;
  onOpenReviewQueue?: () => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiSupportPrefillCardProps {
  command: KaiUiCommand;
  suggestion: KaiSupportRequestSuggestion;
  onOpenSupportForm: (suggestion: KaiSupportRequestSuggestion) => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiBlockedNoticeProps {
  command: KaiUiCommand;
  onDismiss?: () => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiUnsupportedNoticeProps {
  command: KaiUiCommand;
  onDismiss?: () => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiReceiptCardProps {
  receiptSummary: KaiReceiptSummary;
  onViewReceipt?: (receiptId: string) => void;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiCommandResultPanelProps {
  response: KaiUiAdapterResponse;
  handlers: KaiCommandHandlerMap;
  theme?: Partial<KaiUiComponentTheme>;
  compact?: boolean;
}

export interface KaiAssistantPanelProps {
  appId: KaiAppId;
  role: KaiUserRole;
  currentScreen?: string;
  placeholder?: string;
  onSubmitIntent: (message: string) => void | Promise<void>;
  response?: KaiUiAdapterResponse | null;
  handlers: KaiCommandHandlerMap;
  loading?: boolean;
  error?: string | null;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiCommandRendererProps {
  commands: KaiUiCommand[];
  response: KaiUiAdapterResponse;
  handlers: KaiCommandHandlerMap;
  theme?: Partial<KaiUiComponentTheme>;
}

export interface KaiSdkAssistantPanelProps {
  kaiClient: {
    evaluateIntent: (input: { message: string; role?: KaiUserRole }) => Promise<KaiUiAdapterResponse>;
  };
  appId: KaiAppId;
  role: KaiUserRole;
  currentScreen?: string;
  handlers: KaiCommandHandlerMap;
  theme?: Partial<KaiUiComponentTheme>;
}
