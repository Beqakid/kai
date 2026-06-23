// ── Authentication & Validation Middleware ──
//
// Phase 2: Real JWT verification using KAI_AUTH_SECRET (HMAC-SHA256).
// demo-token is only accepted when KAI_ALLOW_DEMO_TOKEN=true (local/dev).
// Token claims (sub, appId, userRole) are authoritative — body values
// that conflict with token claims are rejected.

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

// ── JWT Types ──

/** Claims expected inside a Kai JWT */
export interface KaiTokenClaims {
  /** Subject — the authenticated user's ID */
  sub: string;
  /** Optional userId alias (sub takes precedence) */
  userId?: string;
  /** App the token was issued for */
  appId: string;
  /** User's role within the app */
  userRole: string;
  /** Issued-at (Unix seconds) */
  iat: number;
  /** Expiration (Unix seconds) */
  exp: number;
}

/** Result of successful authentication */
export interface AuthResult {
  userId: string;
  appId: AppId;
  userRole: UserRole;
}

// ── JWT Verification (Web Crypto — Cloudflare Workers compatible) ──

/**
 * Base64url-decode a string to a Uint8Array.
 */
function base64urlDecode(input: string): Uint8Array {
  // Restore standard base64 characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify an HMAC-SHA256 JWT and return its payload.
 * Uses the Web Crypto API (available in Cloudflare Workers).
 */
async function verifyJWT(
  token: string,
  secret: string,
): Promise<KaiTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Errors.unauthorized('Malformed JWT: expected 3 parts.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode and validate header
  let header: { alg: string; typ?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  } catch {
    throw Errors.unauthorized('Malformed JWT header.');
  }

  if (header.alg !== 'HS256') {
    throw Errors.unauthorized(`Unsupported JWT algorithm: "${header.alg}". Only HS256 is accepted.`);
  }

  // Import the secret as an HMAC key
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // Verify signature
  const signedContent = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  const isValid = await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    signature,
    signedContent,
  );

  if (!isValid) {
    throw Errors.unauthorized('Invalid JWT signature.');
  }

  // Decode payload
  let payload: KaiTokenClaims;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    throw Errors.unauthorized('Malformed JWT payload.');
  }

  // Validate required claims
  if (!payload.exp || typeof payload.exp !== 'number') {
    throw Errors.unauthorized('JWT missing required "exp" claim.');
  }
  if (!payload.iat || typeof payload.iat !== 'number') {
    throw Errors.unauthorized('JWT missing required "iat" claim.');
  }

  // Check expiration
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw Errors.unauthorized('JWT has expired.');
  }

  // iat must not be in the future (with 60s clock-skew tolerance)
  if (payload.iat > nowSeconds + 60) {
    throw Errors.unauthorized('JWT "iat" is in the future.');
  }

  // Resolve userId from sub (preferred) or userId fallback
  const userId = payload.sub || payload.userId;
  if (!userId || typeof userId !== 'string') {
    throw Errors.unauthorized('JWT missing required "sub" (or "userId") claim.');
  }

  // Validate appId claim
  if (!payload.appId || typeof payload.appId !== 'string') {
    throw Errors.unauthorized('JWT missing required "appId" claim.');
  }
  if (!VALID_APP_IDS.includes(payload.appId as AppId)) {
    throw Errors.unauthorized(`JWT contains invalid appId: "${payload.appId}".`);
  }

  // Validate userRole claim
  if (!payload.userRole || typeof payload.userRole !== 'string') {
    throw Errors.unauthorized('JWT missing required "userRole" claim.');
  }
  const normalizedRole = payload.userRole.replace(/_/g, '-') as UserRole;
  if (!VALID_ROLES.includes(normalizedRole)) {
    throw Errors.unauthorized(`JWT contains invalid userRole: "${payload.userRole}".`);
  }

  return {
    ...payload,
    sub: userId,
    userRole: normalizedRole,
    appId: payload.appId,
  };
}

// ── Public Auth API ──

/**
 * Extract and verify the auth token from the request.
 *
 * Production: verifies JWT signature against KAI_AUTH_SECRET.
 * Dev/local:  accepts demo-token ONLY if KAI_ALLOW_DEMO_TOKEN=true.
 *
 * Returns the authenticated user identity from the verified token.
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Errors.unauthorized('Missing or malformed Authorization header.');
  }

  const token = authHeader.slice(7);

  if (!token || token.length === 0) {
    throw Errors.unauthorized('Empty auth token.');
  }

  // ── Demo-token: only in dev mode ──
  if (token === 'demo-token') {
    if (env.KAI_ALLOW_DEMO_TOKEN === 'true') {
      return {
        userId: 'demo-user-001',
        appId: 'jon-command-center',
        userRole: 'super-admin',
      };
    }
    throw Errors.unauthorized(
      'demo-token is not accepted in production. Set KAI_ALLOW_DEMO_TOKEN=true for local development.',
    );
  }

  // ── Real JWT verification ──
  if (!env.KAI_AUTH_SECRET) {
    throw Errors.gatewayFailure(
      'KAI_AUTH_SECRET is not configured. Cannot verify JWT tokens.',
    );
  }

  const claims = await verifyJWT(token, env.KAI_AUTH_SECRET);

  return {
    userId: claims.sub,
    appId: claims.appId as AppId,
    userRole: claims.userRole as UserRole,
  };
}

/**
 * Full request authentication + rate limiting.
 * Call this at the top of every route handler.
 */
export async function authenticateAndRateLimit(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  const auth = await authenticateRequest(request, env);
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
 *
 * If AuthResult is provided (from JWT), the token's appId/userRole are
 * authoritative. Body values that conflict with the token are rejected.
 * userId always comes from the token when available.
 *
 * Server-side enforces allowedActions — client values are intersected
 * with the registry, not trusted directly.
 */
export function validateVoiceRequest(
  body: Record<string, unknown>,
  auth?: AuthResult,
): {
  appId: AppId;
  userId: string;
  userRole: UserRole;
  currentScreen: string;
  allowedActions: string[];
} {
  if (!body.currentScreen || typeof body.currentScreen !== 'string') {
    throw Errors.missingField('currentScreen');
  }

  let appId: AppId;
  let userRole: UserRole;
  let userId: string;

  if (auth) {
    // Token claims are authoritative
    appId = auth.appId;
    userRole = auth.userRole;
    userId = auth.userId;

    // Reject if body appId/userRole conflicts with token
    if (body.appId && typeof body.appId === 'string') {
      const bodyAppId = body.appId as string;
      if (bodyAppId !== appId) {
        throw Errors.forbidden(
          `Request body appId "${bodyAppId}" conflicts with token appId "${appId}".`,
        );
      }
    }

    if (body.userRole && typeof body.userRole === 'string') {
      const bodyRole = (body.userRole as string).replace(/_/g, '-');
      if (bodyRole !== userRole) {
        throw Errors.forbidden(
          `Request body userRole "${body.userRole}" conflicts with token userRole "${userRole}".`,
        );
      }
    }

    // Do NOT trust userId from body when token provides it
    if (body.userId && typeof body.userId === 'string' && body.userId !== userId) {
      // Log the mismatch but use the token's userId
      console.warn(
        `[Auth] Body userId "${body.userId}" differs from token userId "${userId}". Using token value.`,
      );
    }
  } else {
    // Fallback for cases without auth context (should not happen in production)
    if (!body.userId || typeof body.userId !== 'string') {
      throw Errors.missingField('userId');
    }
    userId = body.userId;
    appId = validateAppId(body.appId as string);
    userRole = validateUserRole(body.userRole as string);
  }

  // Client sends allowedActions, but server intersects with registry
  const clientActions = Array.isArray(body.allowedActions)
    ? (body.allowedActions as string[])
    : [];
  const allowedActions = validateAllowedActions(appId, userRole, clientActions);

  return {
    appId,
    userId,
    userRole,
    currentScreen: body.currentScreen,
    allowedActions,
  };
}
