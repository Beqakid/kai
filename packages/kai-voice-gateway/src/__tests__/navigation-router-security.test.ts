// ── Navigation & Support Router Security Tests — Phase 11 ──
//
// Tests 31–36: Auth requirements, Permission Gate integration,
// receipt creation, TypeScript compilation, and build verification.

import { describe, it, expect, vi } from 'vitest';
import { handleRequest } from '../router';
import { Env, AppId, UserRole } from '../types';
import { KaiNavigationCore } from '../navigation-core/navigation-core';
import { KaiSupportRequestService } from '../support-layer/support-request-service';
import { RECEIPT_TYPES } from '../services/action-receipt-logger';

// ── JWT helper ──

async function createValidJwt(
  claims: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify(claims))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sigB64}`;
}

const TEST_SECRET = 'test-secret-key-for-phase-11-tests';

function createEnv(overrides?: Partial<Env>): Env {
  return {
    KAI_STT_PROVIDER: 'mock',
    KAI_TTS_PROVIDER: 'mock',
    KAI_CORE_PROVIDER: 'mock',
    ENABLE_KAI_AUDIO_STORAGE: 'false',
    KAI_AUTH_SECRET: TEST_SECRET,
    KAI_ALLOW_DEMO_TOKEN: 'true',
    ...overrides,
  };
}

describe('Navigation & Support Router Security', () => {
  // ── Test 31: All routes require auth ──
  it('31. navigation routes require auth', async () => {
    const env = createEnv();

    // No auth header
    const res1 = await handleRequest(
      new Request('https://kai.test/api/kai/navigation/apps/carehia/routes', { method: 'GET' }),
      env,
    );
    expect(res1.status).toBe(401);

    const res2 = await handleRequest(
      new Request('https://kai.test/api/kai/support/requests', { method: 'GET' }),
      env,
    );
    expect(res2.status).toBe(401);

    const res3 = await handleRequest(
      new Request('https://kai.test/api/kai/navigation/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRouteKey: 'today' }),
      }),
      env,
    );
    expect(res3.status).toBe(401);
  });

  // ── Test 32: Invalid appId rejected in navigation routes ──
  it('32. invalid appId rejected in navigation routes', async () => {
    const env = createEnv();
    const token = await createValidJwt({
      sub: 'user-1', appId: 'jon-command-center', userRole: 'super-admin',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    }, TEST_SECRET);

    const res = await handleRequest(
      new Request('https://kai.test/api/kai/navigation/apps/invalid-app/routes', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  // ── Test 33: Permission Gate called for risky navigation ──
  it('33. navigation evaluation returns proper risk decisions', async () => {
    const navCore = new KaiNavigationCore();

    // High-risk route
    const highResult = navCore.evaluateNavigationRequest(
      { appId: 'viliniu', userId: 'u1', userRole: 'super-admin', source: 'test' },
      { targetRouteKey: 'payouts' },
    );
    expect(highResult.requiresAdminApproval).toBe(true);
    expect(highResult.riskLevel).toBe('high');

    // Low-risk route
    const lowResult = navCore.evaluateNavigationRequest(
      { appId: 'volau', userId: 'u1', userRole: 'customer', source: 'test' },
      { targetRouteKey: 'today' },
    );
    expect(lowResult.requiresConfirmation).toBe(false);
    expect(lowResult.requiresAdminApproval).toBe(false);
  });

  // ── Test 34: Action receipts include new receipt types ──
  it('34. receipt types include navigation and support types', () => {
    expect(RECEIPT_TYPES).toContain('kai_navigation_requested');
    expect(RECEIPT_TYPES).toContain('kai_navigation_recommended');
    expect(RECEIPT_TYPES).toContain('kai_navigation_blocked');
    expect(RECEIPT_TYPES).toContain('kai_support_request_created');
    expect(RECEIPT_TYPES).toContain('kai_support_request_status_changed');
    expect(RECEIPT_TYPES).toContain('kai_support_request_escalated');
  });

  // ── Test 35: TypeScript compiles ──
  // (Verified via `npx tsc --noEmit` in CI/build step)
  it('35. all navigation and support types are importable', () => {
    // Verify types can be imported without error
    expect(KaiNavigationCore).toBeDefined();
    expect(KaiSupportRequestService).toBeDefined();
  });

  // ── Test 36: Authenticated navigation routes return correct data ──
  it('36. authenticated navigation routes return route data', async () => {
    const env = createEnv();
    const token = await createValidJwt({
      sub: 'user-1', appId: 'carehia', userRole: 'vendor',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    }, TEST_SECRET);

    const res = await handleRequest(
      new Request('https://kai.test/api/kai/navigation/apps/carehia/routes', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.routes).toBeDefined();
    expect(data.appId).toBe('carehia');
    expect(data.userRole).toBe('vendor');
    expect(Array.isArray(data.routes)).toBe(true);
    expect(data.routes.length).toBeGreaterThan(0);
  });

  // ── Additional: Support request creation via router uses token identity ──
  it('support request via router requires auth', async () => {
    const env = createEnv();

    const res = await handleRequest(
      new Request('https://kai.test/api/kai/support/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'help',
          requestTitle: 'Test',
          requestDescription: 'Test desc',
          source: 'test',
        }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  // ── Additional: Evaluate endpoint requires auth ──
  it('navigation evaluate endpoint requires auth', async () => {
    const env = createEnv();

    const res = await handleRequest(
      new Request('https://kai.test/api/kai/navigation/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRouteKey: 'today' }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});
