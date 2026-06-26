// ── Kai Navigation Core — Types ──
//
// Phase 11: Shared cross-app navigation types for Carehia, Viliniu,
// Volau, Jon Command Center, and Kai.
//
// These types define the route/action registry schema, navigation
// context, intents, decisions, and results used by the Navigation Core.

// ── Supported App IDs ──

export const KAI_SUPPORTED_APP_IDS = [
  'carehia',
  'viliniu',
  'volau',
  'jon-command-center',
  'kai',
] as const;

export type KaiSupportedAppId = (typeof KAI_SUPPORTED_APP_IDS)[number];

// ── User Roles ──

export const KAI_USER_ROLES = [
  'super-admin',
  'admin',
  'vendor',
  'customer',
  'viewer',
] as const;

export type KaiUserRole = (typeof KAI_USER_ROLES)[number];

// ── Route Types ──

export const KAI_ROUTE_TYPES = [
  'screen',
  'modal',
  'tab',
  'external_link',
  'admin_panel',
  'support',
  'settings',
  'proof',
  'payment_sensitive',
  'trust_sensitive',
] as const;

export type KaiRouteType = (typeof KAI_ROUTE_TYPES)[number];

// ── Risk Levels ──

export const KAI_NAVIGATION_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'blocked',
] as const;

export type KaiNavigationRiskLevel = (typeof KAI_NAVIGATION_RISK_LEVELS)[number];

// ── Navigation Decisions ──

export const KAI_NAVIGATION_DECISIONS = [
  'allowed',
  'requires_confirmation',
  'requires_admin_approval',
  'blocked',
  'unsupported',
  'not_found',
] as const;

export type KaiNavigationDecision = (typeof KAI_NAVIGATION_DECISIONS)[number];

// ── Route Registry Entry ──

export interface KaiRouteRegistryEntry {
  id: string;
  appId: KaiSupportedAppId;
  routeKey: string;
  routeLabel: string;
  routePath: string;
  routeType: KaiRouteType;
  allowedRoles: KaiUserRole[];
  requiredPermissions?: string[];
  riskLevel: KaiNavigationRiskLevel;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  description?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Action Registry Entry ──

export interface KaiActionRegistryEntry {
  id: string;
  appId: KaiSupportedAppId;
  actionKey: string;
  actionLabel: string;
  actionType: string;
  allowedRoles: KaiUserRole[];
  requiredPermissions?: string[];
  riskLevel: KaiNavigationRiskLevel;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  blocked: boolean;
  description?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Navigation Context ──

export interface KaiNavigationContext {
  appId: KaiSupportedAppId;
  userId: string;
  userRole: KaiUserRole;
  currentScreen?: string;
  sessionId?: string;
  source?: string;
}

// ── Navigation Intent ──

export interface KaiNavigationIntent {
  targetRouteKey?: string;
  targetActionKey?: string;
  naturalLanguageQuery?: string;
  targetAppId?: KaiSupportedAppId;
}

// ── Navigation Result ──

export interface KaiNavigationResult {
  appId: KaiSupportedAppId;
  routeKey?: string;
  actionKey?: string;
  routeLabel?: string;
  routePath?: string;
  riskLevel: KaiNavigationRiskLevel;
  decision: KaiNavigationDecision;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  message: string;
  recommendedFallback?: string;
  receiptId?: string;
  metadata?: Record<string, unknown>;
}
