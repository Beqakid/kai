// ── Kai Navigation Core — Types ──
//
// Phase 11: Shared cross-app navigation types for Carehia, Viliniu,
// Volau, Jon Command Center, and Kai.
//
// Phase 11 Phase 2: Extended with app-specific roles for comprehensive
// per-app route/action registries.

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
// Base roles used across all apps, plus app-specific roles used
// in route/action registries for fine-grained access control.

export const KAI_USER_ROLES = [
  'super-admin',
  'admin',
  'vendor',
  'customer',
  'viewer',
  // App-specific roles (Phase 2)
  'caregiver',
  'client',
  'agency-admin',
  'contributor',
  'reviewer',
  'driver',
  'public-user',
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

// ── App Registry Summary ──

export interface KaiAppRegistrySummary {
  appId: KaiSupportedAppId;
  routeCount: number;
  actionCount: number;
  highRiskRouteCount: number;
  highRiskActionCount: number;
  blockedActionCount: number;
  supportedRoles: KaiUserRole[];
  sensitiveAreas: string[];
}
