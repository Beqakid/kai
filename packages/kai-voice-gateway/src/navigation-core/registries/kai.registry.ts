// ── Kai Internal App Registry ──
// Phase 11 Phase 2: Complete route and action definitions for Kai itself.

import {
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
  KaiUserRole,
  KaiRouteType,
  KaiNavigationRiskLevel,
} from '../types';

const now = new Date().toISOString();

function route(
  routeKey: string, routeLabel: string, routePath: string,
  routeType: KaiRouteType, allowedRoles: KaiUserRole[],
  riskLevel: KaiNavigationRiskLevel,
  opts?: { requiresConfirmation?: boolean; requiresAdminApproval?: boolean; description?: string },
): KaiRouteRegistryEntry {
  return {
    id: `route_kai_${routeKey}`, appId: 'kai', routeKey, routeLabel, routePath, routeType,
    allowedRoles, riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? riskLevel === 'medium',
    requiresAdminApproval: opts?.requiresAdminApproval ?? riskLevel === 'high',
    description: opts?.description, isActive: true, createdAt: now, updatedAt: now,
  };
}

function action(
  actionKey: string, actionLabel: string, actionType: string,
  allowedRoles: KaiUserRole[], riskLevel: KaiNavigationRiskLevel,
  opts?: { requiresConfirmation?: boolean; requiresAdminApproval?: boolean; blocked?: boolean; description?: string },
): KaiActionRegistryEntry {
  return {
    id: `action_kai_${actionKey}`, appId: 'kai', actionKey, actionLabel, actionType,
    allowedRoles, riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? riskLevel === 'medium',
    requiresAdminApproval: opts?.requiresAdminApproval ?? riskLevel === 'high',
    blocked: opts?.blocked ?? riskLevel === 'blocked',
    description: opts?.description, isActive: true, createdAt: now, updatedAt: now,
  };
}

// ── Kai Routes ──

export const KAI_ROUTES: KaiRouteRegistryEntry[] = [
  route('tasks', 'Tasks', '/tasks', 'screen',
    ['super-admin', 'admin'], 'medium',
    { description: 'Kai task list' }),
  route('receipts', 'Receipts', '/receipts', 'screen',
    ['super-admin'], 'medium',
    { description: 'Action receipt browser' }),
  route('pending_actions', 'Pending Actions', '/pending', 'screen',
    ['super-admin', 'admin'], 'high',
    { description: 'Pending confirmation queue' }),
  route('prooftrust_status', 'ProofTrust Status', '/prooftrust', 'screen',
    ['super-admin'], 'medium',
    { description: 'ProofTrust bridge status' }),
  route('app_registry', 'App Registry', '/registry', 'admin_panel',
    ['super-admin'], 'medium',
    { description: 'Cross-app route and action registry' }),
  route('development_intelligence', 'Development Intelligence', '/dev-intelligence', 'screen',
    ['super-admin'], 'medium',
    { description: 'Development insights and analytics' }),
  route('navigation_registry', 'Navigation Registry', '/navigation-registry', 'admin_panel',
    ['super-admin'], 'medium',
    { description: 'Navigation route/action registry' }),
  route('support_requests', 'Support Requests', '/support-requests', 'screen',
    ['super-admin', 'admin'], 'medium',
    { description: 'Support request management' }),
  route('security_retest', 'Security Retest', '/security-retest', 'admin_panel',
    ['super-admin'], 'high',
    { description: 'Security retest dashboard' }),
  route('settings', 'Settings', '/settings', 'settings',
    ['super-admin'], 'high',
    { description: 'Kai system settings' }),
];

// ── Kai Actions ──

export const KAI_ACTIONS: KaiActionRegistryEntry[] = [
  // Low-risk
  action('view_tasks', 'View Tasks', 'read',
    ['super-admin', 'admin'], 'low',
    { description: 'View Kai task list' }),
  action('view_receipts', 'View Receipts', 'read',
    ['super-admin'], 'low',
    { description: 'View action receipts' }),
  action('view_prooftrust_status', 'View ProofTrust Status', 'read',
    ['super-admin'], 'low',
    { description: 'View ProofTrust bridge status' }),
  action('summarize_kai_state', 'Summarize Kai State', 'read',
    ['super-admin', 'admin'], 'low',
    { description: 'Summarize current Kai state' }),

  // Medium-risk
  action('create_task', 'Create Task', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Create a new Kai task' }),
  action('update_task_status', 'Update Task Status', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Update task status' }),
  action('create_development_update', 'Create Development Update', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Create development intelligence update' }),
  action('register_route', 'Register Route', 'write',
    ['super-admin'], 'medium',
    { description: 'Register a new route in the registry' }),
  action('register_support_request', 'Register Support Request', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Register a support request' }),

  // High-risk
  action('confirm_pending_action', 'Confirm Pending Action', 'admin',
    ['super-admin', 'admin'], 'high',
    { description: 'Confirm a pending action' }),
  action('modify_permission_gate_policy', 'Modify Permission Gate Policy', 'admin',
    ['super-admin'], 'high',
    { description: 'Modify Permission Gate policy rules' }),
  action('modify_prooftrust_policy', 'Modify ProofTrust Policy', 'admin',
    ['super-admin'], 'high',
    { description: 'Modify ProofTrust bridge policy' }),
  action('change_navigation_registry', 'Change Navigation Registry', 'admin',
    ['super-admin'], 'high',
    { description: 'Change navigation registry entries' }),
  action('run_security_retest', 'Run Security Retest', 'admin',
    ['super-admin'], 'high',
    { description: 'Run security retest suite' }),

  // Blocked
  action('disable_permission_gate', 'Disable Permission Gate', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Disable Permission Gate — blocked permanently' }),
  action('disable_pending_confirmation', 'Disable Pending Confirmation', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Disable Pending Confirmation — blocked permanently' }),
  action('disable_action_receipts', 'Disable Action Receipts', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Disable Action Receipts — blocked permanently' }),
  action('delete_receipts', 'Delete Receipts', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Delete action receipts — blocked permanently' }),
  action('self_modify_code', 'Self-Modify Code', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Self-modify code — blocked permanently' }),
  action('deploy_self_without_review', 'Deploy Self Without Review', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Deploy self without review — blocked permanently' }),
  action('bypass_safety_layers', 'Bypass Safety Layers', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Bypass safety layers — blocked permanently' }),
];
