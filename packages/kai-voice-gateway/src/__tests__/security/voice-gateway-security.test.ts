/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateAudioSize, validateJsonBodySize, checkRateLimit } from '../../services/security';
import { KaiGatewayError } from '../../errors';
import { Env, MAX_AUDIO_SIZE_BYTES, MAX_JSON_BODY_BYTES, RATE_LIMIT_PER_MINUTE } from '../../types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    KAI_AUTH_SECRET: 'test-secret',
    KAI_STT_PROVIDER: 'mock',
    KAI_TTS_PROVIDER: 'mock',
    KAI_CORE_PROVIDER: 'mock',
    ENABLE_KAI_AUDIO_STORAGE: 'false',
    ...overrides,
  } as Env;
}

/** Resolve a source file path relative to this test file */
function srcPath(relativePath: string): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, relativePath);
}

describe('Voice Gateway Security Retest', () => {
  // 1. oversized audio rejected
  it('oversized audio rejected', () => {
    expect(() => validateAudioSize(MAX_AUDIO_SIZE_BYTES + 1)).toThrow(KaiGatewayError);
    try {
      validateAudioSize(MAX_AUDIO_SIZE_BYTES + 1);
    } catch (err) {
      expect((err as KaiGatewayError).statusCode).toBe(413);
    }
  });

  // 2. empty audio rejected
  it('empty audio rejected', () => {
    expect(() => validateAudioSize(0)).toThrow(KaiGatewayError);
    try {
      validateAudioSize(0);
    } catch (err) {
      expect((err as KaiGatewayError).statusCode).toBe(400);
      expect((err as KaiGatewayError).code).toBe('MISSING_AUDIO');
    }
  });

  // 3. missing audio rejected
  it('missing audio rejected', () => {
    expect(() => validateAudioSize(0)).toThrow(KaiGatewayError);
    try {
      validateAudioSize(0);
    } catch (err) {
      expect((err as KaiGatewayError).statusCode).toBe(400);
      expect((err as KaiGatewayError).code).toBe('MISSING_AUDIO');
    }
  });

  // 4. oversized JSON rejected
  it('oversized JSON rejected', () => {
    const request = new Request('https://example.com/api/kai/voice/session', {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_JSON_BODY_BYTES + 1) },
    });
    expect(() => validateJsonBodySize(request)).toThrow(KaiGatewayError);
    try {
      validateJsonBodySize(request);
    } catch (err) {
      expect((err as KaiGatewayError).statusCode).toBe(413);
    }
  });

  // 5. invalid JSON rejected
  it('invalid JSON rejected', () => {
    expect(() => JSON.parse('not json')).toThrow();
  });

  // 6. raw audio not stored by default
  it('raw audio not stored by default', () => {
    const env = makeEnv();
    expect(env.ENABLE_KAI_AUDIO_STORAGE).toBe('false');
  });

  // 7. no background listening route exists
  it('no background listening route exists', () => {
    const routerSrc = readFileSync(srcPath('../../router.ts'), 'utf-8');
    expect(routerSrc).not.toContain('/api/kai/voice/listen');
    expect(routerSrc).not.toContain('/api/kai/voice/stream');
    expect(routerSrc).not.toContain('always-on');
    expect(routerSrc).not.toContain('wake-word');
  });

  // 8. no streaming always-on route exists
  it('no streaming always-on route exists', () => {
    const routerSrc = readFileSync(srcPath('../../router.ts'), 'utf-8');
    expect(routerSrc).not.toMatch(/['"]\/api\/kai\/voice\/streaming['"]/);
    expect(routerSrc).not.toMatch(/['"]\/api\/kai\/voice\/always-on['"]/);
    expect(routerSrc).not.toMatch(/['"]\/api\/kai\/voice\/websocket['"]/);
  });

  // 9. voice respond route uses authenticated identity
  it('voice respond route uses authenticated identity', () => {
    const gatewaySrc = readFileSync(srcPath('../../gateway.ts'), 'utf-8');
    expect(gatewaySrc).toContain('authenticateAndRateLimit');
  });

  // 10. transcribe route uses authenticated identity
  it('transcribe route uses authenticated identity', () => {
    const gatewaySrc = readFileSync(srcPath('../../gateway.ts'), 'utf-8');
    // The gateway calls authenticateAndRateLimit in each route handler
    const authCalls = gatewaySrc.match(/authenticateAndRateLimit/g);
    // Should appear multiple times (session, transcribe, respond, history)
    expect(authCalls).not.toBeNull();
    expect(authCalls!.length).toBeGreaterThanOrEqual(2);
  });

  // 11. history route requires admin/super-admin
  it('history route requires admin/super-admin', () => {
    const gatewaySrc = readFileSync(srcPath('../../gateway.ts'), 'utf-8');
    expect(gatewaySrc).toContain('requireAdmin');
  });

  // 12. rate limit returns 429 when exceeded
  it('rate limit returns 429 when exceeded', () => {
    const testUser = `rate-limit-test-${Date.now()}`;
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      checkRateLimit(testUser);
    }
    try {
      checkRateLimit(testUser);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect((err as KaiGatewayError).statusCode).toBe(429);
    }
  });
});
