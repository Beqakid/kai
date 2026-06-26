// ── KaiNavigationCard ──
// Renders a navigate_to_route command as a card with an opt-in "Open" button.
// Does NOT call window.location — navigation is entirely host-app controlled.

import React from 'react';
import type { KaiNavigationCardProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText, formatCommandLabel } from '../utils/format';

export function KaiNavigationCard({
  command,
  onNavigate,
  theme: themeOverrides,
}: KaiNavigationCardProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const label = formatCommandLabel(command);
  const routeDisplay = command.routePath
    ? getSafeDisplayText(command.routePath)
    : command.routeKey
      ? getSafeDisplayText(command.routeKey)
      : 'suggested page';

  const handleClick = () => {
    if (onNavigate) onNavigate(command);
  };

  return React.createElement(
    'div',
    {
      role: 'region',
      'aria-label': `Navigation suggestion: ${label}`,
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
      label,
    ),
    React.createElement(
      'p',
      {
        style: {
          margin: `0 0 ${SPACING.md}`,
          fontSize: FONT_SIZES.md,
          color: theme.mutedTextColor,
        },
      },
      command.message
        ? getSafeDisplayText(command.message)
        : `Go to ${routeDisplay}`,
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: handleClick,
        disabled: !onNavigate,
        'aria-label': onNavigate ? `Open ${routeDisplay}` : 'Navigation handler not available',
        style: {
          padding: `${SPACING.sm} ${SPACING.lg}`,
          backgroundColor: onNavigate ? theme.primaryColor : theme.borderColor,
          color: onNavigate ? '#ffffff' : theme.mutedTextColor,
          border: 'none',
          borderRadius: theme.borderRadius,
          fontSize: FONT_SIZES.md,
          fontFamily: theme.fontFamily,
          cursor: onNavigate ? 'pointer' : 'not-allowed',
        },
      },
      onNavigate ? 'Open' : 'Navigation not available',
    ),
  );
}
