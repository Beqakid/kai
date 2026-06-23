import { describe, it, expect } from 'vitest';
import { authenticateRequest, validateVoiceRequest, AuthResult } from '../../auth';
import { KaiGatewayError } from '../../errors';
import { Env } from '../../types';

// ── JWT Helpers ──

const TEST_SECRET = 'test-kai-secret-key-minimum-32chars!!';

function base64urlEncode(data: Uint8Array | string): string {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < input.length; i++) binary += String.fromCharCode(input[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createJWT(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET,
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
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

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { sub: 'user-123', appId: 'jon-command-center', userRole: 'super-admin', iat: now - 60, exp: now + 3600, ...overrides };
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

function makeRequest(token?: string, headers?: Record<string, string>): Request {
  const h: Record<string, string> = { ...headers };
  if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
  return new Request('https://example.com/api/kai/voice/session', { method: 'POST', headers: h });
}

// ── Tests ──

describe('Auth Security Retest', () => {
  it('missing token rejected', async () => {
    const req = makeRequest(); // no token
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
    }
  });

  it('malformed JWT rejected', async () => {
    const req = makeRequest('not.a.jwt');
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/Malformed JWT/i);
    }
  });

  it('expired JWT rejected', async () => {
    const token = await createJWT(validClaims({ exp: Math.floor(Date.now() / 1000) - 600 }));
    const req = makeRequest(token);
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/expired/i);
    }
  });

  it('invalid signature rejected', async () => {
    const token = await createJWT(validClaims(), 'wrong-secret-that-is-at-least-32chars!!');
    const req = makeRequest(token);
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/Invalid JWT signature/i);
    }
  });

  it('missing required claims rejected', async () => {
    // JWT without appId
    const claims = validClaims();
    delete claims.appId;
    const token = await createJWT(claims);
    const req = makeRequest(token);
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/missing required/i);
    }
  });

  it('invalid appId rejected', async () => {
    const token = await createJWT(validClaims({ appId: 'fake-app' }));
    const req = makeRequest(token);
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/invalid appId/i);
    }
  });

  it('invalid userRole rejected', async () => {
    const token = await createJWT(validClaims({ userRole: 'hacker' }));
    const req = makeRequest(token);
    const env = makeEnv();
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
      expect((err as KaiGatewayError).details).toMatch(/invalid userRole/i);
    }
  });

  it('demo-token rejected in production', async () => {
    const req = makeRequest('demo-token');
    const env = makeEnv(); // KAI_ALLOW_DEMO_TOKEN not set
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(401);
    }
  });

  it('demo-token accepted only when KAI_ALLOW_DEMO_TOKEN=true', async () => {
    const req = makeRequest('demo-token');
    const env = makeEnv({ KAI_ALLOW_DEMO_TOKEN: 'true' });
    const result = await authenticateRequest(req, env);
    expect(result).toBeDefined();
    expect(result.userId).toBe('demo-user-001');
    expect(result.appId).toBe('jon-command-center');
    expect(result.userRole).toBe('super-admin');
  });

  it('request body cannot override token userId', () => {
    const auth: AuthResult = { userId: 'user-123', appId: 'jon-command-center', userRole: 'super-admin' };
    const body = { userId: 'hacker-456', currentScreen: 'dashboard', allowedActions: ['view'] };
    const result = validateVoiceRequest(body, auth);
    expect(result.userId).toBe('user-123');
  });

  it('request body cannot override token appId', () => {
    const auth: AuthResult = { userId: 'user-123', appId: 'jon-command-center', userRole: 'super-admin' };
    const body = { appId: 'carehia', currentScreen: 'dashboard', allowedActions: ['view'] };
    try {
      validateVoiceRequest(body, auth);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(403);
    }
  });

  it('request body cannot override token userRole', () => {
    const auth: AuthResult = { userId: 'user-123', appId: 'jon-command-center', userRole: 'viewer' };
    const body = { userRole: 'super-admin', currentScreen: 'dashboard', allowedActions: ['view'] };
    try {
      validateVoiceRequest(body, auth);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(403);
    }
  });

  it('missing KAI_AUTH_SECRET fails safely', async () => {
    const token = await createJWT(validClaims());
    const req = makeRequest(token);
    const env = makeEnv({ KAI_AUTH_SECRET: '' as unknown as string });
    try {
      await authenticateRequest(req, env);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(KaiGatewayError);
      expect((err as KaiGatewayError).statusCode).toBe(500);
      expect((err as KaiGatewayError).code).toBe('GATEWAY_FAILURE');
    }
  });

  it('valid token succeeds', async () => {
    const token = await createJWT(validClaims());
    const req = makeRequest(token);
    const env = makeEnv();
    const result = await authenticateRequest(req, env);
    expect(result).toBeDefined();
    expect(result.userId).toBe('user-123');
    expect(result.appId).toBe('jon-command-center');
    expect(result.userRole).toBe('super-admin');
  });
});
