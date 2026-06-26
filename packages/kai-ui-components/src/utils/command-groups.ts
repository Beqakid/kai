// ── @kai/ui-components — Command Group Utilities ──
// Helpers for grouping, filtering, and prioritizing Kai UI commands.

import type { KaiUiCommand, KaiUiCommandType } from '../types';

// ── Group by Type ──

export function groupCommandsByType(
  commands: KaiUiCommand[],
): Record<KaiUiCommandType, KaiUiCommand[]> {
  const groups = {} as Record<KaiUiCommandType, KaiUiCommand[]>;
  for (const cmd of commands) {
    if (!groups[cmd.type]) groups[cmd.type] = [];
    groups[cmd.type].push(cmd);
  }
  return groups;
}

// ── Primary Command ──
// Priority: blocked > admin_review > confirmation > support > navigation > receipt > message > unsupported > modal > no_op

const PRIORITY_ORDER: KaiUiCommandType[] = [
  'show_blocked_notice',
  'request_admin_review',
  'request_confirmation',
  'open_support_form',
  'navigate_to_route',
  'show_receipt',
  'show_message',
  'show_unsupported_notice',
  'open_modal',
  'no_op',
];

export function getPrimaryCommand(commands: KaiUiCommand[]): KaiUiCommand | null {
  if (!commands.length) return null;
  for (const type of PRIORITY_ORDER) {
    const found = commands.find((c) => c.type === type);
    if (found) return found;
  }
  return commands[0];
}

// ── Type Checks ──

export function hasBlockingCommand(commands: KaiUiCommand[]): boolean {
  return commands.some((c) => c.type === 'show_blocked_notice');
}

export function hasConfirmationCommand(commands: KaiUiCommand[]): boolean {
  return commands.some((c) => c.type === 'request_confirmation');
}

export function hasAdminReviewCommand(commands: KaiUiCommand[]): boolean {
  return commands.some((c) => c.type === 'request_admin_review');
}

export function hasSupportCommand(commands: KaiUiCommand[]): boolean {
  return commands.some((c) => c.type === 'open_support_form');
}

export function hasNavigationCommand(commands: KaiUiCommand[]): boolean {
  return commands.some((c) => c.type === 'navigate_to_route');
}
