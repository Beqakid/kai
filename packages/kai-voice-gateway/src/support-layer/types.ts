// ── Kai Support Request Layer — Types ──
//
// Phase 11: Shared cross-app support request types.
// Support requests are created by users across all apps and
// triaged by Kai or admins.

import { KaiSupportedAppId, KaiUserRole, KaiNavigationRiskLevel } from '../navigation-core/types';

// ── Request Types ──

export const KAI_SUPPORT_REQUEST_TYPES = [
  'help',
  'bug',
  'feature_request',
  'custom_change',
  'billing_question',
  'verification_help',
  'dispute_help',
  'trust_safety',
  'admin_review',
  'technical_support',
  'other',
] as const;

export type KaiSupportRequestType = (typeof KAI_SUPPORT_REQUEST_TYPES)[number];

// ── Statuses ──

export const KAI_SUPPORT_REQUEST_STATUSES = [
  'new',
  'triaged',
  'waiting_for_user',
  'waiting_for_admin',
  'estimated',
  'approved',
  'in_progress',
  'resolved',
  'rejected',
  'closed',
] as const;

export type KaiSupportRequestStatus = (typeof KAI_SUPPORT_REQUEST_STATUSES)[number];

// ── Urgency ──

export const KAI_SUPPORT_URGENCY_LEVELS = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export type KaiSupportRequestUrgency = (typeof KAI_SUPPORT_URGENCY_LEVELS)[number];

// ── Complexity ──

export const KAI_SUPPORT_COMPLEXITY_LEVELS = [
  'unknown',
  'small',
  'medium',
  'large',
  'requires_review',
] as const;

export type KaiSupportComplexity = (typeof KAI_SUPPORT_COMPLEXITY_LEVELS)[number];

// ── Decision ──

export const KAI_SUPPORT_DECISIONS = [
  'accepted',
  'requires_admin_review',
  'requires_estimate',
  'auto_triaged',
  'rejected',
] as const;

export type KaiSupportDecision = (typeof KAI_SUPPORT_DECISIONS)[number];

// ── Support Request ──

export interface KaiSupportRequest {
  id: string;
  appId: KaiSupportedAppId;
  requesterUserId: string;
  requesterRole: KaiUserRole;
  requesterName?: string;
  requesterEmail?: string;
  requestType: KaiSupportRequestType;
  requestTitle: string;
  requestDescription: string;
  currentScreen?: string;
  relatedRouteKey?: string;
  relatedActionKey?: string;
  urgency: KaiSupportRequestUrgency;
  status: KaiSupportRequestStatus;
  riskLevel: KaiNavigationRiskLevel;
  requiresAdminReview: boolean;
  estimatedComplexity: KaiSupportComplexity;
  suggestedNextStep?: string;
  assignedTo?: string;
  source: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── Input for creating a support request ──

export interface KaiSupportRequestInput {
  appId: string;
  requesterUserId: string;
  requesterRole: string;
  requesterName?: string;
  requesterEmail?: string;
  requestType: string;
  requestTitle: string;
  requestDescription: string;
  currentScreen?: string;
  relatedRouteKey?: string;
  relatedActionKey?: string;
  urgency?: string;
  source: string;
  metadata?: Record<string, unknown>;
}
