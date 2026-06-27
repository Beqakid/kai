// ── AssistantPanelContainer ──
// Branded wrapper around KaiAssistantPanel / KaiSdkAssistantPanel.
// Provides a slide-up mobile bottom sheet or desktop floating panel.
// Shows the assistant's branded name, welcome message, and close button.
// Does NOT handle tokens, does NOT auto-execute commands.

import React from 'react';
import type { AssistantPanelContainerProps } from '../types';

/** Z-index for the panel — above orb */
export const PANEL_Z_INDEX = 1060;

/** Panel backdrop z-index */
export const PANEL_BACKDROP_Z_INDEX = 1055;

export function AssistantPanelContainer({
  assistantProfile,
  isOpen,
  onClose,
  onSubmitIntent,
  response,
  handlers,
  loading = false,
  error,
  layout = 'mobile-sheet',
}: AssistantPanelContainerProps): React.ReactElement | null {
  if (!isOpen) return null;

  const isMobile = layout === 'mobile-sheet';

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: PANEL_BACKDROP_Z_INDEX,
  };

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '85vh',
        backgroundColor: '#ffffff',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        zIndex: PANEL_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.12)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }
    : {
        position: 'fixed',
        bottom: '88px',
        right: '16px',
        width: '380px',
        maxHeight: '600px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        zIndex: PANEL_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid #E5E7EB',
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const closeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '20px',
    color: '#6B7280',
    lineHeight: 1,
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  };

  const inputContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #E5E7EB',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    outline: 'none',
  };

  const sendButtonStyle: React.CSSProperties = {
    padding: '10px 16px',
    backgroundColor: '#4F46E5',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const [inputValue, setInputValue] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || loading) return;
    onSubmitIntent(trimmed);
    setInputValue('');
  };

  // Build response display from handler results
  // The host app should use KaiCommandResultPanel from @kai/ui-components
  // for rendering responses. This container just provides the structure.
  const _responseExists = response !== undefined && response !== null;
  void handlers; // handlers passed through for host app rendering

  return React.createElement(
    React.Fragment,
    null,
    // Backdrop
    React.createElement('div', {
      style: backdropStyle,
      onClick: onClose,
      'aria-hidden': 'true',
      'data-testid': 'panel-backdrop',
    }),
    // Panel
    React.createElement(
      'div',
      {
        role: 'dialog',
        'aria-label': `${assistantProfile.displayName} assistant`,
        'aria-modal': 'true',
        style: panelStyle,
        'data-testid': 'assistant-panel',
        'data-layout': layout,
      },
      // Header
      React.createElement(
        'div',
        { style: headerStyle },
        React.createElement('h2', { style: titleStyle }, assistantProfile.displayName),
        React.createElement(
          'button',
          {
            onClick: onClose,
            'aria-label': `Close ${assistantProfile.displayName}`,
            style: closeButtonStyle,
            type: 'button',
          },
          '✕',
        ),
      ),
      // Body — welcome message or response
      React.createElement(
        'div',
        { style: bodyStyle, 'data-testid': 'panel-body' },
        // Welcome message when no response yet
        !_responseExists && !error
          ? React.createElement(
              'p',
              {
                style: {
                  color: '#6B7280',
                  fontSize: '14px',
                  textAlign: 'center',
                  marginTop: '24px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                },
              },
              assistantProfile.welcomeMessage,
            )
          : null,
        // Error display
        error
          ? React.createElement(
              'p',
              {
                role: 'alert',
                style: { color: '#DC2626', fontSize: '14px', margin: '8px 0' },
              },
              error,
            )
          : null,
        // Response slot — host apps render KaiCommandResultPanel here
        _responseExists
          ? React.createElement('div', { 'data-testid': 'response-slot' })
          : null,
      ),
      // Input form
      React.createElement(
        'form',
        {
          onSubmit: handleSubmit,
          style: inputContainerStyle,
        },
        React.createElement('input', {
          type: 'text',
          value: inputValue,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            setInputValue(e.target.value),
          placeholder: `Ask ${assistantProfile.displayName} anything…`,
          disabled: loading,
          'aria-label': `Ask ${assistantProfile.displayName}`,
          style: inputStyle,
        }),
        React.createElement(
          'button',
          {
            type: 'submit',
            disabled: loading || !inputValue.trim(),
            style: sendButtonStyle,
          },
          loading ? '…' : 'Send',
        ),
      ),
    ),
  );
}
