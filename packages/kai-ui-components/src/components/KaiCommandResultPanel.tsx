// ── KaiCommandResultPanel ──
// Renders a full KaiUiAdapterResponse — message + command-specific components.
// Blocked commands are terminal. No auto-execution. All actions require user click.

import React from 'react';
import type { KaiCommandResultPanelProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';
import { hasBlockingCommand } from '../utils/command-groups';
import { KaiMessageBubble } from './KaiMessageBubble';
import { KaiNavigationCard } from './KaiNavigationCard';
import { KaiConfirmationDialog } from './KaiConfirmationDialog';
import { KaiAdminReviewBanner } from './KaiAdminReviewBanner';
import { KaiSupportPrefillCard } from './KaiSupportPrefillCard';
import { KaiBlockedNotice } from './KaiBlockedNotice';
import { KaiUnsupportedNotice } from './KaiUnsupportedNotice';
import { KaiReceiptCard } from './KaiReceiptCard';

export function KaiCommandResultPanel({
  response,
  handlers,
  theme: themeOverrides,
  compact = false,
}: KaiCommandResultPanelProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const isBlocked = hasBlockingCommand(response.commands);
  const gap = compact ? SPACING.sm : SPACING.md;

  const children: React.ReactElement[] = [];

  // Main message
  if (response.message) {
    children.push(
      React.createElement(KaiMessageBubble, {
        key: 'msg',
        message: response.message,
        tone: isBlocked ? 'blocked' : 'neutral',
        size: compact ? 'sm' : 'md',
        theme: themeOverrides,
      }),
    );
  }

  // If blocked, only render blocked notices — terminal
  if (isBlocked) {
    for (const cmd of response.commands) {
      if (cmd.type === 'show_blocked_notice') {
        children.push(
          React.createElement(KaiBlockedNotice, {
            key: `blocked-${cmd.actionKey ?? children.length}`,
            command: cmd,
            theme: themeOverrides,
          }),
        );
      }
    }
    return React.createElement(
      'div',
      {
        role: 'region',
        'aria-label': 'Kai response',
        style: { display: 'flex', flexDirection: 'column', gap, fontFamily: theme.fontFamily },
      },
      ...children,
    );
  }

  // Render each command by type
  for (const cmd of response.commands) {
    const key = `${cmd.type}-${cmd.routeKey ?? cmd.actionKey ?? children.length}`;
    switch (cmd.type) {
      case 'show_message':
        children.push(
          React.createElement(KaiMessageBubble, {
            key,
            message: getSafeDisplayText(cmd.message ?? ''),
            size: compact ? 'sm' : 'md',
            theme: themeOverrides,
          }),
        );
        break;

      case 'navigate_to_route':
        children.push(
          React.createElement(KaiNavigationCard, {
            key,
            command: cmd,
            onNavigate: handlers.onNavigate
              ? () => handlers.onNavigate!(cmd)
              : undefined,
            theme: themeOverrides,
          }),
        );
        break;

      case 'request_confirmation':
        if (response.confirmation) {
          children.push(
            React.createElement(KaiConfirmationDialog, {
              key,
              command: cmd,
              confirmation: response.confirmation,
              open: true,
              onConfirm: () => handlers.onConfirmation?.(response.confirmation!),
              onCancel: () => {}, // Host app should provide real handler
              theme: themeOverrides,
            }),
          );
        }
        break;

      case 'request_admin_review':
        if (response.adminReview) {
          children.push(
            React.createElement(KaiAdminReviewBanner, {
              key,
              command: cmd,
              adminReview: response.adminReview,
              onCreateSupportRequest: handlers.onAdminReview
                ? () => handlers.onAdminReview!(response.adminReview!)
                : undefined,
              theme: themeOverrides,
            }),
          );
        }
        break;

      case 'open_support_form':
        if (response.supportSuggestion) {
          children.push(
            React.createElement(KaiSupportPrefillCard, {
              key,
              command: cmd,
              suggestion: response.supportSuggestion,
              onOpenSupportForm: handlers.onSupportForm
                ? (s) => handlers.onSupportForm!(s)
                : () => {},
              theme: themeOverrides,
            }),
          );
        }
        break;

      case 'show_unsupported_notice':
        children.push(
          React.createElement(KaiUnsupportedNotice, {
            key,
            command: cmd,
            theme: themeOverrides,
          }),
        );
        break;

      case 'show_receipt':
        if (response.receipt) {
          children.push(
            React.createElement(KaiReceiptCard, {
              key,
              receiptSummary: response.receipt,
              onViewReceipt: handlers.onReceipt
                ? () => handlers.onReceipt!(cmd)
                : undefined,
              theme: themeOverrides,
            }),
          );
        }
        break;

      case 'show_blocked_notice':
        children.push(
          React.createElement(KaiBlockedNotice, {
            key,
            command: cmd,
            theme: themeOverrides,
          }),
        );
        break;

      case 'no_op':
      case 'open_modal':
      default:
        break;
    }
  }

  return React.createElement(
    'div',
    {
      role: 'region',
      'aria-label': 'Kai response',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap,
        fontFamily: theme.fontFamily,
        fontSize: compact ? FONT_SIZES.sm : FONT_SIZES.md,
      },
    },
    ...children,
  );
}
