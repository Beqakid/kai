// ── KaiMessageBubble ──
// Displays Kai's safe message in a styled bubble.
// Display-only — no side effects.

import React from 'react';
import type { KaiMessageBubbleProps } from '../types';
import { resolveTheme, getToneColor, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';

export function KaiMessageBubble({
  message,
  tone = 'neutral',
  size = 'md',
  icon,
  theme: themeOverrides,
}: KaiMessageBubbleProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const toneColor = getToneColor(tone, theme);
  const fontSize = FONT_SIZES[size];
  const padding = size === 'sm' ? SPACING.sm : size === 'lg' ? SPACING.xl : SPACING.lg;

  return React.createElement(
    'div',
    {
      role: 'status',
      'aria-label': 'Kai message',
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: SPACING.sm,
        padding,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.borderColor}`,
        borderLeft: `3px solid ${toneColor}`,
        borderRadius: theme.borderRadius,
        fontFamily: theme.fontFamily,
        fontSize,
        color: theme.textColor,
        boxShadow: SHADOWS.card,
        lineHeight: '1.5',
      },
    },
    icon
      ? React.createElement(
          'span',
          { 'aria-hidden': 'true', style: { flexShrink: 0 } },
          icon,
        )
      : null,
    React.createElement('span', null, getSafeDisplayText(message)),
  );
}
