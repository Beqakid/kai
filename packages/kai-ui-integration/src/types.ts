// ── @kai/ui-integration — Types ──
// Host-app integration types for Kai assistant profile, orb, visibility, and handlers.

import type { KaiAppId, KaiUserRole, KaiCommandHandlerMap } from '@kai/ui-sdk';

// Re-export SDK types used by consumers
export type { KaiAppId, KaiUserRole, KaiCommandHandlerMap };

// ── Assistant Profile ──

/** Defines the assistant's identity for a host app */
export interface AssistantProfile {
  /** Display name shown in UI (e.g. "Vili", "Kai") */
  displayName: string;
  /** Unique key for this assistant persona */
  assistantKey: string;
  /** The Kai app ID this profile belongs to */
  appId: KaiAppId;
  /** Welcome message displayed when panel opens */
  welcomeMessage: string;
  /** Tone description for assistant responses */
  tone: string;
  /** Optional avatar URL */
  avatarUrl?: string;
  /** Optional theme overrides for branded look (matches @kai/ui-components KaiUiComponentTheme) */
  themeOverrides?: Record<string, string>;
}

/** Options for creating a profile with overrides */
export type AssistantProfileOverrides = Partial<Omit<AssistantProfile, 'appId'>> & {
  appId?: KaiAppId;
};

// ── Orb Props ──

export interface AssistantOrbProps {
  /** Assistant profile for branding */
  assistantProfile: AssistantProfile;
  /** Whether the assistant panel is currently open */
  isOpen: boolean;
  /** Called when user taps the orb */
  onClick: () => void;
  /** Whether there's a pending suggestion to show */
  hasSuggestion?: boolean;
  /** Disabled state (e.g., during loading) */
  disabled?: boolean;
  /** Size override — defaults to 56 mobile / 60 desktop */
  size?: { mobile: number; desktop: number };
  /** Additional className for host app styling */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

// ── Visibility ──

/** Configuration for when the assistant orb should be visible */
export interface AssistantVisibilityConfig {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is still loading */
  isAuthLoading: boolean;
  /** Current route path (e.g. "/dashboard", "/login") */
  currentRoute: string;
  /** User role (optional — some apps may restrict by role) */
  userRole?: KaiUserRole;
  /** Route patterns where the orb should be hidden */
  hiddenRoutePatterns?: string[];
  /** Roles that should NOT see the orb */
  hiddenRoles?: KaiUserRole[];
}

/** Default route patterns where assistant orb is hidden */
export const DEFAULT_HIDDEN_ROUTE_PATTERNS: readonly string[] = [
  '/login',
  '/signin',
  '/signup',
  '/register',
  '/onboarding',
  '/password-reset',
  '/forgot-password',
  '/verify-email',
  '/verify',
  '/public',
  '/auth',
] as const;

// ── Handler Templates ──

/** Sensitive action categories that must go through admin review or support */
export const SENSITIVE_ACTION_CATEGORIES = [
  'payout',
  'refund',
  'bank-detail',
  'payment-processing',
  'vendor-approval',
  'permission-grant',
  'admin-permission',
  'caregiver-approval',
  'card-detail',
  'm-paisa',
] as const;
export type SensitiveActionCategory = (typeof SENSITIVE_ACTION_CATEGORIES)[number];

/** Host app callback interface for wiring command handlers */
export interface HostAppCallbacks {
  /** Navigate to a route — user-initiated only, no auto-navigation */
  onNavigate?: (routePath: string) => void;
  /** Open a support form with pre-filled data */
  onOpenSupportForm?: (title: string, description: string, category?: string) => void;
  /** Show a confirmation dialog to the user */
  onShowConfirmation?: (action: string, description: string) => void;
  /** Escalate to admin review */
  onRequestAdminReview?: (action: string, reason: string) => void;
  /** Show a blocked action notice */
  onShowBlockedNotice?: (message: string) => void;
  /** Show a receipt */
  onShowReceipt?: (receiptId: string, summary: string) => void;
  /** Show a general message */
  onShowMessage?: (message: string, severity?: 'info' | 'warning' | 'error') => void;
  /** Custom toast/notification */
  onToast?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

// ── Panel Container Props ──

export interface AssistantPanelContainerProps {
  /** Assistant profile for branding */
  assistantProfile: AssistantProfile;
  /** Whether the panel is open */
  isOpen: boolean;
  /** Close the panel */
  onClose: () => void;
  /** SDK-connected onSubmitIntent handler */
  onSubmitIntent: (message: string) => void;
  /** Current SDK response */
  response?: unknown;
  /** Command handlers from host app */
  handlers: KaiCommandHandlerMap;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Layout mode */
  layout?: 'mobile-sheet' | 'desktop-float';
}
