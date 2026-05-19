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

export function isPhase1ActionAllowed(actionId: string): boolean {
  return !disallowedPhase1Actions.has(actionId);
}

export function createSafetyReminder(): string {
  return "KAI can guide, explain, and draft suggestions. It cannot perform destructive actions, change permissions, process payments, deploy code, modify schemas, or provide legal, medical, or financial advice as final authority.";
}
