// ── Kai Navigation Core — Default Route & Action Registries ──
//
// Phase 11: Seed data for all supported apps.
// These defaults are used when the D1 registry is empty or to
// bootstrap a fresh deployment.
//
// Risk classification:
// - low: read-only dashboards, support pages, general screens
// - medium: admin queues, schedule management, review queues
// - high: payout routes, verification/identity, compliance, trust-sensitive
// - blocked: reserved for future — not used in default seeds

import {
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
  KaiSupportedAppId,
  KaiUserRole,
  KaiRouteType,
  KaiNavigationRiskLevel,
} from './types';

// ── Helper to generate IDs ──

function routeId(appId: string, routeKey: string): string {
  return `route_${appId}_${routeKey}`;
}

function actionId(appId: string, actionKey: string): string {
  return `action_${appId}_${actionKey}`;
}

const now = new Date().toISOString();

function makeRoute(
  appId: KaiSupportedAppId,
  routeKey: string,
  routeLabel: string,
  routePath: string,
  routeType: KaiRouteType,
  allowedRoles: KaiUserRole[],
  riskLevel: KaiNavigationRiskLevel,
  opts?: {
    requiresConfirmation?: boolean;
    requiresAdminApproval?: boolean;
    description?: string;
  },
): KaiRouteRegistryEntry {
  return {
    id: routeId(appId, routeKey),
    appId,
    routeKey,
    routeLabel,
    routePath,
    routeType,
    allowedRoles,
    riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? false,
    requiresAdminApproval: opts?.requiresAdminApproval ?? false,
    description: opts?.description,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeAction(
  appId: KaiSupportedAppId,
  actionKey: string,
  actionLabel: string,
  actionType: string,
  allowedRoles: KaiUserRole[],
  riskLevel: KaiNavigationRiskLevel,
  opts?: {
    requiresConfirmation?: boolean;
    requiresAdminApproval?: boolean;
    blocked?: boolean;
    description?: string;
  },
): KaiActionRegistryEntry {
  return {
    id: actionId(appId, actionKey),
    appId,
    actionKey,
    actionLabel,
    actionType,
    allowedRoles,
    riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? false,
    requiresAdminApproval: opts?.requiresAdminApproval ?? false,
    blocked: opts?.blocked ?? false,
    description: opts?.description,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Carehia Routes ──

export const CAREHIA_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  makeRoute('carehia', 'today', 'Today', '/today', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Daily overview dashboard' }),
  makeRoute('carehia', 'work', 'Work', '/work', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Work queue and assignments' }),
  makeRoute('carehia', 'schedule', 'Schedule', '/schedule', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'Schedule management' }),
  makeRoute('carehia', 'clients', 'Clients', '/clients', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Client directory' }),
  makeRoute('carehia', 'time_tracker', 'Time Tracker', '/time-tracker', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Time tracking and hours log' }),
  makeRoute('carehia', 'invoices', 'Invoices', '/invoices', 'screen',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Invoice management' }),
  makeRoute('carehia', 'trust_passport', 'Trust Passport', '/trust-passport', 'trust_sensitive',
    ['super-admin', 'admin', 'vendor'], 'high',
    { requiresAdminApproval: true, description: 'Identity verification and trust credentials' }),
  makeRoute('carehia', 'profile', 'Profile', '/profile', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'User profile settings' }),
  makeRoute('carehia', 'support', 'Support', '/support', 'support',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Help and support center' }),
  makeRoute('carehia', 'admin_verification_queue', 'Verification Queue', '/admin/verification-queue', 'admin_panel',
    ['super-admin', 'admin'], 'high',
    { requiresAdminApproval: true, description: 'Admin verification review queue' }),
  makeRoute('carehia', 'admin_incident_queue', 'Incident Queue', '/admin/incident-queue', 'admin_panel',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Admin incident management' }),
];

// ── Viliniu Routes ──

export const VILINIU_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  makeRoute('viliniu', 'today', 'Today', '/today', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Daily overview dashboard' }),
  makeRoute('viliniu', 'orders', 'Orders', '/orders', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'Order management' }),
  makeRoute('viliniu', 'products', 'Products', '/products', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Product catalog management' }),
  makeRoute('viliniu', 'vendor_profile', 'Vendor Profile', '/vendor/profile', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Vendor profile and settings' }),
  makeRoute('viliniu', 'delivery_orders', 'Delivery Orders', '/delivery/orders', 'screen',
    ['super-admin', 'admin', 'vendor'], 'low',
    { description: 'Delivery order tracking' }),
  makeRoute('viliniu', 'delivery_proof', 'Delivery Proof', '/delivery/proof', 'proof',
    ['super-admin', 'admin', 'vendor'], 'medium',
    { requiresConfirmation: true, description: 'Delivery proof submission and review' }),
  makeRoute('viliniu', 'payouts', 'Payouts', '/payouts', 'payment_sensitive',
    ['super-admin', 'admin'], 'high',
    { requiresAdminApproval: true, description: 'Vendor payout management' }),
  makeRoute('viliniu', 'support', 'Support', '/support', 'support',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Help and support center' }),
  makeRoute('viliniu', 'admin_vendor_review', 'Vendor Review', '/admin/vendor-review', 'admin_panel',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Admin vendor review queue' }),
  makeRoute('viliniu', 'admin_disputes', 'Disputes', '/admin/disputes', 'admin_panel',
    ['super-admin', 'admin'], 'high',
    { requiresAdminApproval: true, description: 'Dispute resolution management' }),
];

// ── Volau Routes ──

export const VOLAU_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  makeRoute('volau', 'today', 'Today', '/today', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Daily overview dashboard' }),
  makeRoute('volau', 'province_daily', 'Province Daily', '/province/daily', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Province daily summary' }),
  makeRoute('volau', 'weather', 'Weather', '/weather', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Weather conditions and forecasts' }),
  makeRoute('volau', 'species_lookup', 'Species Lookup', '/species', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Species identification and lookup' }),
  makeRoute('volau', 'submit_knowledge', 'Submit Knowledge', '/knowledge/submit', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'Community knowledge submission' }),
  makeRoute('volau', 'reviewer_queue', 'Reviewer Queue', '/reviewer/queue', 'admin_panel',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Knowledge review queue' }),
  makeRoute('volau', 'emergency_help', 'Emergency Help', '/emergency', 'screen',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Emergency assistance and contacts' }),
  makeRoute('volau', 'support', 'Support', '/support', 'support',
    ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Help and support center' }),
];

// ── Jon Command Center Routes ──

export const JCC_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  makeRoute('jon-command-center', 'dashboard', 'Dashboard', '/dashboard', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Command center overview dashboard' }),
  makeRoute('jon-command-center', 'project_overview', 'Project Overview', '/projects', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Project status and progress' }),
  makeRoute('jon-command-center', 'kai_tasks', 'Kai Tasks', '/kai/tasks', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Kai task management panel' }),
  makeRoute('jon-command-center', 'pending_confirmations', 'Pending Confirmations', '/kai/pending', 'screen',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Pending action confirmations' }),
  makeRoute('jon-command-center', 'receipts', 'Receipts', '/kai/receipts', 'screen',
    ['super-admin'], 'medium',
    { description: 'Action receipt audit log' }),
  makeRoute('jon-command-center', 'carehia_module', 'Carehia Module', '/modules/carehia', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Carehia integration module' }),
  makeRoute('jon-command-center', 'viliniu_module', 'Viliniu Module', '/modules/viliniu', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Viliniu integration module' }),
  makeRoute('jon-command-center', 'volau_module', 'Volau Module', '/modules/volau', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Volau integration module' }),
  makeRoute('jon-command-center', 'support_queue', 'Support Queue', '/support/queue', 'admin_panel',
    ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Cross-app support request queue' }),
];

// ── Kai Internal Routes ──

export const KAI_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  makeRoute('kai', 'tasks', 'Tasks', '/tasks', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Kai task list' }),
  makeRoute('kai', 'receipts', 'Receipts', '/receipts', 'screen',
    ['super-admin'], 'low',
    { description: 'Action receipt browser' }),
  makeRoute('kai', 'pending_actions', 'Pending Actions', '/pending', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Pending confirmation queue' }),
  makeRoute('kai', 'prooftrust_status', 'ProofTrust Status', '/prooftrust', 'screen',
    ['super-admin'], 'medium',
    { description: 'ProofTrust bridge status' }),
  makeRoute('kai', 'app_registry', 'App Registry', '/registry', 'admin_panel',
    ['super-admin'], 'medium',
    { description: 'Cross-app route and action registry' }),
  makeRoute('kai', 'development_intelligence', 'Development Intelligence', '/dev-intelligence', 'screen',
    ['super-admin'], 'low',
    { description: 'Development insights and analytics' }),
];

// ── All Default Routes ──

export const ALL_DEFAULT_ROUTES: KaiRouteRegistryEntry[] = [
  ...CAREHIA_DEFAULT_ROUTES,
  ...VILINIU_DEFAULT_ROUTES,
  ...VOLAU_DEFAULT_ROUTES,
  ...JCC_DEFAULT_ROUTES,
  ...KAI_DEFAULT_ROUTES,
];

// ── Default Actions (sample per app) ──

export const ALL_DEFAULT_ACTIONS: KaiActionRegistryEntry[] = [
  // Carehia actions
  makeAction('carehia', 'view_schedule', 'View Schedule', 'read', ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'View care schedule' }),
  makeAction('carehia', 'update_schedule', 'Update Schedule', 'write', ['super-admin', 'admin', 'vendor'], 'medium',
    { requiresConfirmation: true, description: 'Modify care schedule' }),
  makeAction('carehia', 'upload_certification', 'Upload Certification', 'write', ['super-admin', 'admin', 'vendor'], 'medium',
    { requiresConfirmation: true, description: 'Upload certification to Trust Passport' }),
  makeAction('carehia', 'approve_verification', 'Approve Verification', 'admin', ['super-admin'], 'high',
    { requiresAdminApproval: true, description: 'Approve identity/background verification' }),
  makeAction('carehia', 'process_payment', 'Process Payment', 'payment', ['super-admin'], 'blocked',
    { blocked: true, description: 'Process payment — blocked in Phase 1' }),

  // Viliniu actions
  makeAction('viliniu', 'view_orders', 'View Orders', 'read', ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'View order list' }),
  makeAction('viliniu', 'update_product', 'Update Product', 'write', ['super-admin', 'admin', 'vendor'], 'medium',
    { requiresConfirmation: true, description: 'Update product details' }),
  makeAction('viliniu', 'update_payout_details', 'Update Payout Details', 'payment', ['super-admin'], 'high',
    { requiresAdminApproval: true, description: 'Change vendor payout settings' }),
  makeAction('viliniu', 'process_refund', 'Process Refund', 'payment', ['super-admin'], 'blocked',
    { blocked: true, description: 'Process refund — blocked in Phase 1' }),

  // Volau actions
  makeAction('volau', 'view_species', 'View Species', 'read', ['super-admin', 'admin', 'vendor', 'customer', 'viewer'], 'low',
    { description: 'Look up species information' }),
  makeAction('volau', 'submit_knowledge', 'Submit Knowledge', 'write', ['super-admin', 'admin', 'vendor', 'customer'], 'low',
    { description: 'Submit community knowledge entry' }),
  makeAction('volau', 'review_knowledge', 'Review Knowledge', 'admin', ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Review submitted knowledge entries' }),

  // JCC actions
  makeAction('jon-command-center', 'view_dashboard', 'View Dashboard', 'read', ['super-admin', 'admin'], 'low',
    { description: 'View command center dashboard' }),
  makeAction('jon-command-center', 'manage_tasks', 'Manage Tasks', 'write', ['super-admin', 'admin'], 'medium',
    { requiresConfirmation: true, description: 'Create and manage Kai tasks' }),
  makeAction('jon-command-center', 'view_receipts', 'View Receipts', 'read', ['super-admin'], 'low',
    { description: 'View action receipts' }),

  // Kai internal actions
  makeAction('kai', 'view_tasks', 'View Tasks', 'read', ['super-admin', 'admin'], 'low',
    { description: 'View Kai task list' }),
  makeAction('kai', 'view_receipts', 'View Receipts', 'read', ['super-admin'], 'low',
    { description: 'View action receipts' }),
  makeAction('kai', 'view_registry', 'View Registry', 'read', ['super-admin'], 'low',
    { description: 'View app route and action registry' }),
];

// ── Lookup helpers ──

export function getDefaultRoutesForApp(appId: KaiSupportedAppId): KaiRouteRegistryEntry[] {
  return ALL_DEFAULT_ROUTES.filter(r => r.appId === appId);
}

export function getDefaultActionsForApp(appId: KaiSupportedAppId): KaiActionRegistryEntry[] {
  return ALL_DEFAULT_ACTIONS.filter(a => a.appId === appId);
}

export function getDefaultRouteByKey(
  appId: KaiSupportedAppId,
  routeKey: string,
): KaiRouteRegistryEntry | undefined {
  return ALL_DEFAULT_ROUTES.find(r => r.appId === appId && r.routeKey === routeKey);
}

export function getDefaultActionByKey(
  appId: KaiSupportedAppId,
  actionKey: string,
): KaiActionRegistryEntry | undefined {
  return ALL_DEFAULT_ACTIONS.find(a => a.appId === appId && a.actionKey === actionKey);
}
