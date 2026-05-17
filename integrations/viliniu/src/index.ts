import { kaiActionRegistry } from "@kai/actions";
import { registerKai, type KaiPermissionSet, type RegisteredKaiApp } from "@kai/core";
import { kaiWorkflowRegistry } from "@kai/workflows";

export interface ViliniuKaiRegistrationInput {
  userId?: string;
  userRole?: string;
  permissions?: KaiPermissionSet;
  language?: "en" | "es" | "fj";
}

export function registerViliniuKai(input: ViliniuKaiRegistrationInput = {}): RegisteredKaiApp {
  return registerKai({
    app: "viliniu",
    assistantName: "Kai",
    userId: input.userId,
    userRole: input.userRole,
    permissions: {
      canReadKnowledge: true,
      canUseWorkflows: true,
      canGenerateWebsiteDraft: true,
      canSuggestFormContent: true,
      canNavigate: true,
      ...input.permissions,
    },
    workflows: kaiWorkflowRegistry.map((workflow) => ({
      id: workflow.id,
      title: workflow.title,
    })),
    actions: kaiActionRegistry.map((action) => ({
      id: action.id,
      permission: action.permission,
    })),
    knowledgeSources: [
      "overview",
      "onboarding",
      "faq",
      "privacy-summary",
      "terms-summary",
      "website-builder",
    ].flatMap((name) =>
      ["en", "es", "fj"].map((language) => ({
        id: `viliniu_${language}_${name}`,
        app: "viliniu",
        language,
        title: name.replace(/-/g, " "),
        path: `knowledge/viliniu/${language}/${name}.md`,
      })),
    ),
    branding: {
      primaryColor: "#0f766e",
      accentColor: "#f59e0b",
      position: "bottom-right",
    },
    languages: ["en", "es", "fj"],
    preferredLanguage: input.language ?? "en",
  });
}
