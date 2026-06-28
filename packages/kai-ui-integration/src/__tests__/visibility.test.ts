import { describe, it, expect } from 'vitest';
import { canRenderAssistantOrb, isRouteHidden, getHiddenRoutePatterns } from '../visibility';
import { DEFAULT_HIDDEN_ROUTE_PATTERNS } from '../types';

describe('canRenderAssistantOrb', () => {
  const baseConfig = {
    isAuthenticated: true,
    isAuthLoading: false,
    currentRoute: '/dashboard',
  };

  it('returns false when isAuthLoading=true', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, isAuthLoading: true })).toBe(false);
  });

  it('returns false when isAuthenticated=false', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, isAuthenticated: false })).toBe(false);
  });

  it('returns false on /login route', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/login' })).toBe(false);
  });

  it('returns false on /signup route', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/signup' })).toBe(false);
  });

  it('returns false on /onboarding route', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/onboarding' })).toBe(false);
  });

  it('returns false on /password-reset route', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/password-reset' })).toBe(false);
  });

  it('returns false on /auth/callback route', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/auth/callback' })).toBe(false);
  });

  it('returns true on /dashboard (authenticated)', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/dashboard' })).toBe(true);
  });

  it('returns true on /orders (authenticated)', () => {
    expect(canRenderAssistantOrb({ ...baseConfig, currentRoute: '/orders' })).toBe(true);
  });

  it('returns false for hidden roles', () => {
    expect(
      canRenderAssistantOrb({
        ...baseConfig,
        userRole: 'admin',
        hiddenRoles: ['admin'],
      }),
    ).toBe(false);
  });
});

describe('isRouteHidden', () => {
  const patterns = ['/login', '/signup', '/auth'];

  it('matches exact route', () => {
    expect(isRouteHidden('/login', patterns)).toBe(true);
  });

  it('matches route prefix', () => {
    expect(isRouteHidden('/auth/callback', patterns)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRouteHidden('/LOGIN', patterns)).toBe(true);
  });

  it('returns false for non-matching route', () => {
    expect(isRouteHidden('/dashboard', patterns)).toBe(false);
  });
});

describe('getHiddenRoutePatterns', () => {
  it('returns defaults when no extras', () => {
    const patterns = getHiddenRoutePatterns();
    expect(patterns).toEqual([...DEFAULT_HIDDEN_ROUTE_PATTERNS]);
  });

  it('merges extras without duplicates', () => {
    const patterns = getHiddenRoutePatterns(['/custom', '/login']);
    // /login already in defaults so should not be duplicated
    expect(patterns.filter((p) => p === '/login')).toHaveLength(1);
    expect(patterns).toContain('/custom');
  });
});
