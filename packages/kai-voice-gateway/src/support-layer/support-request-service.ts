// ── Kai Support Request Layer — Service ──
//
// Phase 11: Cross-app support request creation, lookup, and lifecycle.
//
// Safety rules:
// - Requester identity comes from JWT context, never from request body.
// - No emails are sent in Phase 1.
// - No pricing quotes are generated automatically.
// - No work is approved or assigned automatically in Phase 1.
// - Billing, payout, dispute, verification, trust_safety requests
//   are medium/high risk and require admin review.
// - Custom feature/change requests require admin review.
// - Action receipts are created when requests are created/updated.
// - No external app is modified.

import {
  KaiSupportRequest,
  KaiSupportRequestInput,
  KaiSupportRequestType,
  KAI_SUPPORT_REQUEST_TYPES,
  KaiSupportRequestStatus,
  KAI_SUPPORT_REQUEST_STATUSES,
  KaiSupportRequestUrgency,
  KAI_SUPPORT_URGENCY_LEVELS,
  KaiSupportComplexity,
  KaiSupportDecision,
} from './types';
import {
  KaiSupportedAppId,
  KAI_SUPPORTED_APP_IDS,
  KaiUserRole,
  KAI_USER_ROLES,
  KaiNavigationRiskLevel,
} from '../navigation-core/types';
import { Errors } from '../errors';

// ── Metadata sanitization ──

const SENSITIVE_KEYS = new Set([
  'token', 'jwt', 'secret', 'password', 'authorization',
  'cookie', 'session_token', 'api_key', 'apiKey', 'auth',
  'access_token', 'refresh_token', 'private_key', 'ssn',
  'credit_card', 'bank_account', 'raw_audio',
]);

export function sanitizeSupportMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Request types that require admin review ──

const ADMIN_REVIEW_TYPES = new Set<KaiSupportRequestType>([
  'custom_change',
  'feature_request',
  'billing_question',
  'dispute_help',
  'verification_help',
  'trust_safety',
  'admin_review',
]);

// ── Request types with elevated risk ──

const ELEVATED_RISK_TYPES = new Set<KaiSupportRequestType>([
  'billing_question',
  'dispute_help',
  'verification_help',
  'trust_safety',
]);

// ── Simple ID generator ──

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sr_${ts}_${rand}`;
}

// ── Support Request Service ──

export class KaiSupportRequestService {
  private readonly requests = new Map<string, KaiSupportRequest>();

  /**
   * Create a new support request.
   *
   * Identity comes from JWT — the requesterUserId and requesterRole
   * in the input should match the token. If they don't, the caller
   * (router) should have already overridden them.
   */
  createSupportRequest(input: KaiSupportRequestInput): {
    request: KaiSupportRequest;
    decision: KaiSupportDecision;
    receipt: Record<string, unknown>;
  } {
    // Validate appId
    if (!KAI_SUPPORTED_APP_IDS.includes(input.appId as KaiSupportedAppId)) {
      throw Errors.invalidAppId(input.appId);
    }

    // Validate request type
    if (!KAI_SUPPORT_REQUEST_TYPES.includes(input.requestType as KaiSupportRequestType)) {
      throw Errors.missingField(`requestType must be one of: ${KAI_SUPPORT_REQUEST_TYPES.join(', ')}`);
    }

    // Validate required fields
    if (!input.requestTitle || !input.requestTitle.trim()) {
      throw Errors.missingField('requestTitle');
    }
    if (!input.requestDescription || !input.requestDescription.trim()) {
      throw Errors.missingField('requestDescription');
    }
    if (!input.source) {
      throw Errors.missingField('source');
    }

    const requestType = input.requestType as KaiSupportRequestType;
    const urgency = (input.urgency && KAI_SUPPORT_URGENCY_LEVELS.includes(input.urgency as KaiSupportRequestUrgency))
      ? input.urgency as KaiSupportRequestUrgency
      : 'normal';

    // Determine risk level
    const riskLevel = this.determineRiskLevel(requestType, urgency);

    // Determine if admin review is required
    const requiresAdminReview = ADMIN_REVIEW_TYPES.has(requestType);

    // Estimate complexity
    const estimatedComplexity = this.estimateSupportRequestComplexity({
      requestType,
      requestDescription: input.requestDescription,
      urgency,
    });

    // Determine decision
    const decision = this.determineDecision(requestType, requiresAdminReview);

    const now = new Date().toISOString();
    const id = generateId();

    const request: KaiSupportRequest = {
      id,
      appId: input.appId as KaiSupportedAppId,
      requesterUserId: input.requesterUserId,
      requesterRole: input.requesterRole as KaiUserRole,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      requestType,
      requestTitle: input.requestTitle.trim(),
      requestDescription: input.requestDescription.trim(),
      currentScreen: input.currentScreen,
      relatedRouteKey: input.relatedRouteKey,
      relatedActionKey: input.relatedActionKey,
      urgency,
      status: requiresAdminReview ? 'waiting_for_admin' : 'new',
      riskLevel,
      requiresAdminReview,
      estimatedComplexity,
      suggestedNextStep: this.suggestNextStep(requestType, requiresAdminReview),
      source: input.source,
      metadata: sanitizeSupportMetadata(input.metadata),
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(id, request);

    const receipt = this.createSupportRequestReceipt(request, 'created');

    return { request, decision, receipt };
  }

  /**
   * Get a support request by ID.
   */
  getSupportRequest(id: string): KaiSupportRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * List support requests for an app (admin/super-admin view).
   */
  listSupportRequestsForApp(
    appId: string,
    filters?: { status?: string; requestType?: string },
  ): KaiSupportRequest[] {
    if (!KAI_SUPPORTED_APP_IDS.includes(appId as KaiSupportedAppId)) {
      throw Errors.invalidAppId(appId);
    }

    let results = Array.from(this.requests.values())
      .filter((r) => r.appId === appId);

    if (filters?.status) {
      results = results.filter((r) => r.status === filters.status);
    }
    if (filters?.requestType) {
      results = results.filter((r) => r.requestType === filters.requestType);
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * List support requests for a specific user.
   */
  listSupportRequestsForUser(
    userId: string,
    appId?: string,
  ): KaiSupportRequest[] {
    let results = Array.from(this.requests.values())
      .filter((r) => r.requesterUserId === userId);

    if (appId) {
      results = results.filter((r) => r.appId === appId);
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * List all support requests (super-admin only).
   */
  listAllSupportRequests(
    filters?: { status?: string; appId?: string },
  ): KaiSupportRequest[] {
    let results = Array.from(this.requests.values());

    if (filters?.status) {
      results = results.filter((r) => r.status === filters.status);
    }
    if (filters?.appId) {
      results = results.filter((r) => r.appId === filters.appId);
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Update support request status (admin/super-admin only).
   */
  updateSupportRequestStatus(
    id: string,
    status: string,
    updaterRole: string,
  ): {
    request: KaiSupportRequest;
    receipt: Record<string, unknown>;
  } {
    const request = this.requests.get(id);
    if (!request) {
      throw Errors.notFound(`Support request ${id}`);
    }

    // Only admin/super-admin can update status
    if (updaterRole !== 'super-admin' && updaterRole !== 'admin') {
      throw Errors.forbidden('Only admin or super-admin can update support request status.');
    }

    if (!KAI_SUPPORT_REQUEST_STATUSES.includes(status as KaiSupportRequestStatus)) {
      throw Errors.missingField(`status must be one of: ${KAI_SUPPORT_REQUEST_STATUSES.join(', ')}`);
    }

    const previousStatus = request.status;
    request.status = status as KaiSupportRequestStatus;
    request.updatedAt = new Date().toISOString();

    this.requests.set(id, request);

    const receipt = this.createSupportRequestReceipt(request, 'status_changed', {
      previousStatus,
      newStatus: status,
    });

    return { request, receipt };
  }

  /**
   * Estimate complexity based on request type and description length.
   */
  estimateSupportRequestComplexity(input: {
    requestType: string;
    requestDescription: string;
    urgency?: string;
  }): KaiSupportComplexity {
    const type = input.requestType as KaiSupportRequestType;

    // Types that always require review
    if (type === 'custom_change' || type === 'feature_request') {
      return 'requires_review';
    }

    // Urgent issues are at least medium
    if (input.urgency === 'urgent' || input.urgency === 'high') {
      return 'medium';
    }

    // Long descriptions suggest complexity
    if (input.requestDescription.length > 500) {
      return 'medium';
    }

    // Simple help/bug with short description
    if (type === 'help' || type === 'other' || type === 'technical_support') {
      return 'small';
    }

    return 'unknown';
  }

  /**
   * Create a receipt payload for support request events.
   */
  createSupportRequestReceipt(
    request: KaiSupportRequest,
    event: 'created' | 'status_changed' | 'escalated',
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      appId: request.appId,
      actorId: request.requesterUserId,
      actorRole: request.requesterRole,
      supportRequestId: request.id,
      requestType: request.requestType,
      riskLevel: request.riskLevel,
      requiresAdminReview: request.requiresAdminReview,
      status: request.status,
      event,
      metadata: sanitizeSupportMetadata({
        requestTitle: request.requestTitle,
        urgency: request.urgency,
        estimatedComplexity: request.estimatedComplexity,
        ...extra,
      }),
    };
  }

  // ── Private helpers ──

  private determineRiskLevel(
    requestType: KaiSupportRequestType,
    urgency: KaiSupportRequestUrgency,
  ): KaiNavigationRiskLevel {
    if (ELEVATED_RISK_TYPES.has(requestType)) {
      return urgency === 'urgent' ? 'high' : 'medium';
    }
    if (requestType === 'custom_change' || requestType === 'admin_review') {
      return 'medium';
    }
    return 'low';
  }

  private determineDecision(
    requestType: KaiSupportRequestType,
    requiresAdminReview: boolean,
  ): KaiSupportDecision {
    if (requiresAdminReview) {
      return 'requires_admin_review';
    }
    if (requestType === 'help' || requestType === 'technical_support' || requestType === 'other') {
      return 'auto_triaged';
    }
    if (requestType === 'bug') {
      return 'accepted';
    }
    return 'accepted';
  }

  private suggestNextStep(
    requestType: KaiSupportRequestType,
    requiresAdminReview: boolean,
  ): string {
    if (requiresAdminReview) {
      return 'Your request has been submitted and is waiting for admin review. No automatic action will be taken.';
    }
    if (requestType === 'help' || requestType === 'technical_support') {
      return 'Your help request has been logged. A support team member will review it.';
    }
    if (requestType === 'bug') {
      return 'Your bug report has been logged. We will investigate and follow up.';
    }
    return 'Your request has been submitted. We will review and respond.';
  }
}
