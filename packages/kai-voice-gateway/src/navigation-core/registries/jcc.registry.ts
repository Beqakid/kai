// ── Jon Command Center App Registry ──
// Phase 11 Phase 2: Complete route and action definitions for JCC.

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
    id: `route_jcc_${routeKey}`, appId: 'jon-command-center', routeKey, routeLabel, routePath, routeType,
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
    id: `action_jcc_${actionKey}`, appId: 'jon-command-center', actionKey, actionLabel, actionType,
    allowedRoles, riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? riskLevel === 'medium',
    requiresAdminApproval: opts?.requiresAdminApproval ?? riskLevel === 'high',
    blocked: opts?.blocked ?? riskLevel === 'blocked',
    description: opts?.description, isActive: true, createdAt: now, updatedAt: now,
  };
}

// ── JCC Routes ──

export const JCC_ROUTES: KaiRouteRegistryEntry[] = [
  route('dashboard', 'Dashboard', '/dashboard', 'screen',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'Command center overview dashboard' }),
  route('project_overview', 'Project Overview', '/projects', 'screen',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'Project status and progress' }),
  route('carehia_module', 'Carehia Module', '/modules/carehia', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Carehia integration module' }),
  route('viliniu_module', 'Viliniu Module', '/modules/viliniu', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Viliniu integration module' }),
  route('volau_module', 'Volau Module', '/modules/volau', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Volau integration module' }),
  route('kai_module', 'Kai Module', '/modules/kai', 'screen',
    ['super-admin', 'admin'], 'low',
    { description: 'Kai integration module' }),
  route('kai_tasks', 'Kai Tasks', '/kai/tasks', 'screen',
    ['super-admin', 'admin'], 'medium',
    { description: 'Kai task management panel' }),
  route('pending_confirmations', 'Pending Confirmations', '/kai/pending', 'screen',
    ['super-admin', 'admin'], 'high',
    { description: 'Pending action confirmations' }),
  route('receipts', 'Receipts', '/kai/receipts', 'screen',
    ['super-admin'], 'medium',
    { description: 'Action receipt audit log' }),
  route('prooftrust_status', 'ProofTrust Status', '/kai/prooftrust', 'screen',
    ['super-admin'], 'high',
    { description: 'ProofTrust bridge status' }),
  route('development_intelligence', 'Development Intelligence', '/dev-intelligence', 'screen',
    ['super-admin'], 'medium',
    { description: 'Development insights and analytics' }),
  route('support_queue', 'Support Queue', '/support/queue', 'admin_panel',
    ['super-admin', 'admin'], 'medium',
    { description: 'Cross-app support request queue' }),
  route('launch_blockers', 'Launch Blockers', '/launch-blockers', 'screen',
    ['super-admin', 'admin'], 'medium',
    { description: 'Launch blocker tracking' }),
  route('product_logs', 'Product Logs', '/product-logs', 'screen',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'Product development logs' }),
  route('risks', 'Risks', '/risks', 'screen',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'Risk tracking and management' }),
  route('settings', 'Settings', '/settings', 'settings',
    ['super-admin'], 'high',
    { description: 'Command center settings' }),
];

// ── JCC Actions ──

export const JCC_ACTIONS: KaiActionRegistryEntry[] = [
  // Low-risk
  action('view_dashboard', 'View Dashboard', 'read',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'View command center dashboard' }),
  action('view_project_summary', 'View Project Summary', 'read',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'View project summary' }),
  action('summarize_blockers', 'Summarize Blockers', 'read',
    ['super-admin', 'admin'], 'low',
    { description: 'Summarize launch blockers' }),
  action('draft_tasklet_prompt', 'Draft Tasklet Prompt', 'write',
    ['super-admin', 'admin'], 'low',
    { description: 'Draft a Tasklet prompt' }),
  action('view_product_logs', 'View Product Logs', 'read',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'View product development logs' }),
  action('view_risks', 'View Risks', 'read',
    ['super-admin', 'admin', 'viewer'], 'low',
    { description: 'View risk tracking' }),

  // Medium-risk
  action('create_task', 'Create Task', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Create a new Kai task' }),
  action('update_task_status', 'Update Task Status', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Update task status' }),
  action('create_support_request', 'Create Support Request', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Create cross-app support request' }),
  action('update_support_status', 'Update Support Status', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Update support request status' }),
  action('create_product_log', 'Create Product Log', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Create product development log entry' }),
  action('update_risk', 'Update Risk', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Update risk assessment' }),
  action('mark_blocker_reviewed', 'Mark Blocker Reviewed', 'write',
    ['super-admin', 'admin'], 'medium',
    { description: 'Mark launch blocker as reviewed' }),

  // High-risk
  action('confirm_pending_action', 'Confirm Pending Action', 'admin',
    ['super-admin', 'admin'], 'high',
    { description: 'Confirm a pending action' }),
  action('deny_pending_action', 'Deny Pending Action', 'admin',
    ['super-admin', 'admin'], 'high',
    { description: 'Deny a pending action' }),
  action('change_project_settings', 'Change Project Settings', 'admin',
    ['super-admin'], 'high',
    { description: 'Change project settings' }),
  action('change_kai_policy', 'Change Kai Policy', 'admin',
    ['super-admin'], 'high',
    { description: 'Change Kai safety policy' }),
  action('approve_admin_review', 'Approve Admin Review', 'admin',
    ['super-admin', 'admin'], 'high',
    { description: 'Approve admin review item' }),

  // Blocked
  action('deploy_code', 'Deploy Code', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Deploy code — blocked in Phase 2' }),
  action('modify_production_database', 'Modify Production Database', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Modify production database — blocked in Phase 2' }),
  action('grant_admin_access', 'Grant Admin Access', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Grant admin access — blocked in Phase 2' }),
  action('delete_project', 'Delete Project', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Delete project — blocked in Phase 2' }),
  action('change_security_rules_without_review', 'Change Security Rules Without Review', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Change security rules without review — blocked in Phase 2' }),
  action('bypass_permission_gate', 'Bypass Permission Gate', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Bypass Permission Gate — blocked permanently' }),
  action('bypass_pending_confirmation', 'Bypass Pending Confirmation', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Bypass Pending Confirmation — blocked permanently' }),
];
