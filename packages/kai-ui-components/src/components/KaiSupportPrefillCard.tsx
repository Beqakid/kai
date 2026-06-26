// ── KaiSupportPrefillCard ──
// Renders an open_support_form command with safe prefill data.
// Does NOT submit the support request — host app handles submission.

import React from 'react';
import type { KaiSupportPrefillCardProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { getSafeDisplayText } from '../utils/format';

// Fields that must never be displayed in prefill cards
const SENSITIVE_FIELDS = new Set([
  'bankAccount', 'bank_account', 'routingNumber', 'routing_number',
  'cardNumber', 'card_number', 'cvv', 'cvc', 'expirationDate',
  'ssn', 'socialSecurity', 'social_security', 'governmentId', 'government_id',
  'taxId', 'tax_id', 'ein', 'itin',
  'medicalRecord', 'medical_record', 'diagnosis', 'healthInfo', 'health_info',
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'driverLicense', 'driver_license', 'passport', 'passportNumber',
]);

function isSensitiveField(key: string): boolean {
  return SENSITIVE_FIELDS.has(key) || /bank|card|ssn|secret|password|token|medical/i.test(key);
}

function getSafeMetadataDisplay(metadata?: Record<string, unknown>): string[] {
  if (!metadata) return [];
  return Object.entries(metadata)
    .filter(([key]) => !isSensitiveField(key))
    .filter(([, value]) => value != null && typeof value !== 'object')
    .map(([key, value]) => `${key}: ${getSafeDisplayText(String(value))}`)
    .slice(0, 5); // Limit display items
}

export function KaiSupportPrefillCard({
  command: _command,
  suggestion,
  onOpenSupportForm,
  theme: themeOverrides,
}: KaiSupportPrefillCardProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const safeMetadata = getSafeMetadataDisplay(suggestion.metadata);

  return React.createElement(
    'div',
    {
      role: 'region',
      'aria-label': 'Support request suggestion',
      style: {
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.borderColor}`,
        borderRadius: theme.borderRadius,
        fontFamily: theme.fontFamily,
        boxShadow: SHADOWS.card,
      },
    },
    // Title
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
      getSafeDisplayText(suggestion.suggestedTitle),
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
      getSafeDisplayText(suggestion.suggestedDescription),
    ),
    // Category + Priority
    (suggestion.suggestedCategory || suggestion.suggestedPriority)
      ? React.createElement(
          'p',
          {
            style: {
              margin: `0 0 ${SPACING.sm}`,
              fontSize: FONT_SIZES.sm,
              color: theme.mutedTextColor,
            },
          },
          [
            suggestion.suggestedCategory && `Category: ${getSafeDisplayText(suggestion.suggestedCategory)}`,
            suggestion.suggestedPriority && `Priority: ${getSafeDisplayText(suggestion.suggestedPriority)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        )
      : null,
    // Safe metadata
    safeMetadata.length > 0
      ? React.createElement(
          'ul',
          {
            style: {
              margin: `0 0 ${SPACING.md}`,
              paddingLeft: SPACING.lg,
              fontSize: FONT_SIZES.sm,
              color: theme.mutedTextColor,
            },
          },
          ...safeMetadata.map((item, i) =>
            React.createElement('li', { key: i, style: { marginBottom: '2px' } }, item),
          ),
        )
      : null,
    // Button
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onOpenSupportForm(suggestion),
        'aria-label': 'Open support form',
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
      'Open support form',
    ),
  );
}
