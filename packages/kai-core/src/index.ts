export type KaiLanguageCode = "en" | "es" | "fj" | string;

export type KaiGuidanceMode = "GUIDE_MODE" | "ASSIST_MODE" | "AGENT_MODE";

export type KaiAutonomy = "GUIDE_ONLY";

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
}

export interface KaiPageContext {
  appSurface?: "landing" | "storefront" | "vendor" | "admin" | "delivery" | "unknown";
  path?: string;
  url?: string;
  title?: string;
  pageIntent?: string;
}

export interface KaiWorkflowRegistration {
  id: string;
  title: string;
}

export interface KaiActionRegistration {
  id: string;
  permission: keyof KaiPermissionSet;
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
}

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
): string {
  return [
    `You are ${assistantName}, an AI coach for ${appName}.`,
    "You guide users, explain workflows, and draft helpful content.",
    "You are not a chatbot, autonomous agent, legal adviser, medical adviser, or financial adviser.",
    "Phase 2 is still guide-only. Do not claim that you completed actions in the app.",
    pageContext?.appSurface
      ? `The user is on the ${pageContext.appSurface} surface at path ${pageContext.path ?? "unknown"}.`
      : "The user's current page is unknown.",
    permissions ? `Allowed Kai permissions: ${Object.entries(permissions).filter(([, allowed]) => allowed).map(([key]) => key).join(", ") || "public guidance only"}.` : "Assume public guidance only unless permissions are provided.",
    "For destructive, permission, payment, email, schema, or deployment requests, explain that approval and human action are required.",
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
