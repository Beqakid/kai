// ── Authentication & Validation Middleware ──
//
// Phase 5: All routes require auth. appId, userRole, and allowedActions
// are validated server-side. Client-provided allowedActions are intersected
// with the server-side registry — never trusted directly.

import {
  Env,
  VALID_APP_IDS,
  VALID_ROLES,
  ADMIN_ROLES,
  AppId,
  UserRole,
} from './types';
import { Errors } from './errors';
import {
  validateAllowedActions,
  checkRateLimit,
  validateJsonBodySize,
} from './services/security';

/**
 * Extract and verify the auth token from the request.
 * In production, verify JWT signature against KAI_AUTH_SECRET.
 * Returns userId extracted from the token.
 */
export function authenticateRequest(
  request: Request,
  env: Env,
): { userId: string } {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Errors.unauthorized('Missing or malformed Authorization header.');
  }

  const token = authHeader.slice(7);

  if (!token || token.length === 0) {
    throw Errors.unauthorized('Empty auth token.');
  }

  // ── Phase 5: Token verification ──
  // In production, verify JWT: const payload = await verifyJWT(token, env.KAI_AUTH_SECRET);
  // For now, accept demo-token and any non-empty token

  if (token === 'demo-token') {
    return { userId: 'demo-user-001' };
  }

  // Future: proper JWT verification with KAI_AUTH_SECRET
  return { userId: 'authenticated-user' };
}

/**
 * Full request authentication + rate limiting.
 * Call this at the top of every route handler.
 */
export function authenticateAndRateLimit(
  request: Request,
  env: Env,
): { userId: string } {
  const auth = authenticateRequest(request, env);
  checkRateLimit(auth.userId);
  return auth;
}

/** Validate that appId is a known, supported app */
export function validateAppId(appId: string): AppId {
  if (!appId) {
    throw Errors.missingField('appId');
  }
  if (!VALID_APP_IDS.includes(appId as AppId)) {
    throw Errors.invalidAppId(appId);
  }
  return appId as AppId;
}

/** Validate that userRole is a known role.
 *  Normalizes underscores to hyphens (e.g. "super_admin" → "super-admin")
 *  so both conventions work seamlessly.
 */
export function validateUserRole(role: string): UserRole {
  if (!role) {
    throw Errors.missingField('userRole');
  }
  const normalized = role.replace(/_/g, '-') as UserRole;
  if (!VALID_ROLES.includes(normalized)) {
    throw Errors.invalidUserRole(role);
  }
  return normalized;
}

/** Check if user has admin access for history endpoints */
export function requireAdmin(userRole: UserRole): void {
  if (!ADMIN_ROLES.has(userRole)) {
    throw Errors.forbidden('Admin access required to view voice history.');
  }
}

/**
 * Validate all common required fields for voice requests.
 * Server-side enforces allowedActions — client values are intersected
 * with the registry, not trusted directly.
 */
export function validateVoiceRequest(body: Record<string, unknown>): {
  appId: AppId;
  userId: string;
  userRole: UserRole;
  currentScreen: string;
  allowedActions: string[];
} {
  if (!body.userId || typeof body.userId !== 'string') {
    throw Errors.missingField('userId');
  }
  if (!body.currentScreen || typeof body.currentScreen !== 'string') {
    throw Errors.missingField('currentScreen');
  }

  const appId = validateAppId(body.appId as string);
  const userRole = validateUserRole(body.userRole as string);

  // Client sends allowedActions, but server intersects with registry
  const clientActions = Array.isArray(body.allowedActions)
    ? (body.allowedActions as string[])
    : [];
  const allowedActions = validateAllowedActions(appId, userRole, clientActions);

  return {
    appId,
    userId: body.userId,
    userRole,
    currentScreen: body.currentScreen,
    allowedActions,
  };
}
