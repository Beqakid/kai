import type { KaiPermissionSet } from "@kai/core";
import { isPhase1ActionAllowed } from "@kai/governance";

export type KaiActionId =
  | "navigate_to_page"
  | "explain_current_page"
  | "suggest_form_content"
  | "show_workflow_steps"
  | "generate_website_draft";

export interface KaiActionDefinition {
  id: KaiActionId;
  title: string;
  permission: keyof KaiPermissionSet;
  phase1Behavior: "suggestion_only";
}

export const kaiActionRegistry: KaiActionDefinition[] = [
  {
    id: "navigate_to_page",
    title: "Navigate to page",
    permission: "canNavigate",
    phase1Behavior: "suggestion_only",
  },
  {
    id: "explain_current_page",
    title: "Explain current page",
    permission: "canReadKnowledge",
    phase1Behavior: "suggestion_only",
  },
  {
    id: "suggest_form_content",
    title: "Suggest form content",
    permission: "canSuggestFormContent",
    phase1Behavior: "suggestion_only",
  },
  {
    id: "show_workflow_steps",
    title: "Show workflow steps",
    permission: "canUseWorkflows",
    phase1Behavior: "suggestion_only",
  },
  {
    id: "generate_website_draft",
    title: "Generate website draft",
    permission: "canGenerateWebsiteDraft",
    phase1Behavior: "suggestion_only",
  },
];

export function canRunKaiAction(actionId: KaiActionId, permissions: KaiPermissionSet): boolean {
  const action = kaiActionRegistry.find((candidate) => candidate.id === actionId);
  if (!action || !isPhase1ActionAllowed(action.id)) return false;
  return permissions[action.permission] === true;
}
