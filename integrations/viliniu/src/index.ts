import { kaiActionRegistry } from "@kai/actions";
import { registerKai, type KaiPermissionSet, type RegisteredKaiApp } from "@kai/core";
import { kaiWorkflowRegistry } from "@kai/workflows";

export interface ViliniuKaiRegistrationInput {
  userId?: string;
  userRole?: ViliniuKaiRole;
  permissions?: KaiPermissionSet;
  language?: "en" | "es" | "fj";
}

export type ViliniuKaiRole = "visitor" | "customer" | "vendor" | "service_provider" | "driver" | "admin" | string;

export function mapViliniuPayloadRoleToKaiPermissions(role: ViliniuKaiRole = "visitor"): KaiPermissionSet {
  if (role === "admin") {
    return {
      canReadKnowledge: true,
      canUseWorkflows: true,
      canGenerateWebsiteDraft: true,
      canSuggestFormContent: true,
      canNavigate: true,
      canViewAdminGuidance: true,
      canViewDeliveryGuidance: true,
    };
  }

  if (role === "vendor" || role === "service_provider") {
    return {
      canReadKnowledge: true,
      canUseWorkflows: true,
      canGenerateWebsiteDraft: true,
      canSuggestFormContent: true,
      canNavigate: true,
    };
  }

  if (role === "driver") {
    return {
      canReadKnowledge: true,
      canUseWorkflows: true,
      canNavigate: true,
      canViewDeliveryGuidance: true,
    };
  }

  if (role === "customer") {
    return {
      canReadKnowledge: true,
      canUseWorkflows: true,
      canNavigate: true,
    };
  }

  return {
    canReadKnowledge: true,
    canUseWorkflows: true,
    canGenerateWebsiteDraft: true,
  };
}

export function registerViliniuKai(input: ViliniuKaiRegistrationInput = {}): RegisteredKaiApp {
  const rolePermissions = mapViliniuPayloadRoleToKaiPermissions(input.userRole);

  return registerKai({
    app: "viliniu",
    assistantName: "Kai",
    userId: input.userId,
    userRole: input.userRole,
    permissions: {
      ...rolePermissions,
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
