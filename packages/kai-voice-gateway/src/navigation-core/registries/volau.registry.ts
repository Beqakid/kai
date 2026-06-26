// ── Volau App Registry ──
// Phase 11 Phase 2: Complete route and action definitions for Volau.

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
    id: `route_volau_${routeKey}`, appId: 'volau', routeKey, routeLabel, routePath, routeType,
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
    id: `action_volau_${actionKey}`, appId: 'volau', actionKey, actionLabel, actionType,
    allowedRoles, riskLevel,
    requiresConfirmation: opts?.requiresConfirmation ?? riskLevel === 'medium',
    requiresAdminApproval: opts?.requiresAdminApproval ?? riskLevel === 'high',
    blocked: opts?.blocked ?? riskLevel === 'blocked',
    description: opts?.description, isActive: true, createdAt: now, updatedAt: now,
  };
}

// ── Volau Routes ──

export const VOLAU_ROUTES: KaiRouteRegistryEntry[] = [
  route('today', 'Today', '/today', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Daily overview' }),
  route('province_daily', 'Province Daily', '/province/daily', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Province daily summary' }),
  route('weather', 'Weather', '/weather', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Weather conditions and forecasts' }),
  route('seasons', 'Seasons', '/seasons', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Seasonal information' }),
  route('species_lookup', 'Species Lookup', '/species', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Species identification and lookup' }),
  route('plant_detail', 'Plant Detail', '/species/plant/:id', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Plant species detail page' }),
  route('fish_detail', 'Fish Detail', '/species/fish/:id', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Fish species detail page' }),
  route('submit_knowledge', 'Submit Knowledge', '/knowledge/submit', 'screen',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'Submit traditional knowledge entry' }),
  route('my_submissions', 'My Submissions', '/knowledge/my-submissions', 'screen',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'View own knowledge submissions' }),
  route('reviewer_queue', 'Reviewer Queue', '/reviewer/queue', 'admin_panel',
    ['reviewer', 'admin', 'super-admin'], 'high',
    { description: 'Knowledge review queue' }),
  route('expert_review', 'Expert Review', '/reviewer/expert', 'admin_panel',
    ['reviewer', 'admin', 'super-admin'], 'high',
    { description: 'Expert knowledge review panel' }),
  route('emergency_help', 'Emergency Help', '/emergency', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Emergency assistance and contacts' }),
  route('safety_alerts', 'Safety Alerts', '/safety-alerts', 'screen',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Safety alerts and warnings' }),
  route('admin_dashboard', 'Admin Dashboard', '/admin/dashboard', 'admin_panel',
    ['admin', 'super-admin'], 'medium',
    { description: 'Admin overview dashboard' }),
  route('admin_content_review', 'Admin Content Review', '/admin/content-review', 'admin_panel',
    ['admin', 'super-admin'], 'high',
    { description: 'Admin content review and moderation' }),
  route('admin_source_library', 'Admin Source Library', '/admin/source-library', 'admin_panel',
    ['admin', 'super-admin'], 'high',
    { description: 'Validated source library management' }),
  route('support', 'Support', '/support', 'support',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'Help and support center' }),
];

// ── Volau Actions ──

export const VOLAU_ACTIONS: KaiActionRegistryEntry[] = [
  // Low-risk
  action('view_weather', 'View Weather', 'read',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'View weather information' }),
  action('view_province_daily', 'View Province Daily', 'read',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'View province daily summary' }),
  action('view_species_detail', 'View Species Detail', 'read',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'View species information' }),
  action('view_emergency_help', 'View Emergency Help', 'read',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin', 'viewer'], 'low',
    { description: 'View emergency contacts and help' }),
  action('draft_support_request', 'Draft Support Request', 'write',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin'], 'low',
    { description: 'Draft a support request' }),
  action('report_content_issue', 'Report Content Issue', 'write',
    ['public-user', 'contributor', 'reviewer', 'admin', 'super-admin'], 'low',
    { description: 'Report an issue with content' }),

  // Medium-risk
  action('submit_traditional_knowledge', 'Submit Traditional Knowledge', 'write',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'Submit traditional knowledge entry' }),
  action('edit_own_submission', 'Edit Own Submission', 'write',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'Edit own knowledge submission' }),
  action('submit_species_correction', 'Submit Species Correction', 'write',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'Submit correction to species data' }),
  action('upload_observation_photo', 'Upload Observation Photo', 'write',
    ['contributor', 'reviewer', 'admin', 'super-admin'], 'medium',
    { description: 'Upload observation photo' }),

  // High-risk
  action('approve_knowledge_submission', 'Approve Knowledge Submission', 'admin',
    ['reviewer', 'admin', 'super-admin'], 'high',
    { description: 'Approve submitted knowledge entry' }),
  action('reject_knowledge_submission', 'Reject Knowledge Submission', 'admin',
    ['reviewer', 'admin', 'super-admin'], 'high',
    { description: 'Reject submitted knowledge entry' }),
  action('edit_validated_species_record', 'Edit Validated Species Record', 'admin',
    ['admin', 'super-admin'], 'high',
    { description: 'Edit a validated species record' }),
  action('publish_safety_alert', 'Publish Safety Alert', 'admin',
    ['admin', 'super-admin'], 'high',
    { description: 'Publish safety alert to users' }),
  action('modify_source_library', 'Modify Source Library', 'admin',
    ['admin', 'super-admin'], 'high',
    { description: 'Modify validated source library' }),

  // Blocked
  action('auto_approve_traditional_knowledge', 'Auto-Approve Traditional Knowledge', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Auto-approve traditional knowledge — blocked in Phase 2' }),
  action('delete_validated_knowledge', 'Delete Validated Knowledge', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Delete validated knowledge — blocked in Phase 2' }),
  action('override_expert_review', 'Override Expert Review', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Override expert review decision — blocked in Phase 2' }),
  action('publish_medical_or_safety_claim_without_review', 'Publish Medical/Safety Claim Without Review', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Publish medical/safety claim without review — blocked in Phase 2' }),
  action('grant_reviewer_access', 'Grant Reviewer Access', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Grant reviewer access — blocked in Phase 2' }),
  action('modify_production_database', 'Modify Production Database', 'admin',
    ['super-admin'], 'blocked',
    { description: 'Modify production database — blocked in Phase 2' }),
];
