export type KaiLanguageCode = "en" | "es" | "fj" | string;

export type KaiGuidanceMode = "GUIDE_MODE" | "ASSIST_MODE" | "AGENT_MODE";

export type KaiAutonomy = "GUIDE_ONLY";

export type KaiOperationsRole =
  | "coach"
  | "onboarding_wizard"
  | "sales_assistant"
  | "marketing_assistant"
  | "personal_assistant"
  | "customer_support_assistant"
  | "it_support_assistant"
  | "accounting_assistant"
  | "admin_assistant"
  | "workflow_guide"
  | "future_agent_operator";

export type KaiActionSensitivity = "safe_suggestion" | "approval_required" | "human_only" | "disallowed";

export type KaiApprovalRequirement =
  | "none"
  | "user_confirmation"
  | "manager_approval"
  | "admin_approval"
  | "human_operator_required";

export type KaiEscalationTarget =
  | "app_admin"
  | "human_support"
  | "technical_support"
  | "finance_reviewer"
  | "compliance_reviewer"
  | "emergency_or_professional_service";

export type KaiBehaviorStep =
  | "understand_context"
  | "guide_user"
  | "suggest_next_steps"
  | "assist_with_preparation"
  | "request_approval_for_sensitive_actions"
  | "execute_only_approved_safe_actions"
  | "log_important_actions"
  | "escalate_when_needed";

export interface KaiFeatureFlags {
  aiCoachEnabled: boolean;
  voiceEnabled: boolean;
  wakewordEnabled: boolean;
  multilingualEnabled: boolean;
  interviewModeEnabled: boolean;
  adaptiveLearningEnabled: boolean;
  agentModeEnabled: boolean;
  supportEscalationEnabled: boolean;
  defaultAutonomy: KaiAutonomy;
}

export interface KaiBranding {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  position?: "bottom-right" | "bottom-left";
}

export interface KaiPermissionSet {
  canReadKnowledge?: boolean;
  canUseWorkflows?: boolean;
  canGenerateWebsiteDraft?: boolean;
  canSuggestFormContent?: boolean;
  canNavigate?: boolean;
  canViewAdminGuidance?: boolean;
  canViewDeliveryGuidance?: boolean;
  canUseSalesGuidance?: boolean;
  canUseMarketingGuidance?: boolean;
  canUseCustomerSupportGuidance?: boolean;
  canUseITSupportGuidance?: boolean;
  canUseAccountingGuidance?: boolean;
  canUseAdminGuidance?: boolean;
  canPrepareSensitiveAction?: boolean;
  canExecuteApprovedSafeAction?: boolean;
}

export interface KaiPageContext {
  appSurface?: "landing" | "storefront" | "vendor" | "admin" | "delivery" | "unknown";
  path?: string;
  url?: string;
  title?: string;
  pageIntent?: string;
}

export interface KaiOperationalContext {
  app: string;
  appSurface?: KaiPageContext["appSurface"];
  userId?: string;
  userRole?: string;
  activeKaiRole: KaiOperationsRole;
  userGoal?: string;
  pageContext?: KaiPageContext;
  allowedToolIds: string[];
  approvalRequiredFor: string[];
  escalationTargets: KaiEscalationTarget[];
}

export interface KaiWorkflowRegistration {
  id: string;
  title: string;
}

export interface KaiActionRegistration {
  id: string;
  permission: keyof KaiPermissionSet;
  sensitivity?: KaiActionSensitivity;
  approvalRequirement?: KaiApprovalRequirement;
  toolId?: string;
}

export interface KaiKnowledgeSourceRegistration {
  id: string;
  app: string;
  language: KaiLanguageCode;
  title: string;
  path: string;
  summary?: string;
}

export interface KaiRegistrationConfig {
  app: string;
  assistantName: string;
  userId?: string;
  userRole?: string;
  permissions: KaiPermissionSet;
  supportedRoles?: KaiOperationsRole[];
  defaultRole?: KaiOperationsRole;
  workflows: KaiWorkflowRegistration[];
  actions: KaiActionRegistration[];
  knowledgeSources: KaiKnowledgeSourceRegistration[];
  branding?: KaiBranding;
  languages: KaiLanguageCode[];
  preferredLanguage?: KaiLanguageCode;
  featureFlags?: Partial<KaiFeatureFlags>;
}

export interface RegisteredKaiApp extends KaiRegistrationConfig {
  guidanceMode: "GUIDE_MODE";
  featureFlags: KaiFeatureFlags;
  supportedRoles: KaiOperationsRole[];
  defaultRole: KaiOperationsRole;
}

export interface KaiCoachMessage {
  role: "user" | "assistant" | "system";
  content: string;
  language?: KaiLanguageCode;
}

export interface KaiCoachRequest {
  app: string;
  assistantName: string;
  sessionId: string;
  userId?: string;
  userRole?: string;
  activeKaiRole?: KaiOperationsRole;
  userGoal?: string;
  allowedToolIds?: string[];
  approvalRequiredFor?: string[];
  escalationTargets?: KaiEscalationTarget[];
  permissions?: KaiPermissionSet;
  pageContext?: KaiPageContext;
  language: KaiLanguageCode;
  message: string;
  messages?: KaiCoachMessage[];
  knowledge?: string[];
  workflowId?: string;
}

export interface KaiCoachResponse {
  content: string;
  language: KaiLanguageCode;
  suggestedActions?: string[];
  workflowId?: string;
  knowledgeSourceIds?: string[];
  needsApproval?: boolean;
  approvalReason?: string;
  escalationTarget?: KaiEscalationTarget;
}

export const kaiOperationsBehaviorModel: KaiBehaviorStep[] = [
  "understand_context",
  "guide_user",
  "suggest_next_steps",
  "assist_with_preparation",
  "request_approval_for_sensitive_actions",
  "execute_only_approved_safe_actions",
  "log_important_actions",
  "escalate_when_needed",
];

export const kaiOperationsRoles: KaiOperationsRole[] = [
  "coach",
  "onboarding_wizard",
  "sales_assistant",
  "marketing_assistant",
  "personal_assistant",
  "customer_support_assistant",
  "it_support_assistant",
  "accounting_assistant",
  "admin_assistant",
  "workflow_guide",
  "future_agent_operator",
];

export const kaiOperationsLayer = {
  purpose: "platform_wide_ai_operations_layer",
  behaviorModel: kaiOperationsBehaviorModel,
  roles: kaiOperationsRoles,
  defaultAutonomy: "GUIDE_ONLY",
  agentOperatorEnabled: false,
} as const;

export interface KaiModelProvider {
  generateCoachResponse(request: KaiCoachRequest): Promise<KaiCoachResponse>;
  summarizeKnowledge(markdown: string, language: KaiLanguageCode): Promise<string>;
  detectLanguage(text: string): Promise<KaiLanguageCode>;
}

export interface KaiInterviewModePlaceholder {
  enabled: false;
  futureUseCases: Array<"onboarding_interview" | "vendor_interview" | "caregiver_interview" | "profile_generation">;
}

export interface KaiAdaptiveLearningPlaceholder {
  enabled: false;
  futureSignals: Array<
    "user_preferences" | "workflow_friction" | "repeated_questions" | "onboarding_drop_off"
  >;
  productionSelfModificationAllowed: false;
}

export const futureKaiCapabilities = {
  interviewMode: {
    enabled: false,
    futureUseCases: ["onboarding_interview", "vendor_interview", "caregiver_interview", "profile_generation"],
  },
  adaptiveLearning: {
    enabled: false,
    futureSignals: ["user_preferences", "workflow_friction", "repeated_questions", "onboarding_drop_off"],
    productionSelfModificationAllowed: false,
  },
} satisfies {
  interviewMode: KaiInterviewModePlaceholder;
  adaptiveLearning: KaiAdaptiveLearningPlaceholder;
};

export function createDefaultFeatureFlags(): KaiFeatureFlags {
  return {
    aiCoachEnabled: true,
    voiceEnabled: false,
    wakewordEnabled: false,
    multilingualEnabled: true,
    interviewModeEnabled: false,
    adaptiveLearningEnabled: false,
    agentModeEnabled: false,
    supportEscalationEnabled: false,
    defaultAutonomy: "GUIDE_ONLY",
  };
}

export function registerKai(config: KaiRegistrationConfig): RegisteredKaiApp {
  return {
    ...config,
    guidanceMode: "GUIDE_MODE",
    supportedRoles: config.supportedRoles ?? ["coach", "onboarding_wizard", "workflow_guide"],
    defaultRole: config.defaultRole ?? "coach",
    featureFlags: {
      ...createDefaultFeatureFlags(),
      ...config.featureFlags,
      voiceEnabled: false,
      wakewordEnabled: false,
      agentModeEnabled: false,
      supportEscalationEnabled: false,
      defaultAutonomy: "GUIDE_ONLY",
    },
  };
}

export function createKaiSystemPrompt(
  appName: string,
  assistantName = "Kai",
  pageContext?: KaiPageContext,
  permissions?: KaiPermissionSet,
  operationalContext?: Partial<KaiOperationalContext>,
): string {
  return [
    `You are ${assistantName}, a multi-role AI Operations Assistant for ${appName}.`,
    "You are a platform-wide AI operations layer, not a chatbot.",
    `Your active role is ${operationalContext?.activeKaiRole ?? "coach"}.`,
    operationalContext?.userRole ? `The active user role is ${operationalContext.userRole}.` : "The active user role is unknown.",
    operationalContext?.userGoal ? `The user's current goal appears to be: ${operationalContext.userGoal}.` : "Infer the user's goal from the page, message, workflow, and available context.",
    "Always follow this behavior model: understand context, guide the user, suggest next steps, assist with preparation, request approval for sensitive actions, execute only approved safe actions, log important actions, and escalate when needed.",
    "You may act as coach, onboarding wizard, sales assistant, marketing assistant, personal assistant, customer support assistant, IT support assistant, accounting assistant, admin assistant, workflow guide, or future agent operator only when that role is enabled and permissioned.",
    "You are not a final legal adviser, medical adviser, or financial adviser.",
    "Phase 2 is still guide-only. Do not claim that you completed actions in the app.",
    pageContext?.appSurface
      ? `The user is on the ${pageContext.appSurface} surface at path ${pageContext.path ?? "unknown"}.`
      : "The user's current page is unknown.",
    permissions ? `Allowed Kai permissions: ${Object.entries(permissions).filter(([, allowed]) => allowed).map(([key]) => key).join(", ") || "public guidance only"}.` : "Assume public guidance only unless permissions are provided.",
    operationalContext?.allowedToolIds?.length ? `Allowed tool IDs: ${operationalContext.allowedToolIds.join(", ")}.` : "No direct tools are available unless explicitly provided.",
    operationalContext?.approvalRequiredFor?.length ? `Approval is required for: ${operationalContext.approvalRequiredFor.join(", ")}.` : "Sensitive actions require approval by default.",
    operationalContext?.escalationTargets?.length ? `Escalation targets: ${operationalContext.escalationTargets.join(", ")}.` : "Escalate to a human when the request is unsafe, unclear, urgent, regulated, or outside allowed permissions.",
    "For destructive, permission, payment, email, schema, deployment, caregiver approval, medical, legal, financial, or production-changing requests, ask for approval or escalate instead of acting silently.",
  ].join(" ");
}

export class MockKaiModelProvider implements KaiModelProvider {
  async generateCoachResponse(request: KaiCoachRequest): Promise<KaiCoachResponse> {
    return {
      content: `Hi, I'm ${request.assistantName}. I can guide you through ${request.app}, explain workflows, and help draft your next step. You asked: "${request.message}"`,
      language: request.language,
      suggestedActions: ["show_workflow_steps"],
      workflowId: request.workflowId,
    };
  }

  async summarizeKnowledge(markdown: string, language: KaiLanguageCode): Promise<string> {
    return `[${language}] ${markdown.slice(0, 280)}`;
  }

  async detectLanguage(text: string): Promise<KaiLanguageCode> {
    if (/[¿¡]|\b(hola|gracias|negocio)\b/i.test(text)) return "es";
    if (/\b(bula|vinaka|veiqaravi|volivoli)\b/i.test(text)) return "fj";
    return "en";
  }
}

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIKaiModelProvider implements KaiModelProvider {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAIProviderConfig) {
    this.model = config.model ?? "gpt-4.1-mini";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async generateCoachResponse(request: KaiCoachRequest): Promise<KaiCoachResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: createKaiSystemPrompt(
              request.app,
              request.assistantName,
              request.pageContext,
              request.permissions,
              {
                app: request.app,
                userRole: request.userRole,
                activeKaiRole: request.activeKaiRole ?? "coach",
                userGoal: request.userGoal,
                allowedToolIds: request.allowedToolIds ?? [],
                approvalRequiredFor: request.approvalRequiredFor ?? [],
                escalationTargets: request.escalationTargets ?? [],
              },
            ),
          },
          ...(request.knowledge ?? []).map((content) => ({ role: "system", content })),
          ...(request.messages ?? []),
          { role: "user", content: request.message },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider failed with status ${response.status}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };

    return {
      content: data.choices?.[0]?.message?.content ?? "I could not generate a response yet.",
      language: request.language,
      workflowId: request.workflowId,
    };
  }

  async summarizeKnowledge(markdown: string, language: KaiLanguageCode): Promise<string> {
    const response = await this.generateCoachResponse({
      app: "kai",
      assistantName: "Kai",
      sessionId: "summary",
      language,
      message: `Summarize this knowledge for retrieval:\n\n${markdown}`,
    });
    return response.content;
  }

  async detectLanguage(text: string): Promise<KaiLanguageCode> {
    const response = await this.generateCoachResponse({
      app: "kai",
      assistantName: "Kai",
      sessionId: "language-detect",
      language: "en",
      message: `Return only one language code for this text: en, es, or fj.\n\n${text}`,
    });

    const code = response.content.trim().toLowerCase();
    return code === "es" || code === "fj" ? code : "en";
  }
}
