// ── KaiBlockedNotice ──
// Renders a show_blocked_notice command as a terminal notice.
// No execution buttons — blocked is final.

import React from 'react';
import type { KaiBlockedNoticeProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';

export function KaiBlockedNotice({
  command,
  onDismiss,
  theme: themeOverrides,
}: KaiBlockedNoticeProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);

  return React.createElement(
    'div',
    {
      role: 'alert',
      'aria-label': 'Action blocked',
      style: {
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.blockedColor}`,
        borderLeft: `4px solid ${theme.blockedColor}`,
        borderRadius: theme.borderRadius,
        fontFamily: theme.fontFamily,
        boxShadow: SHADOWS.card,
      },
    },
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.sm}`,
          fontSize: FONT_SIZES.heading,
          fontWeight: 600,
          color: theme.blockedColor,
        },
      },
      command.title ?? 'Action blocked',
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: 0,
          fontSize: FONT_SIZES.md,
          color: theme.textColor,
        },
      },
      command.message
        ? getSafeDisplayText(command.message)
        : 'This action is not permitted.',
    ),
    onDismiss
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onDismiss,
            'aria-label': 'Dismiss blocked notice',
            style: {
              marginTop: SPACING.md,
              padding: `${SPACING.sm} ${SPACING.lg}`,
              backgroundColor: 'transparent',
              color: theme.mutedTextColor,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: theme.borderRadius,
              fontSize: FONT_SIZES.md,
              fontFamily: theme.fontFamily,
              cursor: 'pointer',
            },
          },
          'Dismiss',
        )
      : null,
  );
}
