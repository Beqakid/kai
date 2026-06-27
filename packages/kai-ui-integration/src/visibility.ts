// ── Assistant Visibility Rules ──
// Determines when the assistant orb should be rendered.
// Rules: hidden during auth loading, hidden when logged out,
// hidden on auth/public routes.

import type { AssistantVisibilityConfig } from './types';
import { DEFAULT_HIDDEN_ROUTE_PATTERNS } from './types';

/**
 * Determine whether the assistant orb should be rendered.
 *
 * Rules (all must be true to render):
 * 1. Auth is not loading
 * 2. User is authenticated
 * 3. Current route does not match any hidden pattern
 * 4. User role is not in the hidden roles list (if specified)
 *
 * @returns true if the orb should be rendered
 */
export function canRenderAssistantOrb(config: AssistantVisibilityConfig): boolean {
  const {
    isAuthenticated,
    isAuthLoading,
    currentRoute,
    userRole,
    hiddenRoutePatterns = DEFAULT_HIDDEN_ROUTE_PATTERNS as unknown as string[],
    hiddenRoles,
  } = config;

  // Rule 1: Don't render while auth state is loading
  if (isAuthLoading) return false;

  // Rule 2: Don't render for unauthenticated users
  if (!isAuthenticated) return false;

  // Rule 3: Don't render on hidden routes
  if (isRouteHidden(currentRoute, hiddenRoutePatterns)) return false;

  // Rule 4: Don't render for hidden roles
  if (hiddenRoles && userRole && hiddenRoles.includes(userRole)) return false;

  return true;
}

/**
 * Check if a route matches any hidden route pattern.
 * Patterns match if the route starts with the pattern (case-insensitive).
 */
export function isRouteHidden(route: string, patterns: string[]): boolean {
  if (!route) return false;
  const normalizedRoute = route.toLowerCase().replace(/\/+$/, '');
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase().replace(/\/+$/, '');
    return (
      normalizedRoute === normalizedPattern ||
      normalizedRoute.startsWith(normalizedPattern + '/')
    );
  });
}

/**
 * Get default hidden route patterns merged with app-specific extras.
 */
export function getHiddenRoutePatterns(extraPatterns?: string[]): string[] {
  const base = [...DEFAULT_HIDDEN_ROUTE_PATTERNS];
  if (extraPatterns) {
    for (const pattern of extraPatterns) {
      if (!base.includes(pattern)) {
        base.push(pattern);
      }
    }
  }
  return base;
}
