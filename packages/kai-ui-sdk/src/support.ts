// ── @kai/ui-sdk — Support Helpers ──
// Helpers for building safe support drafts from Kai suggestions.
// Never includes raw private data in support drafts.

import type {
  KaiSupportRequestSuggestion,
  KaiUiAdapterResponse,
} from './types';

// Fields that must NEVER appear in support drafts
const PRIVATE_FIELDS = new Set([
  'bankaccount',
  'bankAccount',
  'paymentcard',
  'paymentCard',
  'cardnumber',
  'cardNumber',
  'ssn',
  'governmentid',
  'governmentId',
  'medicalrecordrawdata',
  'medicalRecordRawData',
  'backgroundcheckrawdata',
  'backgroundCheckRawData',
  'password',
  'secret',
  'token',
  'accesstoken',
  'accessToken',
  'refreshtoken',
  'refreshToken',
  'mpaisadetails',
  'mpaisaDetails',
  'rawphoto',
  'rawPhoto',
  'rawprivatedata',
  'rawPrivateData',
  'base64',
  'file',
]);

// Keywords that indicate admin review is required for support requests
const ADMIN_REVIEW_KEYWORDS = [
  'payout',
  'billing',
  'verification',
  'dispute',
  'refund',
  'bank',
  'payment',
  'card',
  'financial',
];

function stripPrivateFields(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PRIVATE_FIELDS.has(key) || PRIVATE_FIELDS.has(key.toLowerCase())) {
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripPrivateFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Build a safe support draft from a Kai suggestion.
 * Strips all private fields from metadata.
 */
export function buildSupportDraftFromSuggestion(
  suggestion: KaiSupportRequestSuggestion
): {
  title: string;
  description: string;
  category?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
} {
  return {
    title: getSafeSupportTitleFromSuggestion(suggestion),
    description: getSafeSupportDescriptionFromSuggestion(suggestion),
    category: suggestion.suggestedCategory,
    priority: suggestion.suggestedPriority,
    metadata: stripPrivateFields(suggestion.metadata),
  };
}

/**
 * Check if a response requires admin review.
 */
export function isAdminReviewRequired(response: KaiUiAdapterResponse): boolean {
  if (response.decision === 'requires_admin_review') return true;
  if (response.adminReview) return true;
  // Check if support suggestion involves sensitive topics
  if (response.supportSuggestion) {
    const text = (
      (response.supportSuggestion.suggestedTitle ?? '') +
      ' ' +
      (response.supportSuggestion.suggestedDescription ?? '')
    ).toLowerCase();
    return ADMIN_REVIEW_KEYWORDS.some((kw) => text.includes(kw));
  }
  return false;
}

/**
 * Check if a response requires user confirmation.
 */
export function isConfirmationRequired(response: KaiUiAdapterResponse): boolean {
  return (
    response.decision === 'requires_confirmation' ||
    !!response.confirmation
  );
}

/**
 * Infer support request type from response.
 */
export function getSupportRequestType(
  response: KaiUiAdapterResponse
): 'general' | 'issue' | 'correction' | 'dispute' | 'admin_review' {
  if (response.decision === 'requires_admin_review') return 'admin_review';
  if (response.supportSuggestion) {
    const text = (
      (response.supportSuggestion.suggestedTitle ?? '') +
      ' ' +
      (response.supportSuggestion.suggestedDescription ?? '')
    ).toLowerCase();
    if (ADMIN_REVIEW_KEYWORDS.some((kw) => text.includes(kw))) return 'dispute';
    if (text.includes('wrong') || text.includes('incorrect') || text.includes('correction'))
      return 'correction';
    if (text.includes('issue') || text.includes('problem') || text.includes('bug'))
      return 'issue';
  }
  return 'general';
}

/**
 * Get a safe title from a response's support suggestion.
 */
export function getSafeSupportTitle(response: KaiUiAdapterResponse): string {
  if (response.supportSuggestion?.suggestedTitle) {
    return response.supportSuggestion.suggestedTitle;
  }
  return 'Support Request';
}

/**
 * Get a safe description from a response's support suggestion.
 */
export function getSafeSupportDescription(response: KaiUiAdapterResponse): string {
  if (response.supportSuggestion?.suggestedDescription) {
    return response.supportSuggestion.suggestedDescription;
  }
  return '';
}

// Internal helpers
function getSafeSupportTitleFromSuggestion(suggestion: KaiSupportRequestSuggestion): string {
  return suggestion.suggestedTitle || 'Support Request';
}

function getSafeSupportDescriptionFromSuggestion(suggestion: KaiSupportRequestSuggestion): string {
  return suggestion.suggestedDescription || '';
}
