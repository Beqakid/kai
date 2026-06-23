// ── Auth Tests — Phase 2: Real JWT Verification ──

import { describe, it, expect } from 'vitest';
import { authenticateRequest, AuthResult, validateVoiceRequest } from '../auth';
import { KaiGatewayError } from '../errors';
import { Env } from '../types';

// ── Test Helpers ──

const TEST_SECRET = 'test-kai-secret-key-minimum-32chars!!';

function base64urlEncode(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < input.length; i++) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createJWT(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET,
  alg: string = 'HS256',
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg, typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`)),
  );
  return `${header}.${body}.${base64urlEncode(sig)}`;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    KAI_AUTH_SECRET: TEST_SECRET,
    KAI_STT_PROVIDER: 'mock',
    KAI_TTS_PROVIDER: 'mock',
    KAI_CORE_PROVIDER: 'mock',
    ENABLE_KAI_AUDIO_STORAGE: 'false',
    ...overrides,
  } as Env;
}

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return new Request('https://example.com/api/kai/voice/session', { method: 'POST', headers });
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { sub: 'user-123', appId: 'jon-command-center', userRole: 'super-admin', iat: now - 60, exp: now + 3600, ...overrides };
}

/** Helper: expect authenticateRequest to reject with a specific status code and details substring */
async function expectAuthError(
  req: Request,
  env: Env,
  expectedStatus: number,
  detailsSubstring?: string,
) {
  try {
    await authenticateRequest(req, env);
    expect.unreachable('Should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(KaiGatewayError);
    const e = err as KaiGatewayError;
    expect(e.statusCode).toBe(expectedStatus);
    if (detailsSubstring) {
      expect(e.details).toContain(detailsSubstring);
    }
  }
}

// ── Tests ──

describe('authenticateRequest', () => {
  // 1. Missing token → 401
  it('rejects request with no Authorization header', async () => {
    const req = new Request('https://example.com/', { method: 'POST' });
    await expectAuthError(req, makeEnv(), 401, 'Missing or malformed');
  });

  it('rejects request with non-Bearer auth header', async () => {
    const req = new Request('https://example.com/', {
      method: 'POST', headers: { Authorization: 'Basic abc123' },
    });
    await expectAuthError(req, makeEnv(), 401, 'Missing or malformed');
  });

  // 2. Malformed token → 401
  it('rejects a malformed JWT (not 3 parts)', async () => {
    await expectAuthError(makeRequest('not-a-jwt'), makeEnv(), 401, 'Malformed JWT');
  });

  // 3. Expired token → 401
  it('rejects an expired JWT', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createJWT({ sub: 'user-123', appId: 'jon-command-center', userRole: 'super-admin', iat: now - 7200, exp: now - 3600 });
    await expectAuthError(makeRequest(token), makeEnv(), 401, 'expired');
  });

  // 4. Invalid signature → 401
  it('rejects a JWT signed with wrong secret', async () => {
    const token = await createJWT(validClaims(), 'wrong-secret-key-definitely-not-right');
    await expectAuthError(makeRequest(token), makeEnv(), 401, 'Invalid JWT signature');
  });

  // 5. Valid token succeeds
  it('accepts a valid JWT and returns correct auth result', async () => {
    const token = await createJWT(validClaims());
    const result = await authenticateRequest(makeRequest(token), makeEnv());
    expect(result).toEqual({ userId: 'user-123', appId: 'jon-command-center', userRole: 'super-admin' });
  });

  it('uses "sub" as userId when both sub and userId are present', async () => {
    const token = await createJWT(validClaims({ sub: 'from-sub', userId: 'from-userId' }));
    const result = await authenticateRequest(makeRequest(token), makeEnv());
    expect(result.userId).toBe('from-sub');
  });

  it('falls back to "userId" when "sub" is not present', async () => {
    const claims = validClaims();
    delete claims.sub;
    claims.userId = 'fallback-user';
    const token = await createJWT(claims);
    const result = await authenticateRequest(makeRequest(token), makeEnv());
    expect(result.userId).toBe('fallback-user');
  });

  // 6. demo-token rejected unless dev flag enabled
  it('rejects demo-token in production (no flag)', async () => {
    await expectAuthError(makeRequest('demo-token'), makeEnv(), 401, 'demo-token is not accepted');
  });

  it('rejects demo-token when KAI_ALLOW_DEMO_TOKEN is not "true"', async () => {
    await expectAuthError(makeRequest('demo-token'), makeEnv({ KAI_ALLOW_DEMO_TOKEN: 'false' }), 401, 'demo-token is not accepted');
  });

  it('accepts demo-token when KAI_ALLOW_DEMO_TOKEN=true', async () => {
    const result = await authenticateRequest(makeRequest('demo-token'), makeEnv({ KAI_ALLOW_DEMO_TOKEN: 'true' }));
    expect(result.userId).toBe('demo-user-001');
    expect(result.appId).toBe('jon-command-center');
    expect(result.userRole).toBe('super-admin');
  });

  // 7. Missing required claims
  it('rejects JWT without exp claim', async () => {
    const c = validClaims(); delete c.exp;
    const token = await createJWT(c);
    await expectAuthError(makeRequest(token), makeEnv(), 401, '"exp"');
  });

  it('rejects JWT without iat claim', async () => {
    const c = validClaims(); delete c.iat;
    const token = await createJWT(c);
    await expectAuthError(makeRequest(token), makeEnv(), 401, '"iat"');
  });

  it('rejects JWT without sub or userId', async () => {
    const c = validClaims(); delete c.sub;
    const token = await createJWT(c);
    await expectAuthError(makeRequest(token), makeEnv(), 401, '"sub"');
  });

  it('rejects JWT with invalid appId', async () => {
    const token = await createJWT(validClaims({ appId: 'unknown-app' }));
    await expectAuthError(makeRequest(token), makeEnv(), 401, 'invalid appId');
  });

  it('rejects JWT with invalid userRole', async () => {
    const token = await createJWT(validClaims({ userRole: 'hacker' }));
    await expectAuthError(makeRequest(token), makeEnv(), 401, 'invalid userRole');
  });

  // 8. Missing KAI_AUTH_SECRET → 500
  it('returns 500 when KAI_AUTH_SECRET is not set', async () => {
    const token = await createJWT(validClaims());
    await expectAuthError(makeRequest(token), makeEnv({ KAI_AUTH_SECRET: '' }), 500, 'KAI_AUTH_SECRET');
  });

  // 9. Normalizes userRole with underscores
  it('normalizes userRole with underscores to hyphens', async () => {
    const token = await createJWT(validClaims({ userRole: 'super_admin' }));
    const result = await authenticateRequest(makeRequest(token), makeEnv());
    expect(result.userRole).toBe('super-admin');
  });

  // 10. Unsupported algorithm
  it('rejects JWT with unsupported algorithm in header', async () => {
    const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64urlEncode(JSON.stringify(validClaims()));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(TEST_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`)));
    const token = `${header}.${body}.${base64urlEncode(sig)}`;
    await expectAuthError(makeRequest(token), makeEnv(), 401, 'Unsupported JWT algorithm');
  });
});

describe('validateVoiceRequest with auth context', () => {
  const auth: AuthResult = { userId: 'user-123', appId: 'jon-command-center', userRole: 'super-admin' };

  it('uses token identity when auth is provided', () => {
    const result = validateVoiceRequest(
      { currentScreen: 'dashboard', appId: 'jon-command-center', userRole: 'super-admin', userId: 'user-123' },
      auth,
    );
    expect(result.userId).toBe('user-123');
    expect(result.appId).toBe('jon-command-center');
    expect(result.userRole).toBe('super-admin');
  });

  it('rejects when body appId conflicts with token', () => {
    try {
      validateVoiceRequest({ currentScreen: 'dashboard', appId: 'carehia', userRole: 'super-admin', userId: 'user-123' }, auth);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(403);
      expect((err as KaiGatewayError).details).toContain('conflicts with token appId');
    }
  });

  it('rejects when body userRole conflicts with token', () => {
    try {
      validateVoiceRequest({ currentScreen: 'dashboard', appId: 'jon-command-center', userRole: 'admin', userId: 'user-123' }, auth);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(403);
      expect((err as KaiGatewayError).details).toContain('conflicts with token userRole');
    }
  });

  it('ignores body userId when token userId differs (uses token)', () => {
    const result = validateVoiceRequest(
      { currentScreen: 'dashboard', appId: 'jon-command-center', userRole: 'super-admin', userId: 'impersonated-user' },
      auth,
    );
    expect(result.userId).toBe('user-123'); // token wins
  });
});
