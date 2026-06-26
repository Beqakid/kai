// ── @kai/ui-sdk — Command Handler Helpers ──
// Opt-in command dispatch — the SDK NEVER auto-executes navigation,
// opens modals, creates support requests, or modifies app data
// unless the host app explicitly provides a handler.

import type {
  KaiUiCommand,
  KaiUiAdapterResponse,
  KaiCommandHandlerMap,
} from './types';

/**
 * Handle a single Kai UI command by dispatching to the appropriate handler.
 * If no handler is provided for a command type, the command is safely ignored.
 *
 * IMPORTANT: Blocked commands are TERMINAL — they never become executable actions.
 */
export async function handleKaiCommand(
  command: KaiUiCommand,
  handlers: KaiCommandHandlerMap
): Promise<void> {
  switch (command.type) {
    case 'navigate_to_route':
      // Only navigate if host app provided a handler
      if (handlers.onNavigate) {
        await handlers.onNavigate(command);
      }
      break;

    case 'open_support_form':
      // Only open support if host app provided a handler
      if (handlers.onSupportForm && command.metadata?.supportSuggestion) {
        await handlers.onSupportForm(
          command.metadata.supportSuggestion as import('./types').KaiSupportRequestSuggestion
        );
      }
      break;

    case 'request_confirmation':
      if (handlers.onConfirmation && command.metadata?.confirmation) {
        await handlers.onConfirmation(
          command.metadata.confirmation as import('./types').KaiConfirmationRequest
        );
      }
      break;

    case 'request_admin_review':
      if (handlers.onAdminReview && command.metadata?.adminReview) {
        await handlers.onAdminReview(
          command.metadata.adminReview as import('./types').KaiAdminReviewRequest
        );
      }
      break;

    case 'show_blocked_notice':
      // Blocked commands are terminal — never executable
      if (handlers.onBlocked) {
        await handlers.onBlocked(command);
      }
      break;

    case 'show_unsupported_notice':
      if (handlers.onUnsupported) {
        await handlers.onUnsupported(command);
      }
      break;

    case 'show_message':
      if (handlers.onMessage) {
        await handlers.onMessage(command);
      }
      break;

    case 'show_receipt':
      if (handlers.onReceipt) {
        await handlers.onReceipt(command);
      }
      break;

    case 'open_modal':
      if (handlers.onModal) {
        await handlers.onModal(command);
      }
      break;

    case 'no_op':
      if (handlers.onNoOp) {
        handlers.onNoOp();
      }
      break;

    default:
      // Unknown command type — safely ignore
      break;
  }
}

/**
 * Handle all commands from a response.
 * Commands are processed sequentially to maintain order.
 */
export async function handleKaiCommands(
  commands: KaiUiCommand[],
  handlers: KaiCommandHandlerMap
): Promise<void> {
  for (const command of commands) {
    await handleKaiCommand(command, handlers);
  }
}

/**
 * Create a default set of command handlers with console-based fallbacks.
 * Host apps should override these with real UI handlers.
 */
export function createDefaultCommandHandlers(
  options?: Partial<KaiCommandHandlerMap>
): KaiCommandHandlerMap {
  return {
    onNavigate: options?.onNavigate,
    onSupportForm: options?.onSupportForm,
    onConfirmation: options?.onConfirmation,
    onAdminReview: options?.onAdminReview,
    onBlocked: options?.onBlocked ?? ((cmd) => {
      console.warn('[kai-sdk] Action blocked:', cmd.message);
    }),
    onUnsupported: options?.onUnsupported ?? ((cmd) => {
      console.info('[kai-sdk] Unsupported action:', cmd.message);
    }),
    onMessage: options?.onMessage ?? ((cmd) => {
      console.info('[kai-sdk] Kai message:', cmd.message);
    }),
    onReceipt: options?.onReceipt,
    onModal: options?.onModal,
    onNoOp: options?.onNoOp,
  };
}

// ── Type Guards ──

export function isNavigationCommand(command: KaiUiCommand): boolean {
  return command.type === 'navigate_to_route';
}

export function isSupportCommand(command: KaiUiCommand): boolean {
  return command.type === 'open_support_form';
}

export function isConfirmationCommand(command: KaiUiCommand): boolean {
  return command.type === 'request_confirmation';
}

export function isAdminReviewCommand(command: KaiUiCommand): boolean {
  return command.type === 'request_admin_review';
}

export function isBlockedCommand(command: KaiUiCommand): boolean {
  return command.type === 'show_blocked_notice';
}

export function isUnsupportedCommand(command: KaiUiCommand): boolean {
  return command.type === 'show_unsupported_notice';
}

export function isReceiptCommand(command: KaiUiCommand): boolean {
  return command.type === 'show_receipt';
}
