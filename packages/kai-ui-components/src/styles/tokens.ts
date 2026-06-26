// ── @kai/ui-components — Theme Tokens ──
// Default theme, light/dark modes, risk tones, spacing, and typography.
// Host apps can override any token via the theme prop.

import type { KaiUiComponentTheme, KaiThemeMode, KaiRiskLevel, KaiComponentTone } from '../types';

// ── Light Mode ──

export const LIGHT_TOKENS: KaiUiComponentTheme = {
  mode: 'light',
  primaryColor: '#2563eb',
  accentColor: '#7c3aed',
  surfaceColor: '#ffffff',
  textColor: '#1e293b',
  mutedTextColor: '#64748b',
  borderColor: '#e2e8f0',
  borderRadius: '12px',
  dangerColor: '#dc2626',
  warningColor: '#d97706',
  successColor: '#16a34a',
  blockedColor: '#991b1b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  compact: false,
};

// ── Dark Mode ──

export const DARK_TOKENS: KaiUiComponentTheme = {
  mode: 'dark',
  primaryColor: '#60a5fa',
  accentColor: '#a78bfa',
  surfaceColor: '#1e293b',
  textColor: '#f1f5f9',
  mutedTextColor: '#94a3b8',
  borderColor: '#334155',
  borderRadius: '12px',
  dangerColor: '#ef4444',
  warningColor: '#f59e0b',
  successColor: '#22c55e',
  blockedColor: '#fca5a5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  compact: false,
};

// ── Risk Tone Mapping ──

export const RISK_TONE_MAP: Record<KaiRiskLevel, KaiComponentTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  blocked: 'blocked',
};

// ── Tone Color Resolver ──

export function getToneColor(tone: KaiComponentTone, theme: KaiUiComponentTheme): string {
  switch (tone) {
    case 'success':
      return theme.successColor;
    case 'warning':
      return theme.warningColor;
    case 'danger':
      return theme.dangerColor;
    case 'blocked':
      return theme.blockedColor;
    case 'info':
      return theme.primaryColor;
    case 'neutral':
    default:
      return theme.mutedTextColor;
  }
}

// ── Spacing ──

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

// ── Font Sizes ──

export const FONT_SIZES = {
  sm: '13px',
  md: '15px',
  lg: '17px',
  label: '12px',
  heading: '16px',
} as const;

// ── Shadows ──

export const SHADOWS = {
  card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  elevated: '0 4px 12px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
  dialog: '0 8px 30px rgba(0,0,0,0.18), 0 4px 8px rgba(0,0,0,0.1)',
} as const;

// ── Default Theme ──

export const DEFAULT_THEME = LIGHT_TOKENS;

// ── Theme Resolver ──

export function resolveTheme(
  overrides?: Partial<KaiUiComponentTheme>,
  mode?: KaiThemeMode,
): KaiUiComponentTheme {
  const base = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  if (!overrides) return base;
  return { ...base, ...overrides };
}
