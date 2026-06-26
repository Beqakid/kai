// ── App Registry Index ──
// Phase 11 Phase 2: Central export for all app-specific registries.

export { CAREHIA_ROUTES, CAREHIA_ACTIONS } from './carehia.registry';
export { VILINIU_ROUTES, VILINIU_ACTIONS } from './viliniu.registry';
export { VOLAU_ROUTES, VOLAU_ACTIONS } from './volau.registry';
export { JCC_ROUTES, JCC_ACTIONS } from './jcc.registry';
export { KAI_ROUTES, KAI_ACTIONS } from './kai.registry';

import { KaiSupportedAppId, KaiRouteRegistryEntry, KaiActionRegistryEntry } from '../types';
import { CAREHIA_ROUTES, CAREHIA_ACTIONS } from './carehia.registry';
import { VILINIU_ROUTES, VILINIU_ACTIONS } from './viliniu.registry';
import { VOLAU_ROUTES, VOLAU_ACTIONS } from './volau.registry';
import { JCC_ROUTES, JCC_ACTIONS } from './jcc.registry';
import { KAI_ROUTES, KAI_ACTIONS } from './kai.registry';

// ── Lookup Maps ──

const ROUTES_BY_APP: Record<KaiSupportedAppId, KaiRouteRegistryEntry[]> = {
  'carehia': CAREHIA_ROUTES,
  'viliniu': VILINIU_ROUTES,
  'volau': VOLAU_ROUTES,
  'jon-command-center': JCC_ROUTES,
  'kai': KAI_ROUTES,
};

const ACTIONS_BY_APP: Record<KaiSupportedAppId, KaiActionRegistryEntry[]> = {
  'carehia': CAREHIA_ACTIONS,
  'viliniu': VILINIU_ACTIONS,
  'volau': VOLAU_ACTIONS,
  'jon-command-center': JCC_ACTIONS,
  'kai': KAI_ACTIONS,
};

/** Get all routes for an app from the Phase 2 registry */
export function getRegistryRoutesForApp(appId: KaiSupportedAppId): KaiRouteRegistryEntry[] {
  return ROUTES_BY_APP[appId] || [];
}

/** Get all actions for an app from the Phase 2 registry */
export function getRegistryActionsForApp(appId: KaiSupportedAppId): KaiActionRegistryEntry[] {
  return ACTIONS_BY_APP[appId] || [];
}

/** Get a specific route by app + routeKey */
export function getRegistryRouteByKey(
  appId: KaiSupportedAppId,
  routeKey: string,
): KaiRouteRegistryEntry | undefined {
  return ROUTES_BY_APP[appId]?.find(r => r.routeKey === routeKey);
}

/** Get a specific action by app + actionKey */
export function getRegistryActionByKey(
  appId: KaiSupportedAppId,
  actionKey: string,
): KaiActionRegistryEntry | undefined {
  return ACTIONS_BY_APP[appId]?.find(a => a.actionKey === actionKey);
}

/** Get all routes across all apps */
export function getAllRegistryRoutes(): KaiRouteRegistryEntry[] {
  return [
    ...CAREHIA_ROUTES,
    ...VILINIU_ROUTES,
    ...VOLAU_ROUTES,
    ...JCC_ROUTES,
    ...KAI_ROUTES,
  ];
}

/** Get all actions across all apps */
export function getAllRegistryActions(): KaiActionRegistryEntry[] {
  return [
    ...CAREHIA_ACTIONS,
    ...VILINIU_ACTIONS,
    ...VOLAU_ACTIONS,
    ...JCC_ACTIONS,
    ...KAI_ACTIONS,
  ];
}
