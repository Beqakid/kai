// ── KaiConfirmationDialog ──
// Renders a confirmation dialog for request_confirmation commands.
// Does NOT auto-confirm — requires explicit user click.

import React from 'react';
import type { KaiConfirmationDialogProps } from '../types';
import { resolveTheme, getToneColor, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { formatRiskLabel, getRiskTone, getSafeDisplayText } from '../utils/format';

export function KaiConfirmationDialog({
  command,
  confirmation,
  open,
  onConfirm,
  onCancel,
  theme: themeOverrides,
}: KaiConfirmationDialogProps): React.ReactElement | null {
  const theme = resolveTheme(themeOverrides);

  if (!open) return null;

  const tone = getRiskTone(confirmation.riskLevel);
  const toneColor = getToneColor(tone, theme);
  const riskLabel = formatRiskLabel(confirmation.riskLevel);

  return React.createElement(
    'div',
    {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Confirmation required',
      style: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
      },
    },
    React.createElement(
      'div',
      {
        style: {
          maxWidth: '480px',
          width: '90%',
          padding: SPACING.xl,
          backgroundColor: theme.surfaceColor,
          borderRadius: theme.borderRadius,
          boxShadow: SHADOWS.dialog,
          fontFamily: theme.fontFamily,
        },
      },
      // Title
      React.createElement(
        'h2',
        {
          style: {
            margin: `0 0 ${SPACING.sm}`,
            fontSize: FONT_SIZES.heading,
            fontWeight: 600,
            color: theme.textColor,
          },
        },
        command.title ?? 'Confirmation required',
      ),
      // Risk badge
      React.createElement(
        'span',
        {
          'aria-label': `Risk level: ${riskLabel}`,
          style: {
            display: 'inline-block',
            padding: `2px ${SPACING.sm}`,
            marginBottom: SPACING.md,
            fontSize: FONT_SIZES.label,
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: toneColor,
            borderRadius: '6px',
          },
        },
        riskLabel,
      ),
      // Description
      React.createElement(
        'p',
        {
          style: {
            margin: `0 0 ${SPACING.sm}`,
            fontSize: FONT_SIZES.md,
            color: theme.textColor,
          },
        },
        getSafeDisplayText(confirmation.description),
      ),
      // Action
      React.createElement(
        'p',
        {
          style: {
            margin: `0 0 ${SPACING.lg}`,
            fontSize: FONT_SIZES.sm,
            color: theme.mutedTextColor,
          },
        },
        `Action: ${getSafeDisplayText(confirmation.action)}`,
      ),
      // Buttons
      React.createElement(
        'div',
        { style: { display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end' } },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: onCancel,
            'aria-label': 'Cancel action',
            style: {
              padding: `${SPACING.sm} ${SPACING.lg}`,
              backgroundColor: 'transparent',
              color: theme.textColor,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: theme.borderRadius,
              fontSize: FONT_SIZES.md,
              fontFamily: theme.fontFamily,
              cursor: 'pointer',
            },
          },
          'Cancel',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: onConfirm,
            'aria-label': 'Confirm action',
            style: {
              padding: `${SPACING.sm} ${SPACING.lg}`,
              backgroundColor: toneColor,
              color: '#ffffff',
              border: 'none',
              borderRadius: theme.borderRadius,
              fontSize: FONT_SIZES.md,
              fontFamily: theme.fontFamily,
              cursor: 'pointer',
            },
          },
          'Confirm',
        ),
      ),
    ),
  );
}
