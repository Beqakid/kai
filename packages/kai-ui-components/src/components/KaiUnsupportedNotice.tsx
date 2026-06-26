// ── KaiUnsupportedNotice ──
// Renders a show_unsupported_notice command.

import React from 'react';
import type { KaiUnsupportedNoticeProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';

export function KaiUnsupportedNotice({
  command,
  onDismiss,
  theme: themeOverrides,
}: KaiUnsupportedNoticeProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);

  return React.createElement(
    'div',
    {
      role: 'status',
      'aria-label': 'Request not supported',
      style: {
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.borderColor}`,
        borderLeft: `3px solid ${theme.mutedTextColor}`,
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
          color: theme.textColor,
        },
      },
      command.title ?? 'Not supported',
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: 0,
          fontSize: FONT_SIZES.md,
          color: theme.mutedTextColor,
        },
      },
      command.message
        ? getSafeDisplayText(command.message)
        : 'Kai cannot handle this request yet. Try rephrasing or contact support.',
    ),
    onDismiss
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onDismiss,
            'aria-label': 'Dismiss unsupported notice',
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
