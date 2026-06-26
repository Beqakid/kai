// ── Registry Validation Helpers ──
// Phase 11 Phase 2: Validates route and action registry entries.
//
// Ensures:
// - appId is supported
// - routeKey/actionKey is unique per app
// - entries have labels
// - entries have allowed roles
// - riskLevel is valid
// - blocked actions are correctly marked
// - high-risk actions are not auto-executable
// - metadata is sanitized

import {
  KaiSupportedAppId,
  KAI_SUPPORTED_APP_IDS,
  KaiUserRole,
  KAI_USER_ROLES,
  KaiNavigationRiskLevel,
  KAI_NAVIGATION_RISK_LEVELS,
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
} from './types';

// ── Validation Result ──

export interface RegistryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Sensitive keys that should not appear in metadata ──

const SENSITIVE_METADATA_KEYS = new Set([
  'token', 'jwt', 'secret', 'password', 'authorization',
  'cookie', 'session_token', 'api_key', 'apiKey', 'auth',
  'access_token', 'refresh_token', 'private_key', 'ssn',
  'credit_card', 'bank_account', 'raw_audio',
]);

// ── Validators ──

/** Validate that an appId is supported */
export function validateRegistryAppId(appId: string): boolean {
  return KAI_SUPPORTED_APP_IDS.includes(appId as KaiSupportedAppId);
}

/** Validate a single route entry */
export function validateRouteEntry(route: KaiRouteRegistryEntry): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateRegistryAppId(route.appId)) {
    errors.push(`Invalid appId: "${route.appId}"`);
  }
  if (!route.routeKey || !route.routeKey.trim()) {
    errors.push('Missing routeKey');
  }
  if (!route.routeLabel || !route.routeLabel.trim()) {
    errors.push('Missing routeLabel');
  }
  if (!route.allowedRoles || route.allowedRoles.length === 0) {
    errors.push('Missing allowedRoles — at least one role is required');
  } else {
    for (const role of route.allowedRoles) {
      if (!KAI_USER_ROLES.includes(role)) {
        errors.push(`Invalid role in allowedRoles: "${role}"`);
      }
    }
  }
  if (!KAI_NAVIGATION_RISK_LEVELS.includes(route.riskLevel)) {
    errors.push(`Invalid riskLevel: "${route.riskLevel}"`);
  }
  if (route.riskLevel === 'blocked' && route.isActive) {
    warnings.push(`Route "${route.routeKey}" is blocked but still active`);
  }
  if (route.metadata) {
    for (const key of Object.keys(route.metadata)) {
      if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
        errors.push(`Sensitive key "${key}" found in metadata — must be removed`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate a single action entry */
export function validateActionEntry(action: KaiActionRegistryEntry): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateRegistryAppId(action.appId)) {
    errors.push(`Invalid appId: "${action.appId}"`);
  }
  if (!action.actionKey || !action.actionKey.trim()) {
    errors.push('Missing actionKey');
  }
  if (!action.actionLabel || !action.actionLabel.trim()) {
    errors.push('Missing actionLabel');
  }
  if (!action.allowedRoles || action.allowedRoles.length === 0) {
    errors.push('Missing allowedRoles — at least one role is required');
  } else {
    for (const role of action.allowedRoles) {
      if (!KAI_USER_ROLES.includes(role)) {
        errors.push(`Invalid role in allowedRoles: "${role}"`);
      }
    }
  }
  if (!KAI_NAVIGATION_RISK_LEVELS.includes(action.riskLevel)) {
    errors.push(`Invalid riskLevel: "${action.riskLevel}"`);
  }

  // Blocked actions must have blocked=true
  if (action.riskLevel === 'blocked' && !action.blocked) {
    errors.push(`Action "${action.actionKey}" has riskLevel "blocked" but blocked=false`);
  }

  // Blocked actions cannot be marked as allowed (non-blocked)
  if (action.blocked && action.riskLevel !== 'blocked') {
    warnings.push(`Action "${action.actionKey}" is blocked but riskLevel is "${action.riskLevel}"`);
  }

  // High-risk actions cannot be auto-executable (must require admin approval)
  if (action.riskLevel === 'high' && !action.requiresAdminApproval) {
    errors.push(`High-risk action "${action.actionKey}" must require admin approval`);
  }

  if (action.metadata) {
    for (const key of Object.keys(action.metadata)) {
      if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
        errors.push(`Sensitive key "${key}" found in metadata — must be removed`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate an entire app's route registry for uniqueness and correctness */
export function validateAppRouteRegistry(
  appId: string,
  routes: KaiRouteRegistryEntry[],
): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateRegistryAppId(appId)) {
    errors.push(`Invalid appId: "${appId}"`);
    return { valid: false, errors, warnings };
  }

  // Check for duplicate routeKeys
  const seen = new Set<string>();
  for (const route of routes) {
    if (route.appId !== appId) {
      errors.push(`Route "${route.routeKey}" has appId "${route.appId}" but expected "${appId}"`);
    }
    if (seen.has(route.routeKey)) {
      errors.push(`Duplicate routeKey: "${route.routeKey}" in app "${appId}"`);
    }
    seen.add(route.routeKey);

    const result = validateRouteEntry(route);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate an entire app's action registry for uniqueness and correctness */
export function validateAppActionRegistry(
  appId: string,
  actions: KaiActionRegistryEntry[],
): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateRegistryAppId(appId)) {
    errors.push(`Invalid appId: "${appId}"`);
    return { valid: false, errors, warnings };
  }

  // Check for duplicate actionKeys
  const seen = new Set<string>();
  for (const action of actions) {
    if (action.appId !== appId) {
      errors.push(`Action "${action.actionKey}" has appId "${action.appId}" but expected "${appId}"`);
    }
    if (seen.has(action.actionKey)) {
      errors.push(`Duplicate actionKey: "${action.actionKey}" in app "${appId}"`);
    }
    seen.add(action.actionKey);

    const result = validateActionEntry(action);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}
