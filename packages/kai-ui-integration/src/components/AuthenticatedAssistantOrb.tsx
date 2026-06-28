// ── AuthenticatedAssistantOrb ──
// Floating orb button for opening the assistant panel.
// Design: 56px mobile / 60px desktop, soft gradient, subtle shadow,
// no constant animation, pulse only on suggestion.
// Respects env(safe-area-inset-bottom).
// Does NOT render unless canRenderAssistantOrb() returns true.

import React from 'react';
import type { AssistantOrbProps } from '../types';

/** Default orb sizes */
const DEFAULT_SIZE = { mobile: 56, desktop: 60 };

/** Z-index for the orb — documented constant */
export const ORB_Z_INDEX = 1050;

/**
 * Orb gradient colors by assistant key.
 * Host apps can override via style prop.
 */
const GRADIENT_MAP: Record<string, string> = {
  vili: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
  kai: 'linear-gradient(135deg, #2563EB, #3B82F6)',
  'kai-carehia': 'linear-gradient(135deg, #059669, #10B981)',
  'kai-volau': 'linear-gradient(135deg, #D97706, #F59E0B)',
  'kai-jcc': 'linear-gradient(135deg, #1E40AF, #3B82F6)',
};

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #4F46E5, #7C3AED)';

/**
 * Keyframes for pulse animation (suggestion indicator).
 * Injected once into document head.
 */
const PULSE_KEYFRAMES = `
@keyframes kai-orb-pulse {
  0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
  70% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
  100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
}
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.setAttribute('data-kai-orb', 'true');
  style.textContent = PULSE_KEYFRAMES;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function AuthenticatedAssistantOrb({
  assistantProfile,
  isOpen,
  onClick,
  hasSuggestion = false,
  disabled = false,
  size = DEFAULT_SIZE,
  className,
  style: styleProp,
}: AssistantOrbProps): React.ReactElement {
  // Inject pulse keyframes on first render
  React.useEffect(() => {
    injectStyles();
  }, []);

  const gradient =
    GRADIENT_MAP[assistantProfile.assistantKey] ?? DEFAULT_GRADIENT;

  // Use first character of display name as orb label
  const label = assistantProfile.displayName.charAt(0).toUpperCase();
  const ariaLabel = isOpen
    ? `Close ${assistantProfile.displayName} assistant`
    : `Open ${assistantProfile.displayName} assistant`;

  const baseStyle: React.CSSProperties = {
    // Size — CSS custom properties would be ideal but inline styles work
    width: size.mobile,
    height: size.mobile,
    // Position
    position: 'fixed',
    bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
    right: '16px',
    zIndex: ORB_Z_INDEX,
    // Appearance
    background: gradient,
    border: 'none',
    borderRadius: '50%',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    // Shadow
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    // Animation — pulse only on suggestion
    animation: hasSuggestion && !isOpen ? 'kai-orb-pulse 2s ease-in-out infinite' : 'none',
    // Text
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 700,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    letterSpacing: '0.5px',
    // Transition
    transition: 'transform 0.2s ease, opacity 0.2s ease',
    transform: isOpen ? 'scale(0.9)' : 'scale(1)',
    // Touch
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    // Override with prop styles
    ...styleProp,
  };

  // Desktop media query is handled via CSS class or style prop override
  // The component ships mobile-first; host apps can adjust size at desktop breakpoints

  return React.createElement('button', {
    type: 'button',
    onClick: disabled ? undefined : onClick,
    disabled,
    'aria-label': ariaLabel,
    'aria-expanded': isOpen,
    className,
    style: baseStyle,
    'data-testid': 'assistant-orb',
    'data-assistant-key': assistantProfile.assistantKey,
  }, label);
}
