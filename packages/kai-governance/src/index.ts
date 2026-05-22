export interface KaiAuditEvent {
  id: string;
  app: string;
  sessionId?: string;
  userId?: string;
  action: string;
  permission?: string;
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface KaiApprovalPolicy {
  actionId: string;
  sensitivity: "safe_suggestion" | "approval_required" | "human_only" | "disallowed";
  approvalRequirement: "none" | "user_confirmation" | "manager_approval" | "admin_approval" | "human_operator_required";
  reason: string;
}

export const disallowedPhase1Actions = new Set([
  "submit_form",
  "delete_data",
  "send_email",
  "change_permissions",
  "process_payment",
  "deploy_code",
  "modify_schema",
  "publish_website",
  "save_media",
  "publish_media",
  "use_generated_asset_without_approval",
]);

export const kaiApprovalPolicies: KaiApprovalPolicy[] = [
  {
    actionId: "navigate_to_page",
    sensitivity: "safe_suggestion",
    approvalRequirement: "none",
    reason: "Navigation can be suggested or performed only as a reversible UI assist.",
  },
  {
    actionId: "suggest_form_content",
    sensitivity: "safe_suggestion",
    approvalRequirement: "none",
    reason: "Kai may draft content, but the user must review before saving.",
  },
  {
    actionId: "send_email",
    sensitivity: "approval_required",
    approvalRequirement: "user_confirmation",
    reason: "Sending messages transmits information outside the current session.",
  },
  {
    actionId: "process_payment",
    sensitivity: "human_only",
    approvalRequirement: "human_operator_required",
    reason: "Payment actions require explicit product controls and human confirmation.",
  },
  {
    actionId: "change_permissions",
    sensitivity: "human_only",
    approvalRequirement: "admin_approval",
    reason: "Permission changes alter access control and require an authorized admin.",
  },
  {
    actionId: "deploy_code",
    sensitivity: "human_only",
    approvalRequirement: "admin_approval",
    reason: "Deployments can modify production behavior and require operator approval.",
  },
  {
    actionId: "provide_medical_decision",
    sensitivity: "disallowed",
    approvalRequirement: "human_operator_required",
    reason: "Kai must not provide medical advice as final authority.",
  },
];

export function isPhase1ActionAllowed(actionId: string): boolean {
  return !disallowedPhase1Actions.has(actionId);
}

export function getKaiApprovalPolicy(actionId: string): KaiApprovalPolicy {
  return kaiApprovalPolicies.find((policy) => policy.actionId === actionId) ?? {
    actionId,
    sensitivity: isPhase1ActionAllowed(actionId) ? "approval_required" : "disallowed",
    approvalRequirement: isPhase1ActionAllowed(actionId) ? "user_confirmation" : "human_operator_required",
    reason: isPhase1ActionAllowed(actionId)
      ? "Unknown actions require approval until an app profile explicitly marks them safe."
      : "This action is blocked by the current Kai safety policy.",
  };
}

export function createSafetyReminder(): string {
  return "KAI is a platform-wide AI Operations Assistant. It can understand context, guide users, suggest next steps, and prepare work. Sensitive actions require approval, important actions must be logged, and medical, legal, financial, destructive, permission, payment, schema, deployment, and production-changing requests must be escalated or handled by approved human workflows.";
}
