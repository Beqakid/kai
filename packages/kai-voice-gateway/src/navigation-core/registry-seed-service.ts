// ── Registry Seed Service ──
// Phase 11 Phase 2: Idempotent seeding of route/action registries to D1.
//
// Safety rules:
// - Seeding only writes to Kai's own registry tables (kai_app_route_registry, kai_app_action_registry).
// - Does NOT modify any external app.
// - Idempotent: no duplicate appId+routeKey or appId+actionKey.
// - Preserves is_active=false if manually disabled (unless force=true).
// - Creates receipt on seed completion.

import {
  KaiSupportedAppId,
  KAI_SUPPORTED_APP_IDS,
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
  KaiAppRegistrySummary,
  KaiUserRole,
} from './types';
import {
  getRegistryRoutesForApp,
  getRegistryActionsForApp,
  getAllRegistryRoutes,
  getAllRegistryActions,
} from './registries/index';

// ── Seed Result ──

export interface RegistrySeedResult {
  appsSeeded: KaiSupportedAppId[];
  routesInserted: number;
  routesUpdated: number;
  routesSkipped: number;
  actionsInserted: number;
  actionsUpdated: number;
  actionsSkipped: number;
  receipt: Record<string, unknown>;
}

export interface AppSeedResult {
  appId: KaiSupportedAppId;
  routesInserted: number;
  routesUpdated: number;
  routesSkipped: number;
  actionsInserted: number;
  actionsUpdated: number;
  actionsSkipped: number;
}

// ── In-memory store for seeded registries (used when D1 is not available) ──

const seededRoutes = new Map<string, KaiRouteRegistryEntry>();
const seededActions = new Map<string, KaiActionRegistryEntry>();

function routeStoreKey(appId: string, routeKey: string): string {
  return `${appId}::${routeKey}`;
}

function actionStoreKey(appId: string, actionKey: string): string {
  return `${appId}::${actionKey}`;
}

// ── Seed Service ──

/** Seed all registries for all apps */
export function seedNavigationRegistries(opts?: { force?: boolean }): RegistrySeedResult {
  const appsSeeded: KaiSupportedAppId[] = [];
  let totalRoutesInserted = 0;
  let totalRoutesUpdated = 0;
  let totalRoutesSkipped = 0;
  let totalActionsInserted = 0;
  let totalActionsUpdated = 0;
  let totalActionsSkipped = 0;

  for (const appId of KAI_SUPPORTED_APP_IDS) {
    const result = seedRegistriesForApp(appId, opts);
    appsSeeded.push(appId);
    totalRoutesInserted += result.routesInserted;
    totalRoutesUpdated += result.routesUpdated;
    totalRoutesSkipped += result.routesSkipped;
    totalActionsInserted += result.actionsInserted;
    totalActionsUpdated += result.actionsUpdated;
    totalActionsSkipped += result.actionsSkipped;
  }

  const receipt = {
    receiptType: 'kai_navigation_registry_seeded',
    appsSeeded,
    routesInserted: totalRoutesInserted,
    routesUpdated: totalRoutesUpdated,
    routesSkipped: totalRoutesSkipped,
    actionsInserted: totalActionsInserted,
    actionsUpdated: totalActionsUpdated,
    actionsSkipped: totalActionsSkipped,
    totalRoutes: seededRoutes.size,
    totalActions: seededActions.size,
    timestamp: new Date().toISOString(),
  };

  return {
    appsSeeded,
    routesInserted: totalRoutesInserted,
    routesUpdated: totalRoutesUpdated,
    routesSkipped: totalRoutesSkipped,
    actionsInserted: totalActionsInserted,
    actionsUpdated: totalActionsUpdated,
    actionsSkipped: totalActionsSkipped,
    receipt,
  };
}

/** Seed routes for a specific app */
export function seedRoutesForApp(
  appId: KaiSupportedAppId,
  opts?: { force?: boolean },
): { inserted: number; updated: number; skipped: number } {
  const routes = getRegistryRoutesForApp(appId);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const route of routes) {
    const key = routeStoreKey(appId, route.routeKey);
    const existing = seededRoutes.get(key);

    if (!existing) {
      seededRoutes.set(key, { ...route });
      inserted++;
    } else if (!existing.isActive && !opts?.force) {
      // Preserve manually disabled routes unless force=true
      skipped++;
    } else {
      // Update existing entry with new definition
      seededRoutes.set(key, {
        ...route,
        isActive: opts?.force ? route.isActive : existing.isActive,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      updated++;
    }
  }

  return { inserted, updated, skipped };
}

/** Seed actions for a specific app */
export function seedActionsForApp(
  appId: KaiSupportedAppId,
  opts?: { force?: boolean },
): { inserted: number; updated: number; skipped: number } {
  const actions = getRegistryActionsForApp(appId);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const action of actions) {
    const key = actionStoreKey(appId, action.actionKey);
    const existing = seededActions.get(key);

    if (!existing) {
      seededActions.set(key, { ...action });
      inserted++;
    } else if (!existing.isActive && !opts?.force) {
      skipped++;
    } else {
      seededActions.set(key, {
        ...action,
        isActive: opts?.force ? action.isActive : existing.isActive,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      updated++;
    }
  }

  return { inserted, updated, skipped };
}

/** Seed both routes and actions for a specific app */
function seedRegistriesForApp(
  appId: KaiSupportedAppId,
  opts?: { force?: boolean },
): AppSeedResult {
  const routeResult = seedRoutesForApp(appId, opts);
  const actionResult = seedActionsForApp(appId, opts);

  return {
    appId,
    routesInserted: routeResult.inserted,
    routesUpdated: routeResult.updated,
    routesSkipped: routeResult.skipped,
    actionsInserted: actionResult.inserted,
    actionsUpdated: actionResult.updated,
    actionsSkipped: actionResult.skipped,
  };
}

/** Get the default registry definitions for an app (without seeding) */
export function getDefaultRegistryForApp(appId: KaiSupportedAppId): {
  routes: KaiRouteRegistryEntry[];
  actions: KaiActionRegistryEntry[];
} {
  return {
    routes: getRegistryRoutesForApp(appId),
    actions: getRegistryActionsForApp(appId),
  };
}

/** Get seeded routes for an app (falls back to defaults if not seeded) */
export function getSeededRoutesForApp(appId: KaiSupportedAppId): KaiRouteRegistryEntry[] {
  const seeded = Array.from(seededRoutes.values()).filter(r => r.appId === appId);
  return seeded.length > 0 ? seeded : getRegistryRoutesForApp(appId);
}

/** Get seeded actions for an app (falls back to defaults if not seeded) */
export function getSeededActionsForApp(appId: KaiSupportedAppId): KaiActionRegistryEntry[] {
  const seeded = Array.from(seededActions.values()).filter(a => a.appId === appId);
  return seeded.length > 0 ? seeded : getRegistryActionsForApp(appId);
}

/** Get seeded route by key */
export function getSeededRouteByKey(
  appId: KaiSupportedAppId,
  routeKey: string,
): KaiRouteRegistryEntry | undefined {
  const key = routeStoreKey(appId, routeKey);
  return seededRoutes.get(key) ?? getRegistryRoutesForApp(appId).find(r => r.routeKey === routeKey);
}

/** Get seeded action by key */
export function getSeededActionByKey(
  appId: KaiSupportedAppId,
  actionKey: string,
): KaiActionRegistryEntry | undefined {
  const key = actionStoreKey(appId, actionKey);
  return seededActions.get(key) ?? getRegistryActionsForApp(appId).find(a => a.actionKey === actionKey);
}

/** Generate app summary from registry */
export function getAppRegistrySummary(appId: KaiSupportedAppId): KaiAppRegistrySummary {
  const routes = getSeededRoutesForApp(appId);
  const actions = getSeededActionsForApp(appId);

  const allRoles = new Set<KaiUserRole>();
  const sensitiveAreas: string[] = [];

  for (const route of routes) {
    route.allowedRoles.forEach(r => allRoles.add(r));
    if (route.riskLevel === 'high' || route.riskLevel === 'blocked') {
      sensitiveAreas.push(route.routeLabel);
    }
  }
  for (const action of actions) {
    action.allowedRoles.forEach(r => allRoles.add(r));
  }

  return {
    appId,
    routeCount: routes.length,
    actionCount: actions.length,
    highRiskRouteCount: routes.filter(r => r.riskLevel === 'high').length,
    highRiskActionCount: actions.filter(a => a.riskLevel === 'high').length,
    blockedActionCount: actions.filter(a => a.blocked || a.riskLevel === 'blocked').length,
    supportedRoles: Array.from(allRoles),
    sensitiveAreas,
  };
}

/** Clear seeded data (for testing) */
export function clearSeededRegistries(): void {
  seededRoutes.clear();
  seededActions.clear();
}
