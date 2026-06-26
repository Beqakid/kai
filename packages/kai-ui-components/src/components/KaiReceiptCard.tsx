// ── KaiReceiptCard ──
// Renders a show_receipt command safely. Does NOT display raw metadata.

import React from 'react';
import type { KaiReceiptCardProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';

export function KaiReceiptCard({
  receiptSummary,
  onViewReceipt,
  theme: themeOverrides,
}: KaiReceiptCardProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);

  return React.createElement(
    'div',
    {
      role: 'region',
      'aria-label': 'Receipt summary',
      style: {
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.borderColor}`,
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
      'Receipt',
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.sm}`,
          fontSize: FONT_SIZES.md,
          color: theme.textColor,
        },
      },
      getSafeDisplayText(receiptSummary.summary),
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.md}`,
          fontSize: FONT_SIZES.sm,
          color: theme.mutedTextColor,
        },
      },
      `Type: ${getSafeDisplayText(receiptSummary.receiptType)} · ID: ${getSafeDisplayText(receiptSummary.receiptId)}`,
    ),
    onViewReceipt
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onViewReceipt(receiptSummary.receiptId),
            'aria-label': 'View full receipt',
            style: {
              padding: `${SPACING.sm} ${SPACING.lg}`,
              backgroundColor: theme.primaryColor,
              color: '#ffffff',
              border: 'none',
              borderRadius: theme.borderRadius,
              fontSize: FONT_SIZES.md,
              fontFamily: theme.fontFamily,
              cursor: 'pointer',
            },
          },
          'View receipt',
        )
      : null,
  );
}
