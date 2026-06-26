// ── KaiAdminReviewBanner ──
// Renders an admin review required banner.
// Does NOT create support requests automatically.

import React from 'react';
import type { KaiAdminReviewBannerProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { formatRiskLabel, getSafeDisplayText } from '../utils/format';

export function KaiAdminReviewBanner({
  command,
  adminReview,
  onCreateSupportRequest,
  onOpenReviewQueue,
  theme: themeOverrides,
}: KaiAdminReviewBannerProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const riskLabel = formatRiskLabel(adminReview.riskLevel);

  return React.createElement(
    'div',
    {
      role: 'alert',
      'aria-label': 'Admin review required',
      style: {
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.warningColor}`,
        borderLeft: `4px solid ${theme.warningColor}`,
        borderRadius: theme.borderRadius,
        fontFamily: theme.fontFamily,
        boxShadow: SHADOWS.card,
      },
    },
    // Heading
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
      command.title ?? 'Admin review required',
    ),
    // Reason
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.sm}`,
          fontSize: FONT_SIZES.md,
          color: theme.textColor,
        },
      },
      getSafeDisplayText(adminReview.reason),
    ),
    // Risk + reviewer
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.md}`,
          fontSize: FONT_SIZES.sm,
          color: theme.mutedTextColor,
        },
      },
      `${riskLabel} · Reviewer: ${getSafeDisplayText(adminReview.reviewerRole)}`,
    ),
    // Action buttons
    React.createElement(
      'div',
      { style: { display: 'flex', gap: SPACING.sm } },
      onCreateSupportRequest
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: onCreateSupportRequest,
              'aria-label': 'Create support request for admin review',
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
            'Create support request',
          )
        : null,
      onOpenReviewQueue
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: onOpenReviewQueue,
              'aria-label': 'Open review queue',
              style: {
                padding: `${SPACING.sm} ${SPACING.lg}`,
                backgroundColor: theme.accentColor,
                color: '#ffffff',
                border: 'none',
                borderRadius: theme.borderRadius,
                fontSize: FONT_SIZES.md,
                fontFamily: theme.fontFamily,
                cursor: 'pointer',
              },
            },
            'Open review queue',
          )
        : null,
    ),
  );
}
