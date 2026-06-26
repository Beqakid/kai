// ── @kai/ui-components — Format Utilities ──
// Safe formatting helpers for labels, risk levels, and display text.

import type { KaiRiskLevel, KaiUiDecision, KaiUiCommand, KaiComponentTone } from '../types';
import { RISK_TONE_MAP } from '../styles/tokens';

// ── Risk Label ──

const RISK_LABELS: Record<KaiRiskLevel, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  blocked: 'Blocked',
};

export function formatRiskLabel(riskLevel: KaiRiskLevel): string {
  return RISK_LABELS[riskLevel] ?? 'Unknown risk';
}

// ── Decision Label ──

const DECISION_LABELS: Record<KaiUiDecision, string> = {
  allowed: 'Allowed',
  recommended: 'Recommended',
  requires_confirmation: 'Requires confirmation',
  requires_admin_review: 'Requires admin review',
  blocked: 'Blocked',
  unsupported: 'Not supported',
  not_found: 'Not found',
  failed: 'Failed',
};

export function formatDecisionLabel(decision: KaiUiDecision): string {
  return DECISION_LABELS[decision] ?? 'Unknown';
}

// ── Command Label ──

const COMMAND_LABELS: Record<string, string> = {
  show_message: 'Message',
  navigate_to_route: 'Navigation',
  open_modal: 'Open dialog',
  open_support_form: 'Support request',
  request_confirmation: 'Confirmation required',
  request_admin_review: 'Admin review required',
  show_blocked_notice: 'Action blocked',
  show_unsupported_notice: 'Not supported',
  show_receipt: 'Receipt',
  no_op: 'No action needed',
};

export function formatCommandLabel(command: KaiUiCommand): string {
  return command.title ?? COMMAND_LABELS[command.type] ?? 'Unknown command';
}

// ── Risk Tone ──

export function getRiskTone(riskLevel: KaiRiskLevel): KaiComponentTone {
  return RISK_TONE_MAP[riskLevel] ?? 'neutral';
}

// ── Default Command Message ──

export function getDefaultCommandMessage(command: KaiUiCommand): string {
  if (command.message) return getSafeDisplayText(command.message);

  switch (command.type) {
    case 'show_message':
      return 'Kai has a message for you.';
    case 'navigate_to_route':
      return command.routePath
        ? `Navigate to ${getSafeDisplayText(command.routePath)}`
        : 'Navigate to the suggested page.';
    case 'open_modal':
      return 'A dialog needs your attention.';
    case 'open_support_form':
      return 'A support request has been prepared.';
    case 'request_confirmation':
      return 'This action requires your confirmation.';
    case 'request_admin_review':
      return 'This action requires admin review.';
    case 'show_blocked_notice':
      return 'This action is not permitted.';
    case 'show_unsupported_notice':
      return 'Kai cannot handle this request yet.';
    case 'show_receipt':
      return 'Here is your receipt.';
    case 'no_op':
      return 'No action needed.';
    default:
      return 'Kai responded.';
  }
}

// ── Safe Display Text ──
// Strips HTML tags, script content, and dangerous patterns.
// Does NOT display raw metadata, tokens, secrets, or private data.

const UNSAFE_HTML_REGEX = /<\/?[^>]+(>|$)/g;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URI_REGEX = /javascript\s*:/gi;

export function getSafeDisplayText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let safe = text;
  safe = safe.replace(SCRIPT_REGEX, '');
  safe = safe.replace(EVENT_HANDLER_REGEX, '');
  safe = safe.replace(JAVASCRIPT_URI_REGEX, '');
  safe = safe.replace(UNSAFE_HTML_REGEX, '');
  // Collapse whitespace
  safe = safe.replace(/\s+/g, ' ').trim();
  // Cap length for display safety
  if (safe.length > 2000) {
    safe = safe.slice(0, 2000) + '…';
  }
  return safe;
}
