// ── KaiAssistantPanel ──
// Compact reusable assistant panel with text input + response display.
// Does NOT call the SDK directly — host app provides onSubmitIntent.
// Does NOT handle tokens. No auto-execute.

import React, { useState } from 'react';
import type { KaiAssistantPanelProps } from '../types';
import { resolveTheme, SPACING, FONT_SIZES, SHADOWS } from '../styles/tokens';
import { KaiCommandResultPanel } from './KaiCommandResultPanel';

export function KaiAssistantPanel({
  appId: _appId,
  role: _role,
  currentScreen: _currentScreen,
  placeholder = 'Ask Kai anything…',
  onSubmitIntent,
  response,
  handlers,
  loading = false,
  error,
  theme: themeOverrides,
}: KaiAssistantPanelProps): React.ReactElement {
  const theme = resolveTheme(themeOverrides);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || loading) return;
    onSubmitIntent(trimmed);
    setInputValue('');
  };

  return React.createElement(
    'div',
    {
      role: 'region',
      'aria-label': 'Kai assistant',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING.md,
        padding: SPACING.lg,
        backgroundColor: theme.surfaceColor,
        border: `1px solid ${theme.borderColor}`,
        borderRadius: theme.borderRadius,
        fontFamily: theme.fontFamily,
        boxShadow: SHADOWS.card,
      },
    },
    // Input form
    React.createElement(
      'form',
      {
        onSubmit: handleSubmit,
        style: { display: 'flex', gap: SPACING.sm },
      },
      React.createElement('input', {
        type: 'text',
        value: inputValue,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value),
        placeholder,
        disabled: loading,
        'aria-label': 'Ask Kai',
        style: {
          flex: 1,
          padding: `${SPACING.sm} ${SPACING.md}`,
          border: `1px solid ${theme.borderColor}`,
          borderRadius: theme.borderRadius,
          fontSize: FONT_SIZES.md,
          fontFamily: theme.fontFamily,
          color: theme.textColor,
          backgroundColor: theme.surfaceColor,
          outline: 'none',
        },
      }),
      React.createElement(
        'button',
        {
          type: 'submit',
          disabled: loading || !inputValue.trim(),
          'aria-label': 'Submit to Kai',
          style: {
            padding: `${SPACING.sm} ${SPACING.lg}`,
            backgroundColor:
              loading || !inputValue.trim() ? theme.borderColor : theme.primaryColor,
            color: loading || !inputValue.trim() ? theme.mutedTextColor : '#ffffff',
            border: 'none',
            borderRadius: theme.borderRadius,
            fontSize: FONT_SIZES.md,
            fontFamily: theme.fontFamily,
            cursor: loading || !inputValue.trim() ? 'not-allowed' : 'pointer',
          },
        },
        loading ? 'Thinking…' : 'Ask Kai',
      ),
    ),
    // Error
    error
      ? React.createElement(
          'p',
          {
            role: 'alert',
            style: {
              margin: 0,
              fontSize: FONT_SIZES.sm,
              color: theme.dangerColor,
            },
          },
          error,
        )
      : null,
    // Response
    response
      ? React.createElement(KaiCommandResultPanel, {
          response,
          handlers,
          theme: themeOverrides,
          compact: true,
        })
      : null,
  );
}
