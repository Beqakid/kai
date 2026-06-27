// ── Host Command Handler Templates ──
// Creates safe command handler maps for host apps.
// Sensitive actions (payouts, refunds, bank details, vendor approvals)
// are ALWAYS routed to admin review or support — never auto-executed.

import type {
  KaiCommandHandlerMap,
  KaiUiCommand,
  KaiSupportRequestSuggestion,
  KaiConfirmationRequest,
  KaiAdminReviewRequest,
} from '@kai/ui-sdk';
import type { HostAppCallbacks, SensitiveActionCategory } from './types';
import { SENSITIVE_ACTION_CATEGORIES } from './types';

/**
 * Check if an action key matches a sensitive action category.
 */
export function isSensitiveAction(actionKey?: string): boolean {
  if (!actionKey) return false;
  const lower = actionKey.toLowerCase();
  return SENSITIVE_ACTION_CATEGORIES.some((cat) => lower.includes(cat));
}

/**
 * Get which sensitive category an action matches.
 */
export function getSensitiveCategory(actionKey?: string): SensitiveActionCategory | null {
  if (!actionKey) return null;
  const lower = actionKey.toLowerCase();
  return SENSITIVE_ACTION_CATEGORIES.find((cat) => lower.includes(cat)) ?? null;
}

/**
 * Create a Kai command handler map wired to host app callbacks.
 *
 * Safety rules enforced:
 * - Navigation only fires host callback (user-initiated, no auto-nav)
 * - Sensitive actions always go to admin review or support path
 * - Blocked commands are terminal — shown and never retried
 * - No auto-execute, no auto-confirm
 * - No payment/payout/refund processing
 * - No bank/M-Paisa/card detail collection in chat
 *
 * @param callbacks Host app callbacks for handling commands
 * @returns KaiCommandHandlerMap ready for use with @kai/ui-sdk
 */
export function createHostCommandHandlers(
  callbacks: HostAppCallbacks,
): KaiCommandHandlerMap {
  return {
    onNavigate: (command: KaiUiCommand) => {
      // Navigation is user-initiated only — host app decides how to navigate
      if (callbacks.onNavigate && command.routePath) {
        callbacks.onNavigate(command.routePath);
      }
    },

    onSupportForm: (suggestion: KaiSupportRequestSuggestion) => {
      if (callbacks.onOpenSupportForm) {
        callbacks.onOpenSupportForm(
          suggestion.suggestedTitle,
          suggestion.suggestedDescription,
          suggestion.suggestedCategory,
        );
      }
    },

    onConfirmation: (confirmation: KaiConfirmationRequest) => {
      // Check if this is a sensitive action being confirmed
      if (isSensitiveAction(confirmation.action)) {
        // Route to admin review instead of direct confirmation
        if (callbacks.onRequestAdminReview) {
          callbacks.onRequestAdminReview(
            confirmation.action,
            `Sensitive action requires admin review: ${confirmation.description}`,
          );
        } else if (callbacks.onShowBlockedNotice) {
          callbacks.onShowBlockedNotice(
            'This action requires admin review. Please contact your administrator.',
          );
        }
        return;
      }
      if (callbacks.onShowConfirmation) {
        callbacks.onShowConfirmation(confirmation.action, confirmation.description);
      }
    },

    onAdminReview: (review: KaiAdminReviewRequest) => {
      if (callbacks.onRequestAdminReview) {
        callbacks.onRequestAdminReview(review.action, review.reason);
      } else if (callbacks.onShowMessage) {
        callbacks.onShowMessage(
          `This action requires admin review: ${review.reason}`,
          'warning',
        );
      }
    },

    onBlocked: (command: KaiUiCommand) => {
      // Blocked commands are TERMINAL — show notice and stop
      if (callbacks.onShowBlockedNotice) {
        callbacks.onShowBlockedNotice(command.message ?? 'This action is not available.');
      } else if (callbacks.onToast) {
        callbacks.onToast(command.message ?? 'This action is not available.', 'error');
      }
    },

    onUnsupported: (command: KaiUiCommand) => {
      if (callbacks.onShowMessage) {
        callbacks.onShowMessage(
          command.message ?? 'This feature is not yet supported.',
          'info',
        );
      }
    },

    onMessage: (command: KaiUiCommand) => {
      if (callbacks.onShowMessage) {
        callbacks.onShowMessage(
          command.message ?? '',
          command.severity ?? 'info',
        );
      }
    },

    onReceipt: (command: KaiUiCommand) => {
      if (callbacks.onShowReceipt && command.receiptId) {
        callbacks.onShowReceipt(command.receiptId, command.message ?? '');
      }
    },

    onNoOp: () => {
      // Intentionally empty — no-op commands produce no side effects
    },
  };
}

/**
 * Create Viliniu-specific command handlers with safe defaults.
 * Payouts, refunds, bank details → admin review / support path only.
 */
export function createViliniuCommandHandlers(
  callbacks: HostAppCallbacks,
): KaiCommandHandlerMap {
  const baseHandlers = createHostCommandHandlers(callbacks);

  // Viliniu adds extra safety: even confirmations for sensitive actions
  // get routed to admin review
  return {
    ...baseHandlers,
    onConfirmation: (confirmation: KaiConfirmationRequest) => {
      // Viliniu: ALL sensitive actions go to admin review, no exceptions
      if (isSensitiveAction(confirmation.action)) {
        if (callbacks.onRequestAdminReview) {
          callbacks.onRequestAdminReview(
            confirmation.action,
            `Requires admin review: ${confirmation.description}`,
          );
          return;
        }
        // Fallback: show as blocked if no admin review handler
        if (callbacks.onShowBlockedNotice) {
          callbacks.onShowBlockedNotice(
            'This action requires admin approval. Please contact your administrator.',
          );
          return;
        }
      }
      // Non-sensitive confirmations use the normal flow
      if (callbacks.onShowConfirmation) {
        callbacks.onShowConfirmation(confirmation.action, confirmation.description);
      }
    },
  };
}
