// ── Kai Task Orchestrator — Safe Action Executor ──
//
// Executes only the safe, approved actions for v1.
// All blocked actions are rejected before reaching this layer.

import { KaiTask, ActionType, BLOCKED_ACTIONS_V1, CONFIRMATION_REQUIRED_ACTIONS } from './types';

export interface ActionResult {
  success: boolean;
  output: string;
  requiresConfirmation: boolean;
}

/**
 * Validate that an action is safe to execute.
 */
export function validateActionSafety(actionType: string): { safe: boolean; reason?: string } {
  if (BLOCKED_ACTIONS_V1.has(actionType)) {
    return { safe: false, reason: `Action "${actionType}" is blocked in Kai v1 for safety.` };
  }
  return { safe: true };
}

/**
 * Execute a safe action for a given task.
 */
export function executeSafeAction(
  actionType: ActionType,
  task: KaiTask,
  context?: Record<string, unknown>,
): ActionResult {
  const needsConfirmation = CONFIRMATION_REQUIRED_ACTIONS.has(actionType);

  switch (actionType) {
    case 'generate_tasklet_prompt':
      return {
        success: true,
        requiresConfirmation: false,
        output: generateTaskletPrompt(task),
      };

    case 'draft_github_issue':
      return {
        success: true,
        requiresConfirmation: true,
        output: draftGitHubIssue(task),
      };

    case 'summarize_blockers':
      return {
        success: true,
        requiresConfirmation: false,
        output: summarizeBlockers(task),
      };

    case 'draft_admin_note':
      return {
        success: true,
        requiresConfirmation: false,
        output: draftAdminNote(task),
      };

    case 'draft_user_message':
      return {
        success: true,
        requiresConfirmation: true,
        output: draftUserMessage(task),
      };

    case 'update_status':
      return {
        success: true,
        requiresConfirmation: false,
        output: `Task "${task.title}" status ready to update.`,
      };

    case 'mark_reviewed':
      return {
        success: true,
        requiresConfirmation: false,
        output: `Recommendation for "${task.title}" marked as reviewed.`,
      };

    case 'create_task':
      return {
        success: true,
        requiresConfirmation: false,
        output: `New task created from "${task.title}".`,
      };

    default:
      return {
        success: false,
        requiresConfirmation: false,
        output: `Unknown action type: "${actionType}".`,
      };
  }
}

// ── Action Generators ──

function generateTaskletPrompt(task: KaiTask): string {
  const lines = [
    `Tasklet Prompt: ${task.title}`,
    '',
    'Context:',
    task.description || `Task from ${task.source} with ${task.priority} priority.`,
    '',
    'Goal:',
    task.suggestedAction || `Resolve "${task.title}" — ${task.priority} priority, ${task.severity} severity.`,
    '',
    `Project: ${task.project || 'General'}`,
    `App: ${task.appId}`,
    `Priority: ${task.priority} (score: ${task.score}/100)`,
    `Risk Level: ${task.riskLevel}`,
    '',
    'Acceptance Criteria:',
    '1. Issue resolved and verified.',
    '2. No regressions introduced.',
    '3. Changes documented.',
  ];
  return lines.join('\n');
}

function draftGitHubIssue(task: KaiTask): string {
  return JSON.stringify({
    title: `[${task.priority.toUpperCase()}] ${task.title}`,
    body: [
      `## Description`,
      task.description || 'No description provided.',
      '',
      `## Details`,
      `- **Source:** ${task.source}`,
      `- **Priority:** ${task.priority} (${task.score}/100)`,
      `- **Severity:** ${task.severity}`,
      `- **Risk Level:** ${task.riskLevel}`,
      `- **Project:** ${task.project || 'General'}`,
      `- **App:** ${task.appId}`,
      '',
      `## Suggested Action`,
      task.suggestedAction || 'See task details.',
    ].join('\n'),
    labels: [task.priority, task.source, task.appId],
  }, null, 2);
}

function summarizeBlockers(task: KaiTask): string {
  return [
    `Blocker Summary for: ${task.title}`,
    `Priority: ${task.priority} | Severity: ${task.severity} | Score: ${task.score}/100`,
    `Status: ${task.status}`,
    `Risk: ${task.riskLevel}`,
    '',
    task.description || 'No detailed description available.',
    '',
    `Suggested next step: ${task.suggestedAction || 'Review and assign.'}`,
  ].join('\n');
}

function draftAdminNote(task: KaiTask): string {
  return [
    `Admin Note — ${new Date().toISOString().split('T')[0]}`,
    '',
    `Re: ${task.title}`,
    `Priority: ${task.priority} | Project: ${task.project || 'General'}`,
    '',
    task.description || 'Task flagged for admin review.',
    '',
    `Recommended action: ${task.suggestedAction || 'Review and prioritize.'}`,
  ].join('\n');
}

function draftUserMessage(task: KaiTask): string {
  return [
    `[DRAFT — Review before sending]`,
    '',
    `Hi,`,
    '',
    `We're working on resolving an issue related to ${task.title.toLowerCase()}.`,
    task.description ? `Details: ${task.description}` : '',
    `We expect to have this addressed soon. Thank you for your patience.`,
    '',
    `Best regards,`,
    `The Team`,
  ].filter(Boolean).join('\n');
}
