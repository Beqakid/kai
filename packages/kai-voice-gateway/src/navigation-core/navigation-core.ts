// ── Kai Navigation Core — Service ──
//
// Phase 11: Cross-app navigation evaluation, route/action lookup,
// and recommendation engine.
//
// Phase 11 Phase 2: Updated to use app-specific registries from
// the registries/ folder, with fallback to Phase 1 default-routes.
//
// Safety rules:
// - Never executes external app changes.
// - Returns recommendations only.
// - Validates appId and role before any lookup.
// - Uses Permission Gate risk rules for risky actions.
// - Creates receipts for all navigation decisions.
// - Sanitizes metadata — no tokens, secrets, or PII in receipts.

import {
  KaiSupportedAppId,
  KAI_SUPPORTED_APP_IDS,
  KaiUserRole,
  KAI_USER_ROLES,
  KaiNavigationContext,
  KaiNavigationIntent,
  KaiNavigationResult,
  KaiNavigationRiskLevel,
  KaiNavigationDecision,
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
  KaiAppRegistrySummary,
} from './types';
import {
  getRegistryRoutesForApp,
  getRegistryActionsForApp,
  getRegistryRouteByKey,
  getRegistryActionByKey,
} from './registries/index';
import { getAppRegistrySummary } from './registry-seed-service';
import { Errors } from '../errors';

// ── Metadata sanitization ──

const SENSITIVE_KEYS = new Set([
  'token', 'jwt', 'secret', 'password', 'authorization',
  'cookie', 'session_token', 'api_key', 'apiKey', 'auth',
  'access_token', 'refresh_token', 'private_key', 'ssn',
  'credit_card', 'bank_account', 'raw_audio',
]);

export function sanitizeNavigationMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Validation helpers ──

export function validateAppId(appId: string): KaiSupportedAppId {
  if (!appId) {
    throw Errors.missingField('appId');
  }
  if (!KAI_SUPPORTED_APP_IDS.includes(appId as KaiSupportedAppId)) {
    throw Errors.invalidAppId(appId);
  }
  return appId as KaiSupportedAppId;
}

export function validateRole(role: string): KaiUserRole {
  if (!role) {
    throw Errors.missingField('userRole');
  }
  const normalized = role.replace(/_/g, '-') as KaiUserRole;
  if (!KAI_USER_ROLES.includes(normalized)) {
    throw Errors.invalidUserRole(role);
  }
  return normalized;
}

// ── Navigation Core Service ──

export class KaiNavigationCore {
  /**
   * Resolve a navigation intent from natural-language or explicit route/action keys.
   */
  resolveNavigationIntent(input: {
    targetRouteKey?: string;
    targetActionKey?: string;
    naturalLanguageQuery?: string;
    targetAppId?: string;
  }): KaiNavigationIntent {
    return {
      targetRouteKey: input.targetRouteKey,
      targetActionKey: input.targetActionKey,
      naturalLanguageQuery: input.naturalLanguageQuery,
      targetAppId: input.targetAppId
        ? validateAppId(input.targetAppId)
        : undefined,
    };
  }

  /**
   * Get all routes for an app, filtered by role.
   * Uses Phase 2 app-specific registries.
   */
  getRoutesForApp(
    appId: string,
    role: string,
  ): KaiRouteRegistryEntry[] {
    const validAppId = validateAppId(appId);
    const validRole = validateRole(role);

    return getRegistryRoutesForApp(validAppId).filter(
      (route) =>
        route.isActive && route.allowedRoles.includes(validRole),
    );
  }

  /**
   * Get a specific route by app + route key.
   */
  getRouteByKey(
    appId: string,
    routeKey: string,
  ): KaiRouteRegistryEntry | undefined {
    const validAppId = validateAppId(appId);
    return getRegistryRouteByKey(validAppId, routeKey);
  }

  /**
   * Get all actions for an app, filtered by role.
   * Uses Phase 2 app-specific registries.
   */
  getActionsForApp(
    appId: string,
    role: string,
  ): KaiActionRegistryEntry[] {
    const validAppId = validateAppId(appId);
    const validRole = validateRole(role);

    return getRegistryActionsForApp(validAppId).filter(
      (action) =>
        action.isActive && action.allowedRoles.includes(validRole),
    );
  }

  /**
   * Get a specific action by app + action key.
   */
  getActionByKey(
    appId: string,
    actionKey: string,
  ): KaiActionRegistryEntry | undefined {
    const validAppId = validateAppId(appId);
    return getRegistryActionByKey(validAppId, actionKey);
  }

  /**
   * Get app summary with route/action counts, risk levels, etc.
   */
  getAppSummary(appId: string): KaiAppRegistrySummary {
    const validAppId = validateAppId(appId);
    return getAppRegistrySummary(validAppId);
  }

  /**
   * Evaluate a navigation request.
   *
   * Checks the route/action registry, verifies role access,
   * evaluates risk level, and returns a decision.
   *
   * Returns recommendations only — never triggers external app navigation.
   */
  evaluateNavigationRequest(
    context: KaiNavigationContext,
    intent: KaiNavigationIntent,
  ): KaiNavigationResult {
    const appId = intent.targetAppId ?? context.appId;
    const validAppId = validateAppId(appId);
    const validRole = validateRole(context.userRole);

    // ── Route-based evaluation ──
    if (intent.targetRouteKey) {
      const route = getRegistryRouteByKey(validAppId, intent.targetRouteKey);

      if (!route) {
        return {
          appId: validAppId,
          routeKey: intent.targetRouteKey,
          riskLevel: 'low',
          decision: 'not_found',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `Route "${intent.targetRouteKey}" was not found for app "${validAppId}".`,
          recommendedFallback: 'Check available routes or ask Kai for help.',
        };
      }

      if (!route.isActive) {
        return {
          appId: validAppId,
          routeKey: route.routeKey,
          routeLabel: route.routeLabel,
          routePath: route.routePath,
          riskLevel: 'blocked',
          decision: 'blocked',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `Route "${route.routeLabel}" is currently inactive.`,
          recommendedFallback: 'Contact an admin for access.',
        };
      }

      if (!route.allowedRoles.includes(validRole)) {
        return {
          appId: validAppId,
          routeKey: route.routeKey,
          routeLabel: route.routeLabel,
          riskLevel: 'blocked',
          decision: 'blocked',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `You do not have access to "${route.routeLabel}" with role "${validRole}".`,
          recommendedFallback: 'Contact an admin if you believe you should have access.',
        };
      }

      return this.makeRouteDecision(validAppId, route);
    }

    // ── Action-based evaluation ──
    if (intent.targetActionKey) {
      const action = getRegistryActionByKey(validAppId, intent.targetActionKey);

      if (!action) {
        return {
          appId: validAppId,
          actionKey: intent.targetActionKey,
          riskLevel: 'low',
          decision: 'not_found',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `Action "${intent.targetActionKey}" was not found for app "${validAppId}".`,
          recommendedFallback: 'Check available actions or ask Kai for help.',
        };
      }

      if (action.blocked) {
        return {
          appId: validAppId,
          actionKey: action.actionKey,
          riskLevel: 'blocked',
          decision: 'blocked',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `Action "${action.actionLabel}" is blocked.`,
          recommendedFallback: 'Use the platform UI to perform this action manually.',
        };
      }

      if (!action.allowedRoles.includes(validRole)) {
        return {
          appId: validAppId,
          actionKey: action.actionKey,
          riskLevel: 'blocked',
          decision: 'blocked',
          requiresConfirmation: false,
          requiresAdminApproval: false,
          message: `You do not have access to "${action.actionLabel}" with role "${validRole}".`,
          recommendedFallback: 'Contact an admin if you believe you should have access.',
        };
      }

      return this.makeActionDecision(validAppId, action);
    }

    // ── No target specified ──
    return {
      appId: validAppId,
      riskLevel: 'low',
      decision: 'unsupported',
      requiresConfirmation: false,
      requiresAdminApproval: false,
      message: 'No route or action specified in the navigation intent.',
      recommendedFallback: 'Specify a routeKey or actionKey, or ask Kai for available options.',
    };
  }

  /**
   * Create a navigation receipt payload (ready for ActionReceiptLogger).
   */
  createNavigationReceipt(
    result: KaiNavigationResult,
    context: KaiNavigationContext,
  ): Record<string, unknown> {
    return {
      appId: context.appId,
      userId: context.userId,
      userRole: context.userRole,
      targetAppId: result.appId,
      routeKey: result.routeKey,
      actionKey: result.actionKey,
      riskLevel: result.riskLevel,
      decision: result.decision,
      requiresConfirmation: result.requiresConfirmation,
      requiresAdminApproval: result.requiresAdminApproval,
      message: result.message,
      sessionId: context.sessionId,
      source: context.source || 'navigation-core',
      metadata: sanitizeNavigationMetadata(result.metadata),
    };
  }

  // ── Private helpers ──

  private makeRouteDecision(
    appId: KaiSupportedAppId,
    route: KaiRouteRegistryEntry,
  ): KaiNavigationResult {
    let decision: KaiNavigationDecision;
    let message: string;

    if (route.riskLevel === 'blocked') {
      decision = 'blocked';
      message = `Route "${route.routeLabel}" is blocked.`;
    } else if (route.requiresAdminApproval || route.riskLevel === 'high') {
      decision = 'requires_admin_approval';
      message = `I can guide you to "${route.routeLabel}", but this is a sensitive area that requires admin approval.`;
    } else if (route.requiresConfirmation || route.riskLevel === 'medium') {
      decision = 'requires_confirmation';
      message = `I can take you to "${route.routeLabel}". Please confirm you'd like to proceed.`;
    } else {
      decision = 'allowed';
      message = `You can navigate to "${route.routeLabel}" at ${route.routePath}.`;
    }

    return {
      appId,
      routeKey: route.routeKey,
      routeLabel: route.routeLabel,
      routePath: route.routePath,
      riskLevel: route.riskLevel,
      decision,
      requiresConfirmation: route.requiresConfirmation || route.riskLevel === 'medium',
      requiresAdminApproval: route.requiresAdminApproval || route.riskLevel === 'high',
      message,
    };
  }

  private makeActionDecision(
    appId: KaiSupportedAppId,
    action: KaiActionRegistryEntry,
  ): KaiNavigationResult {
    let decision: KaiNavigationDecision;
    let message: string;

    if (action.riskLevel === 'blocked' || action.blocked) {
      decision = 'blocked';
      message = `Action "${action.actionLabel}" is blocked.`;
    } else if (action.requiresAdminApproval || action.riskLevel === 'high') {
      decision = 'requires_admin_approval';
      message = `Action "${action.actionLabel}" is high-risk and requires admin approval.`;
    } else if (action.requiresConfirmation || action.riskLevel === 'medium') {
      decision = 'requires_confirmation';
      message = `Action "${action.actionLabel}" requires confirmation before proceeding.`;
    } else {
      decision = 'allowed';
      message = `Action "${action.actionLabel}" is available and low-risk.`;
    }

    return {
      appId,
      actionKey: action.actionKey,
      riskLevel: action.riskLevel,
      decision,
      requiresConfirmation: action.requiresConfirmation || action.riskLevel === 'medium',
      requiresAdminApproval: action.requiresAdminApproval || action.riskLevel === 'high',
      message,
    };
  }
}
