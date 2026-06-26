// ── Kai UI Adapter — Command Builder ──
//
// Phase 11 Phase 3: Builds frontend-safe UI commands from navigation
// and support decisions. Commands are recommendations only — they are
// never executed server-side.
//
// Safety rules:
// - Never creates a command that modifies external app data.
// - Commands are display/navigation recommendations for the frontend.
// - Blocked actions never include executable action commands.
// - Sensitive actions return confirmation/admin-review/block commands.

import {
  KaiUiCommand,
  KaiUiSupportRequestSuggestion,
  KaiUiConfirmation,
  KaiUiAdminReview,
  KaiUiReceiptSummary,
} from './types';

/**
 * Build a navigation command recommending the frontend show a route.
 * Does NOT execute navigation server-side.
 */
export function buildNavigationCommand(route: {
  routeKey: string;
  routeLabel: string;
  routePath: string;
}): KaiUiCommand {
  return {
    type: 'navigate_to_route',
    label: `Navigate to ${route.routeLabel}`,
    routeKey: route.routeKey,
    routePath: route.routePath,
  };
}

/**
 * Build a support form command recommending the frontend open a support form
 * pre-filled with the suggestion draft.
 */
export function buildSupportFormCommand(
  suggestion: KaiUiSupportRequestSuggestion,
): KaiUiCommand {
  return {
    type: 'open_support_form',
    label: `Open Support: ${suggestion.title}`,
    supportRequestDraft: suggestion,
  };
}

/**
 * Build a confirmation command for medium-risk actions.
 */
export function buildConfirmationCommand(
  confirmation: KaiUiConfirmation,
): KaiUiCommand {
  return {
    type: 'request_confirmation',
    label: confirmation.confirmationLabel,
    confirmationText: confirmation.reason,
    metadata: {
      riskLevel: confirmation.riskLevel,
    },
  };
}

/**
 * Build an admin review command for high-risk actions.
 */
export function buildAdminReviewCommand(
  adminReview: KaiUiAdminReview,
): KaiUiCommand {
  return {
    type: 'request_admin_review',
    label: `Admin Review Required: ${adminReview.reviewType}`,
    metadata: {
      reviewType: adminReview.reviewType,
      suggestedQueue: adminReview.suggestedQueue,
      reason: adminReview.reason,
    },
  };
}

/**
 * Build a blocked notice command. Never includes an executable action.
 */
export function buildBlockedCommand(reason: string): KaiUiCommand {
  return {
    type: 'show_blocked_notice',
    label: 'Action Blocked',
    blockedReason: reason,
  };
}

/**
 * Build an unsupported notice command.
 */
export function buildUnsupportedCommand(reason: string): KaiUiCommand {
  return {
    type: 'show_unsupported_notice',
    label: 'Unsupported',
    blockedReason: reason,
  };
}

/**
 * Build a simple message display command.
 */
export function buildMessageCommand(message: string): KaiUiCommand {
  return {
    type: 'show_message',
    label: message,
  };
}

/**
 * Build a receipt display command (display-only, no actions).
 */
export function buildReceiptCommand(
  receiptSummary: KaiUiReceiptSummary,
): KaiUiCommand {
  return {
    type: 'show_receipt',
    label: `Receipt: ${receiptSummary.summary}`,
    metadata: {
      receiptType: receiptSummary.receiptType,
      receiptId: receiptSummary.receiptId,
      created: receiptSummary.created,
    },
  };
}
