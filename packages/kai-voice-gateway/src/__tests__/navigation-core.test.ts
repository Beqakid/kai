// ── Navigation Core Tests — Phase 11 ──
// Updated for Phase 11 Phase 2 app-specific registries.
//
// Tests 1–14: Navigation Core service validation, role access,
// risk levels, decisions, receipts, and metadata sanitization.

import { describe, it, expect } from 'vitest';
import { KaiNavigationCore, sanitizeNavigationMetadata, validateAppId, validateRole } from '../navigation-core/navigation-core';
import { ALL_DEFAULT_ROUTES, ALL_DEFAULT_ACTIONS, getDefaultRoutesForApp, getDefaultRouteByKey } from '../navigation-core/default-routes';
import { KAI_SUPPORTED_APP_IDS } from '../navigation-core/types';
import { getRegistryRoutesForApp, getRegistryActionsForApp } from '../navigation-core/registries/index';

const navCore = new KaiNavigationCore();

describe('Navigation Core', () => {
  // ── Test 1: Valid appId accepted ──
  it('1. accepts valid appId values', () => {
    for (const appId of KAI_SUPPORTED_APP_IDS) {
      expect(() => validateAppId(appId)).not.toThrow();
    }
  });

  // ── Test 2: Invalid appId rejected ──
  it('2. rejects invalid appId values', () => {
    expect(() => validateAppId('invalid-app')).toThrow();
    expect(() => validateAppId('')).toThrow();
    expect(() => validateAppId('facebook')).toThrow();
  });

  // ── Test 3: Routes listed by app and role ──
  it('3. lists routes filtered by app and role', () => {
    // Phase 2: caregiver role in Carehia
    const routes = navCore.getRoutesForApp('carehia', 'caregiver');
    expect(routes.length).toBeGreaterThan(0);
    const routeKeys = routes.map(r => r.routeKey);
    expect(routeKeys).toContain('today');
    expect(routeKeys).toContain('work');
    expect(routeKeys).not.toContain('admin_verification_queue');
    expect(routeKeys).not.toContain('admin_incident_queue');
  });

  // ── Test 4: Role cannot see unauthorized route ──
  it('4. customer role cannot see admin routes', () => {
    const routes = navCore.getRoutesForApp('viliniu', 'customer');
    const routeKeys = routes.map(r => r.routeKey);
    expect(routeKeys).not.toContain('admin_vendor_review');
    expect(routeKeys).not.toContain('admin_disputes');
    expect(routeKeys).not.toContain('vendor_payouts');
    // Customer should see today, orders, support
    expect(routeKeys).toContain('today');
    expect(routeKeys).toContain('orders');
    expect(routeKeys).toContain('support');
  });

  // ── Test 5: Low-risk navigation is allowed/recommended ──
  it('5. low-risk navigation returns allowed decision', () => {
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'caregiver', source: 'test' },
      { targetRouteKey: 'today' },
    );
    expect(result.decision).toBe('allowed');
    expect(result.riskLevel).toBe('low');
    expect(result.requiresConfirmation).toBe(false);
    expect(result.requiresAdminApproval).toBe(false);
  });

  // ── Test 6: Medium-risk route requires confirmation ──
  it('6. medium-risk route requires confirmation', () => {
    // Phase 2: admin_support_queue is medium in Carehia
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'admin', source: 'test' },
      { targetRouteKey: 'admin_support_queue' },
    );
    expect(result.decision).toBe('requires_confirmation');
    expect(result.riskLevel).toBe('medium');
    expect(result.requiresConfirmation).toBe(true);
  });

  // ── Test 7: High-risk route requires admin approval ──
  it('7. high-risk route requires admin approval', () => {
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'admin', source: 'test' },
      { targetRouteKey: 'admin_verification_queue' },
    );
    expect(result.decision).toBe('requires_admin_approval');
    expect(result.riskLevel).toBe('high');
    expect(result.requiresAdminApproval).toBe(true);
  });

  // ── Test 8: Blocked action is blocked ──
  it('8. blocked action returns blocked decision', () => {
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'super-admin', source: 'test' },
      { targetActionKey: 'process_payment' },
    );
    expect(result.decision).toBe('blocked');
    expect(result.riskLevel).toBe('blocked');
  });

  // ── Test 9: Viliniu payout route is high risk ──
  it('9. Viliniu payout route is high risk', () => {
    // Phase 2: route key is vendor_payouts
    const result = navCore.evaluateNavigationRequest(
      { appId: 'viliniu', userId: 'u1', userRole: 'super-admin', source: 'test' },
      { targetRouteKey: 'vendor_payouts' },
    );
    expect(result.riskLevel).toBe('high');
    expect(result.decision).toBe('requires_admin_approval');
  });

  // ── Test 10: Carehia verification route is high risk ──
  it('10. Carehia trust_passport route is high risk', () => {
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'admin', source: 'test' },
      { targetRouteKey: 'trust_passport' },
    );
    expect(result.riskLevel).toBe('high');
    expect(result.decision).toBe('requires_admin_approval');
  });

  // ── Test 11: Volau emergency help is low risk ──
  it('11. Volau emergency_help route is low risk', () => {
    // Phase 2: role is public-user
    const result = navCore.evaluateNavigationRequest(
      { appId: 'volau', userId: 'u1', userRole: 'public-user', source: 'test' },
      { targetRouteKey: 'emergency_help' },
    );
    expect(result.riskLevel).toBe('low');
    expect(result.decision).toBe('allowed');
  });

  // ── Test 12: JCC receipts route is super-admin only ──
  it('12. JCC receipts route is super-admin only', () => {
    const adminRoutes = navCore.getRoutesForApp('jon-command-center', 'admin');
    const adminKeys = adminRoutes.map(r => r.routeKey);
    expect(adminKeys).not.toContain('receipts');

    const superRoutes = navCore.getRoutesForApp('jon-command-center', 'super-admin');
    const superKeys = superRoutes.map(r => r.routeKey);
    expect(superKeys).toContain('receipts');
  });

  // ── Test 13: Navigation receipt created ──
  it('13. navigation receipt is created with correct fields', () => {
    const context = { appId: 'carehia' as const, userId: 'u1', userRole: 'caregiver' as const, source: 'test' };
    const result = navCore.evaluateNavigationRequest(context, { targetRouteKey: 'today' });
    const receipt = navCore.createNavigationReceipt(result, context);

    expect(receipt.appId).toBe('carehia');
    expect(receipt.userId).toBe('u1');
    expect(receipt.userRole).toBe('caregiver');
    expect(receipt.routeKey).toBe('today');
    expect(receipt.decision).toBe('allowed');
    expect(receipt.riskLevel).toBe('low');
    expect(receipt.source).toBe('test');
  });

  // ── Test 14: Metadata sanitizer removes tokens/secrets ──
  it('14. metadata sanitizer removes sensitive keys', () => {
    const dirty = {
      token: 'abc123',
      jwt: 'eyJhbGciOi...',
      password: 'secret',
      api_key: 'key123',
      ssn: '123-45-6789',
      credit_card: '4111...',
      raw_audio: 'base64data...',
      normalField: 'safe value',
    };

    const cleaned = sanitizeNavigationMetadata(dirty);
    expect(cleaned!.token).toBe('[REDACTED]');
    expect(cleaned!.jwt).toBe('[REDACTED]');
    expect(cleaned!.password).toBe('[REDACTED]');
    expect(cleaned!.api_key).toBe('[REDACTED]');
    expect(cleaned!.ssn).toBe('[REDACTED]');
    expect(cleaned!.credit_card).toBe('[REDACTED]');
    expect(cleaned!.raw_audio).toBe('[REDACTED]');
    expect(cleaned!.normalField).toBe('safe value');
  });

  // ── Additional: Not-found route ──
  it('returns not_found for unknown route key', () => {
    const result = navCore.evaluateNavigationRequest(
      { appId: 'carehia', userId: 'u1', userRole: 'admin', source: 'test' },
      { targetRouteKey: 'nonexistent_route' },
    );
    expect(result.decision).toBe('not_found');
  });

  // ── Additional: Role-blocked route returns blocked ──
  it('returns blocked when role lacks access to a route', () => {
    // Phase 2: vendor_payouts, customer role
    const result = navCore.evaluateNavigationRequest(
      { appId: 'viliniu', userId: 'u1', userRole: 'customer', source: 'test' },
      { targetRouteKey: 'vendor_payouts' },
    );
    expect(result.decision).toBe('blocked');
  });

  // ── Additional: Default routes cover all apps ──
  it('has default routes for all supported apps', () => {
    for (const appId of KAI_SUPPORTED_APP_IDS) {
      const routes = getDefaultRoutesForApp(appId);
      expect(routes.length).toBeGreaterThan(0);
    }
  });

  // ── Additional: No empty route keys ──
  it('all default routes have non-empty keys', () => {
    for (const route of ALL_DEFAULT_ROUTES) {
      expect(route.routeKey).toBeTruthy();
      expect(route.routeLabel).toBeTruthy();
      expect(route.routePath).toBeTruthy();
    }
  });

  // ── Additional: All default actions have non-empty keys ──
  it('all default actions have non-empty keys', () => {
    for (const action of ALL_DEFAULT_ACTIONS) {
      expect(action.actionKey).toBeTruthy();
      expect(action.actionLabel).toBeTruthy();
    }
  });
});
