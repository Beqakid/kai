import {
  MockKaiModelProvider,
  OpenAIKaiModelProvider,
  type KaiModelProvider,
  type KaiPageContext,
  type KaiPermissionSet,
} from "@kai/core";
import { getKaiGreeting, normalizeKaiLanguage } from "@kai/language";
import { generateWebsiteDraftFromAnswers, type KaiWebsiteBuilderAnswers } from "@kai/website-builder";
import { kaiWorkflowRegistry } from "@kai/workflows";

export interface KaiWorkerEnv {
  KAI_DB: D1Database;
  OPENAI_API_KEY?: string;
  KAI_DEFAULT_LANGUAGE?: string;
  AI_COACH_ENABLED?: string;
  AI_COACH_MULTILINGUAL?: string;
  KAI_ALLOWED_ORIGINS?: string;
}

const defaultAllowedOrigins = new Set([
  "https://viliniu.com",
  "https://www.viliniu.com",
  "https://viliniu-landing.pages.dev",
  "https://shop.viliniu.com",
  "https://viliniu-storefront.pages.dev",
  "https://vendor.viliniu.com",
  "https://viliniu-vendor.pages.dev",
  "https://admin.viliniu.com",
  "https://viliniu-admin.pages.dev",
  "https://delivery.viliniu.com",
  "https://viliniu-delivery.pages.dev",
]);

function getAllowedOrigin(request: Request, env: KaiWorkerEnv): string {
  const requestOrigin = request.headers.get("Origin");
  const configured = new Set(
    (env.KAI_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const allowed = configured.size > 0 ? configured : defaultAllowedOrigins;

  if (requestOrigin && allowed.has(requestOrigin)) return requestOrigin;
  return "https://viliniu.com";
}

function json(request: Request, env: KaiWorkerEnv, data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(request, env),
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...init?.headers,
    },
  });
}

function javascript(source: string): Response {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getProvider(env: KaiWorkerEnv): KaiModelProvider {
  if (env.OPENAI_API_KEY) {
    return new OpenAIKaiModelProvider({ apiKey: env.OPENAI_API_KEY });
  }
  return new MockKaiModelProvider();
}

function mapRoleToPermissions(role = "visitor"): KaiPermissionSet {
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

function inferPageContext(input: { path?: string; url?: string; title?: string }): KaiPageContext {
  const url = input.url;
  const path = input.path ?? (url ? new URL(url).pathname : undefined) ?? "/";
  const host = url ? new URL(url).hostname : "";
  const normalizedPath = path.toLowerCase();

  if (host.startsWith("admin.") || host.includes("admin")) {
    return { appSurface: "admin", path, url, title: input.title, pageIntent: "admin dashboard explanation and safe operational guidance" };
  }
  if (host.startsWith("delivery.") || host.includes("delivery")) {
    return { appSurface: "delivery", path, url, title: input.title, pageIntent: "delivery workflow guidance" };
  }
  if (host.startsWith("vendor.") || host.includes("vendor") || normalizedPath.includes("dashboard/products") || normalizedPath.includes("dashboard/store")) {
    return { appSurface: "vendor", path, url, title: input.title, pageIntent: "vendor onboarding, listings, orders, and website setup" };
  }
  if (host.startsWith("shop.") || host.includes("storefront") || normalizedPath.includes("products") || normalizedPath.includes("vendors")) {
    return { appSurface: "storefront", path, url, title: input.title, pageIntent: "shopping and marketplace guidance" };
  }
  if (host.includes("viliniu.com") || host.includes("landing")) {
    return { appSurface: "landing", path, url, title: input.title, pageIntent: "public onboarding and Viliniu explanation" };
  }
  return { appSurface: "unknown", path, url, title: input.title, pageIntent: "general Viliniu guidance" };
}

function getSuggestedWorkflowIds(pageContext: KaiPageContext): string[] {
  if (pageContext.appSurface === "vendor") {
    return ["vendor_onboarding", "create_business_profile", "add_product_listing", "ai_website_setup"];
  }
  if (pageContext.appSurface === "storefront") {
    return ["explain_marketplace_model"];
  }
  if (pageContext.appSurface === "landing") {
    return ["explain_marketplace_model", "vendor_onboarding", "ai_website_setup"];
  }
  if (pageContext.appSurface === "delivery") {
    return ["explain_marketplace_model"];
  }
  if (pageContext.appSurface === "admin") {
    return ["explain_marketplace_model"];
  }
  return ["explain_marketplace_model"];
}

async function loadKnowledgeSnippets(env: KaiWorkerEnv, app: string, language: string, message: string, pageContext: KaiPageContext): Promise<{ snippets: string[]; sourceIds: string[] }> {
  const result = await env.KAI_DB.prepare(
    "SELECT id, title, summary, path FROM kai_knowledge_sources WHERE app = ? AND language = ? AND enabled = 1 ORDER BY title",
  )
    .bind(app, language)
    .all<{ id: string; title: string; summary: string | null; path: string }>();

  const query = `${message} ${pageContext.pageIntent ?? ""} ${pageContext.path ?? ""}`.toLowerCase();
  const candidates = (result.results ?? []).filter((source) => {
    const haystack = `${source.id} ${source.title} ${source.summary ?? ""} ${source.path}`.toLowerCase();
    return query.split(/\W+/).some((token) => token.length > 3 && haystack.includes(token));
  });
  const selected = (candidates.length ? candidates : result.results ?? []).slice(0, 3);

  return {
    snippets: selected.map((source) => `Knowledge source: ${source.title}\n${source.summary ?? source.path}`),
    sourceIds: selected.map((source) => source.id),
  };
}

async function createSession(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    app?: string;
    userId?: string;
    userRole?: string;
    language?: string;
    path?: string;
    url?: string;
    title?: string;
  };
  const language = normalizeKaiLanguage(body.language ?? env.KAI_DEFAULT_LANGUAGE);
  const sessionId = createId("kai_session");
  const pageContext = inferPageContext(body);

  await env.KAI_DB.prepare(
    "INSERT INTO kai_sessions (id, app, user_id, user_role, language, guidance_mode, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      sessionId,
      body.app ?? "viliniu",
      body.userId ?? null,
      body.userRole ?? null,
      language,
      "GUIDE_MODE",
      JSON.stringify({ pageContext, permissions: mapRoleToPermissions(body.userRole) }),
    )
    .run();

  return json(request, env, {
    sessionId,
    language,
    pageContext,
    suggestedWorkflowIds: getSuggestedWorkflowIds(pageContext),
    greeting: getKaiGreeting(language),
  });
}

async function createMessage(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    app?: string;
    assistantName?: string;
    sessionId?: string;
    userId?: string;
    userRole?: string;
    language?: string;
    message?: string;
    workflowId?: string;
    path?: string;
    url?: string;
    title?: string;
    permissions?: KaiPermissionSet;
  };

  if (!body.sessionId || !body.message) {
    return json(request, env, { error: "sessionId and message are required" }, { status: 400 });
  }

  const language = normalizeKaiLanguage(body.language ?? env.KAI_DEFAULT_LANGUAGE);
  const pageContext = inferPageContext(body);
  const permissions = { ...mapRoleToPermissions(body.userRole), ...body.permissions };
  const knowledge = await loadKnowledgeSnippets(env, body.app ?? "viliniu", language, body.message, pageContext);
  const userMessageId = createId("kai_msg");
  await env.KAI_DB.prepare(
    "INSERT INTO kai_messages (id, session_id, role, language, content, workflow_id) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(userMessageId, body.sessionId, "user", language, body.message, body.workflowId ?? null)
    .run();

  const provider = getProvider(env);
  const response = await provider.generateCoachResponse({
    app: body.app ?? "viliniu",
    assistantName: body.assistantName ?? "Kai",
    sessionId: body.sessionId,
    userId: body.userId,
    userRole: body.userRole,
    permissions,
    pageContext,
    language,
    message: body.message,
    knowledge: knowledge.snippets,
    workflowId: body.workflowId,
  });

  const assistantMessageId = createId("kai_msg");
  await env.KAI_DB.prepare(
    "INSERT INTO kai_messages (id, session_id, role, language, content, workflow_id, knowledge_sources_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      assistantMessageId,
      body.sessionId,
      "assistant",
      response.language,
      response.content,
      response.workflowId ?? null,
      JSON.stringify(response.knowledgeSourceIds ?? knowledge.sourceIds),
    )
    .run();

  return json(request, env, {
    ...response,
    messageId: assistantMessageId,
    pageContext,
    suggestedWorkflowIds: getSuggestedWorkflowIds(pageContext),
    knowledgeSourceIds: response.knowledgeSourceIds ?? knowledge.sourceIds,
  });
}

async function updatePreferences(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    app?: string;
    userId?: string;
    preferredLanguage?: string;
    preferences?: Record<string, unknown>;
  };

  if (!body.userId) {
    return json(request, env, { error: "userId is required" }, { status: 400 });
  }

  const id = createId("kai_pref");
  const language = normalizeKaiLanguage(body.preferredLanguage ?? env.KAI_DEFAULT_LANGUAGE);

  await env.KAI_DB.prepare(
    "INSERT INTO kai_user_preferences (id, app, user_id, preferred_language, preferences_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(app, user_id) DO UPDATE SET preferred_language = excluded.preferred_language, preferences_json = excluded.preferences_json, updated_at = CURRENT_TIMESTAMP",
  )
    .bind(id, body.app ?? "viliniu", body.userId, language, JSON.stringify(body.preferences ?? {}))
    .run();

  return json(request, env, { ok: true, preferredLanguage: language });
}

async function listKnowledgeSources(request: Request, url: URL, env: KaiWorkerEnv): Promise<Response> {
  const app = url.searchParams.get("app") ?? "viliniu";
  const language = normalizeKaiLanguage(url.searchParams.get("language") ?? env.KAI_DEFAULT_LANGUAGE);
  const result = await env.KAI_DB.prepare(
    "SELECT id, app, language, title, path, summary, enabled FROM kai_knowledge_sources WHERE app = ? AND language = ? AND enabled = 1 ORDER BY title",
  )
    .bind(app, language)
    .all();

  return json(request, env, { sources: result.results ?? [] });
}

async function getContext(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const pageContext = inferPageContext({
    path: url.searchParams.get("path") ?? undefined,
    url: url.searchParams.get("url") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
  });

  return json(request, env, {
    pageContext,
    suggestedWorkflowIds: getSuggestedWorkflowIds(pageContext),
    workflows: kaiWorkflowRegistry.filter((workflow) => getSuggestedWorkflowIds(pageContext).includes(workflow.id)),
  });
}

async function updateWorkflowState(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    app?: string;
    userId?: string;
    workflowId?: string;
    currentStepId?: string;
    completedStepIds?: string[];
    status?: "not_started" | "in_progress" | "completed";
  };

  if (!body.sessionId || !body.workflowId) {
    return json(request, env, { error: "sessionId and workflowId are required" }, { status: 400 });
  }

  const id = createId("kai_workflow");
  await env.KAI_DB.prepare(
    "INSERT INTO kai_workflow_states (id, session_id, app, user_id, workflow_id, current_step_id, completed_step_ids_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, workflow_id) DO UPDATE SET current_step_id = excluded.current_step_id, completed_step_ids_json = excluded.completed_step_ids_json, status = excluded.status, updated_at = CURRENT_TIMESTAMP",
  )
    .bind(
      id,
      body.sessionId,
      body.app ?? "viliniu",
      body.userId ?? null,
      body.workflowId,
      body.currentStepId ?? null,
      JSON.stringify(body.completedStepIds ?? []),
      body.status ?? "in_progress",
    )
    .run();

  return json(request, env, { ok: true });
}

async function generateWebsiteDraft(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    app?: string;
    userId?: string;
    userRole?: string;
    answers?: KaiWebsiteBuilderAnswers;
  };
  const permissions = mapRoleToPermissions(body.userRole);

  if (!permissions.canGenerateWebsiteDraft) {
    return json(request, env, { error: "Website draft generation is not allowed for this role." }, { status: 403 });
  }

  const draft = generateWebsiteDraftFromAnswers(body.answers ?? {});
  const draftId = createId("kai_draft");
  await env.KAI_DB.prepare(
    "INSERT INTO kai_audit_logs (id, app, session_id, user_id, action, permission, allowed, reason, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      draftId,
      body.app ?? "viliniu",
      body.sessionId ?? null,
      body.userId ?? null,
      "generate_website_draft",
      "canGenerateWebsiteDraft",
      1,
      "Generated draft only. Approval is required before public launch, orders, and payments.",
      JSON.stringify({ draft }),
    )
    .run();

  return json(request, env, {
    draftId,
    draft,
    approvalRequired: true,
    phase2Behavior: "draft_only",
  });
}

async function getWebsiteDraft(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const draftId = url.searchParams.get("id");

  if (!draftId) {
    return json(request, env, { error: "id is required" }, { status: 400 });
  }

  const result = await env.KAI_DB.prepare(
    "SELECT id, app, session_id, user_id, metadata_json, created_at FROM kai_audit_logs WHERE id = ? AND action = ? AND allowed = 1",
  )
    .bind(draftId, "generate_website_draft")
    .first<{
      id: string;
      app: string;
      session_id: string | null;
      user_id: string | null;
      metadata_json: string | null;
      created_at: string;
    }>();

  if (!result?.metadata_json) {
    return json(request, env, { error: "Website draft was not found." }, { status: 404 });
  }

  const metadata = JSON.parse(result.metadata_json) as { draft?: unknown };

  return json(request, env, {
    draftId: result.id,
    app: result.app,
    sessionId: result.session_id,
    userId: result.user_id,
    draft: metadata.draft,
    createdAt: result.created_at,
    approvalRequired: true,
    phase2Behavior: "draft_only",
  });
}

function createEmbedScript(origin: string): string {
  return `
(function () {
  if (window.__kaiWidgetLoaded) return;
  window.__kaiWidgetLoaded = true;

  var apiBase = document.currentScript && document.currentScript.dataset.apiBase || "${origin}";
  var app = document.currentScript && document.currentScript.dataset.app || "viliniu";
  var language = localStorage.getItem("kai.language") || document.currentScript && document.currentScript.dataset.language || "en";
  var userRole = document.currentScript && document.currentScript.dataset.userRole || "visitor";
  var sessionId = null;
  var guideStepIndex = 0;
  var guideAnswers = {};

  var greetings = {
    en: "Hi, I'm Kai. I can help you set up your business profile, build your Viliniu website, add products or services, and guide you through the platform.",
    es: "Hola, soy Kai. Puedo ayudarte a configurar tu perfil de negocio, crear tu sitio de Viliniu, agregar productos o servicios y guiarte por la plataforma.",
    fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo vakarautaka na nomu itukutuku ni bisinisi, tara na nomu website ni Viliniu, kuria na iyaya se veiqaravi, ka dusimaki iko ena platform."
  };

  var guideSteps = [
    {
      id: "businessName",
      label: "Step 1 of 7",
      title: "What is your business called?",
      helper: "I will use this for the website headline, SEO title, and business profile.",
      input: "text",
      placeholder: "Bula Fresh",
      sample: "Bula Fresh"
    },
    {
      id: "businessType",
      label: "Step 2 of 7",
      title: "What type of business is it?",
      helper: "Choose one, or type your own.",
      input: "choice-text",
      placeholder: "Farm produce vendor",
      choices: ["Farm produce vendor", "Restaurant", "Service provider", "Retail shop"],
      sample: "farm produce vendor"
    },
    {
      id: "offerings",
      label: "Step 3 of 7",
      title: "What do you sell or offer?",
      helper: "List products or services. A few words is enough.",
      input: "textarea",
      placeholder: "Fresh vegetables, herbs, weekly produce boxes",
      sample: "Fresh vegetables, herbs, weekly produce boxes"
    },
    {
      id: "location",
      label: "Step 4 of 7",
      title: "Where do you serve customers?",
      helper: "This helps Kai shape local SEO and contact sections.",
      input: "text",
      placeholder: "Suva and nearby communities",
      sample: "Suva and nearby communities"
    },
    {
      id: "contactInfo",
      label: "Step 5 of 7",
      title: "How should customers contact you?",
      helper: "Use phone, email, WhatsApp, or address.",
      input: "text",
      placeholder: "hello@example.com",
      sample: "hello@example.com"
    },
    {
      id: "brand",
      label: "Step 6 of 7",
      title: "What style should the website feel like?",
      helper: "Choose a direction, or type colors.",
      input: "choice-text",
      placeholder: "Green, warm, fresh",
      choices: ["Green and fresh", "Clean and modern", "Warm and local", "Premium and simple"],
      sample: "green, warm, fresh"
    },
    {
      id: "preferredCustomerAction",
      label: "Step 7 of 7",
      title: "What should customers do first?",
      helper: "This becomes the main call-to-action.",
      input: "choice-text",
      placeholder: "Order Now",
      choices: ["Order Now", "Call Us", "WhatsApp Us", "Request Quote"],
      sample: "Order Now"
    }
  ];

  var style = document.createElement("style");
  style.textContent = ".kai-embed{position:fixed;right:16px;bottom:16px;z-index:9999;font-family:Inter,system-ui,sans-serif;color:#0f172a}.kai-embed button,.kai-embed input,.kai-embed select,.kai-embed textarea{font:inherit}.kai-embed-launch{display:flex;align-items:center;gap:10px;border:0;border-radius:999px;background:#0f766e;color:#fff;font-weight:800;box-shadow:0 16px 40px rgba(15,23,42,.28);cursor:pointer;padding:10px 14px 10px 10px}.kai-embed-face{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:999px;background:#ccfbf1;color:#0f766e;font-weight:900}.kai-embed-panel{display:none;width:min(760px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));overflow:hidden;flex-direction:column;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;box-shadow:0 24px 80px rgba(15,23,42,.3)}.kai-embed[data-open=true] .kai-embed-panel{display:flex}.kai-embed[data-open=true] .kai-embed-launch{display:none}.kai-embed-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#fff}.kai-embed-title{display:flex;align-items:center;gap:10px}.kai-embed-head h2,.kai-embed-head p{margin:0}.kai-embed-head h2{font-size:16px;line-height:20px}.kai-embed-head p{font-size:12px;line-height:18px;color:#64748b}.kai-embed-actions{display:flex;align-items:center;gap:8px}.kai-embed-actions select,.kai-embed-actions button{height:34px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155}.kai-embed-actions select{max-width:132px;padding:0 8px}.kai-embed-actions button{min-width:34px;cursor:pointer}.kai-embed-voice{opacity:.55}.kai-embed-body{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(260px,.95fr);gap:12px;min-height:0;flex:1;padding:12px}.kai-guide{display:flex;min-width:0;min-height:0;flex-direction:column;gap:12px}.kai-card,.kai-preview-card,.kai-chat-box{border:1px solid #e2e8f0;border-radius:10px;background:#fff}.kai-card{padding:16px}.kai-pa-row{display:flex;align-items:flex-start;gap:12px}.kai-pa-avatar{display:flex;align-items:center;justify-content:center;width:52px;height:52px;flex:0 0 auto;border-radius:16px;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;font-size:22px;font-weight:900;box-shadow:0 12px 24px rgba(15,118,110,.2)}.kai-step-label{margin:0 0 6px;color:#0f766e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.kai-step-title{margin:0;color:#0f172a;font-size:22px;line-height:28px}.kai-step-helper{margin:8px 0 0;color:#475569;font-size:14px;line-height:21px}.kai-progress{height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden}.kai-progress span{display:block;height:100%;border-radius:999px;background:#0f766e;transition:width .2s ease}.kai-answer{display:grid;gap:10px}.kai-answer input,.kai-answer textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;padding:10px}.kai-answer textarea{min-height:86px;resize:vertical}.kai-answer input:focus,.kai-answer textarea:focus{border-color:#0f766e;outline:none;box-shadow:0 0 0 3px rgba(15,118,110,.12)}.kai-choice-row,.kai-nav-row,.kai-preview-actions{display:flex;flex-wrap:wrap;gap:8px}.kai-choice{border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#334155;padding:8px 10px;font-size:13px;cursor:pointer}.kai-primary,.kai-secondary{border-radius:8px;padding:10px 12px;font-size:14px;font-weight:750;cursor:pointer}.kai-primary{border:0;background:#0f766e;color:#fff}.kai-secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}.kai-primary:disabled{cursor:not-allowed;background:#cbd5e1;color:#64748b}.kai-preview-card{display:flex;min-width:0;min-height:0;flex-direction:column;overflow:hidden}.kai-preview-head{padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#fff}.kai-preview-head h3,.kai-preview-head p{margin:0}.kai-preview-head h3{font-size:15px}.kai-preview-head p{margin-top:4px;color:#64748b;font-size:12px}.kai-preview-content{display:grid;gap:10px;overflow:auto;padding:14px}.kai-preview-empty{display:flex;min-height:220px;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:14px;line-height:22px}.kai-site-card{border:1px solid #dbeafe;border-radius:10px;background:#f8fafc;overflow:hidden}.kai-site-hero{padding:18px;background:#0f766e;color:#fff}.kai-site-hero h4{margin:0;font-size:24px;line-height:30px}.kai-site-hero p{margin:8px 0 0;color:#ccfbf1}.kai-site-section{padding:14px;border-top:1px solid #e2e8f0}.kai-site-section strong{display:block;margin-bottom:6px;color:#0f172a}.kai-site-section p,.kai-site-section ul{margin:0;color:#334155;font-size:13px;line-height:20px}.kai-chat-box{max-height:210px;overflow:hidden}.kai-chat-toggle{display:block;padding:10px 12px;cursor:pointer;color:#334155;font-size:13px;font-weight:750}.kai-embed-messages{display:flex;max-height:110px;min-height:80px;flex-direction:column;gap:8px;overflow-y:auto;padding:10px;background:#f8fafc}.kai-embed-msg{max-width:90%;border-radius:8px;padding:9px 10px;font-size:13px;line-height:18px;white-space:pre-wrap}.kai-embed-assistant{margin-right:auto;border:1px solid #e2e8f0;background:#fff;color:#334155}.kai-embed-user{margin-left:auto;background:#0f766e;color:#fff}.kai-embed-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid #e2e8f0;padding:10px;background:#fff}.kai-embed-form input,.kai-embed-form button{min-height:36px;border-radius:7px}.kai-embed-form input{min-width:0;border:1px solid #cbd5e1;padding:0 9px;color:#0f172a}.kai-embed-form button{border:0;padding:0 12px;background:#0f766e;color:#fff;cursor:pointer;font-weight:700}@media(max-width:720px){.kai-embed{right:12px;bottom:12px}.kai-embed-panel{width:calc(100vw - 24px);height:min(720px,calc(100vh - 24px))}.kai-embed-body{grid-template-columns:1fr;overflow:auto}.kai-preview-card{min-height:260px}.kai-step-title{font-size:20px;line-height:26px}}";
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "kai-embed";
  root.innerHTML = '<button class="kai-embed-launch" type="button" aria-label="Open Kai"><span class="kai-embed-face">K</span><span>Start with Kai</span></button><section class="kai-embed-panel" aria-label="Kai AI coach"><header class="kai-embed-head"><div class="kai-embed-title"><span class="kai-embed-face">K</span><div><h2>Kai</h2><p>Personal setup assistant</p></div></div><div class="kai-embed-actions"><select aria-label="Kai language"><option value="en">English</option><option value="es">Espanol</option><option value="fj">Vosa Vakaviti</option></select><button class="kai-embed-voice" type="button" aria-label="Voice coming soon" title="Voice coming soon" disabled>Mic</button><button type="button" aria-label="Minimize Kai">-</button></div></header><div class="kai-embed-body"><div class="kai-guide"><div class="kai-card"><div class="kai-pa-row"><div class="kai-pa-avatar">K</div><div><p class="kai-step-label"></p><h3 class="kai-step-title"></h3><p class="kai-step-helper"></p></div></div></div><div class="kai-progress" aria-label="Website setup progress"><span></span></div><div class="kai-answer"></div><details class="kai-chat-box"><summary class="kai-chat-toggle">Ask Kai a side question</summary><div class="kai-embed-messages" aria-live="polite"></div><form class="kai-embed-form"><input aria-label="Message Kai" placeholder="Ask Kai for guidance..." /><button type="submit">Send</button></form></details></div><aside class="kai-preview-card"><div class="kai-preview-head"><h3>Website preview</h3><p>Kai builds this as you answer.</p></div><div class="kai-preview-content"><div class="kai-preview-empty">Your draft website will appear here. Use the sample to see the flow fast.</div></div></aside></div></section>';
  document.body.appendChild(root);

  var launcher = root.querySelector(".kai-embed-launch");
  var close = root.querySelector("[aria-label='Minimize Kai']");
  var select = root.querySelector("select");
  var messages = root.querySelector(".kai-embed-messages");
  var form = root.querySelector("form");
  var input = root.querySelector("input");
  var submit = root.querySelector(".kai-embed-form button");
  var stepLabel = root.querySelector(".kai-step-label");
  var stepTitle = root.querySelector(".kai-step-title");
  var stepHelper = root.querySelector(".kai-step-helper");
  var progressBar = root.querySelector(".kai-progress span");
  var answerArea = root.querySelector(".kai-answer");
  var previewContent = root.querySelector(".kai-preview-content");

  function pagePayload() {
    return { path: window.location.pathname, url: window.location.href, title: document.title };
  }

  function addMessage(role, text) {
    var node = document.createElement("div");
    node.className = "kai-embed-msg kai-embed-" + role;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  function addAssistantHtml(html) {
    var node = document.createElement("div");
    node.className = "kai-embed-msg kai-embed-assistant";
    node.innerHTML = html;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  function splitList(value) {
    return (value || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function getVendorSignupUrl(draftId) {
    var base = app === "viliniu" ? "https://vendor.viliniu.com/register" : "/register";
    return draftId ? base + "?kaiDraftId=" + encodeURIComponent(draftId) : base;
  }

  function valueFor(stepId) {
    return guideAnswers[stepId] || "";
  }

  function currentOfferingsList() {
    return splitList(valueFor("offerings"));
  }

  function getDraftAnswers() {
    return {
      businessName: valueFor("businessName"),
      businessType: valueFor("businessType"),
      products: currentOfferingsList(),
      services: currentOfferingsList(),
      location: valueFor("location"),
      serviceArea: valueFor("location"),
      contactInfo: valueFor("contactInfo"),
      preferredBrandingColors: splitList(valueFor("brand")),
      businessStory: valueFor("businessStory"),
      preferredCustomerAction: valueFor("preferredCustomerAction") || "Request Quote",
      hasLogo: false
    };
  }

  function renderInlinePreview() {
    var name = valueFor("businessName") || "Your Business";
    var type = valueFor("businessType") || "local business";
    var offerings = currentOfferingsList();
    previewContent.innerHTML = "";
    var card = document.createElement("div");
    card.className = "kai-site-card";
    var hero = document.createElement("div");
    hero.className = "kai-site-hero";
    var heroTitle = document.createElement("h4");
    heroTitle.textContent = name;
    var heroText = document.createElement("p");
    heroText.textContent = name + " helps customers find trusted " + type + " offerings.";
    hero.appendChild(heroTitle);
    hero.appendChild(heroText);
    card.appendChild(hero);
    var about = document.createElement("div");
    about.className = "kai-site-section";
    about.innerHTML = "<strong>About</strong>";
    var aboutText = document.createElement("p");
    aboutText.textContent = valueFor("businessStory") || name + " is a " + type + " serving " + (valueFor("location") || "the local community") + ".";
    about.appendChild(aboutText);
    card.appendChild(about);
    if (offerings.length) {
      var section = document.createElement("div");
      section.className = "kai-site-section";
      section.innerHTML = "<strong>Products and services</strong>";
      var list = document.createElement("ul");
      offerings.forEach(function (item) {
        var li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      section.appendChild(list);
      card.appendChild(section);
    }
    var contact = document.createElement("div");
    contact.className = "kai-site-section";
    contact.innerHTML = "<strong>Contact</strong>";
    var contactText = document.createElement("p");
    contactText.textContent = valueFor("contactInfo") || "Add phone, email, WhatsApp, or address.";
    contact.appendChild(contactText);
    card.appendChild(contact);
    previewContent.appendChild(card);
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "es" || nextLanguage === "fj" ? nextLanguage : "en";
    localStorage.setItem("kai.language", language);
    select.value = language;
    addMessage("assistant", greetings[language]);
  }

  function renderGuideStep() {
    var step = guideSteps[guideStepIndex];
    stepLabel.textContent = step.label;
    stepTitle.textContent = step.title;
    stepHelper.textContent = step.helper;
    progressBar.style.width = Math.round((guideStepIndex / guideSteps.length) * 100) + "%";
    answerArea.innerHTML = "";

    if (step.choices) {
      var choiceRow = document.createElement("div");
      choiceRow.className = "kai-choice-row";
      step.choices.forEach(function (choice) {
        var choiceButton = document.createElement("button");
        choiceButton.type = "button";
        choiceButton.className = "kai-choice";
        choiceButton.textContent = choice;
        choiceButton.addEventListener("click", function () {
          inputNode.value = choice;
        });
        choiceRow.appendChild(choiceButton);
      });
      answerArea.appendChild(choiceRow);
    }

    var inputNode = step.input === "textarea" ? document.createElement("textarea") : document.createElement("input");
    inputNode.placeholder = step.placeholder;
    inputNode.value = valueFor(step.id);
    inputNode.setAttribute("aria-label", step.title);
    answerArea.appendChild(inputNode);

    var nav = document.createElement("div");
    nav.className = "kai-nav-row";
    var next = document.createElement("button");
    next.type = "button";
    next.className = "kai-primary";
    next.textContent = guideStepIndex === guideSteps.length - 1 ? "Generate website preview" : "Next";
    next.addEventListener("click", function () {
      var value = inputNode.value.trim();
      if (!value) {
        inputNode.focus();
        return;
      }
      guideAnswers[step.id] = value;
      renderInlinePreview();
      if (guideStepIndex === guideSteps.length - 1) {
        void generateGuidedDraft(next);
        return;
      }
      guideStepIndex += 1;
      renderGuideStep();
    });
    nav.appendChild(next);

    if (guideStepIndex > 0) {
      var back = document.createElement("button");
      back.type = "button";
      back.className = "kai-secondary";
      back.textContent = "Back";
      back.addEventListener("click", function () {
        guideAnswers[step.id] = inputNode.value.trim();
        guideStepIndex -= 1;
        renderGuideStep();
      });
      nav.appendChild(back);
    }

    var sample = document.createElement("button");
    sample.type = "button";
    sample.className = "kai-secondary";
    sample.textContent = "Use sample";
    sample.addEventListener("click", function () {
      guideSteps.forEach(function (item) {
        guideAnswers[item.id] = item.sample;
      });
      renderInlinePreview();
      void generateGuidedDraft(sample);
    });
    nav.appendChild(sample);

    answerArea.appendChild(nav);
  }

  function renderFinalDraft(draft, draftId) {
    previewContent.innerHTML = "";
    var card = document.createElement("div");
    card.className = "kai-site-card";
    var hero = document.createElement("div");
    hero.className = "kai-site-hero";
    var title = document.createElement("h4");
    title.textContent = draft.businessName;
    var tagline = document.createElement("p");
    tagline.textContent = draft.tagline;
    hero.appendChild(title);
    hero.appendChild(tagline);
    card.appendChild(hero);

    [
      ["About", draft.about],
      ["Products", draft.products && draft.products.join(", ")],
      ["Services", draft.services && draft.services.join(", ")],
      ["Contact", draft.contactInfo],
      ["Main action", draft.ctaStyle],
      ["SEO title", draft.seo && draft.seo.title],
      ["SEO description", draft.seo && draft.seo.description],
      ["Logo idea", draft.logoPrompt]
    ].forEach(function (row) {
      if (!row[1]) return;
      var section = document.createElement("div");
      section.className = "kai-site-section";
      var label = document.createElement("strong");
      label.textContent = row[0];
      var value = document.createElement("p");
      value.textContent = row[1];
      section.appendChild(label);
      section.appendChild(value);
      card.appendChild(section);
    });

    var actions = document.createElement("div");
    actions.className = "kai-site-section kai-preview-actions";
    var signup = document.createElement("button");
    signup.type = "button";
    signup.className = "kai-primary";
    signup.textContent = "Create account to save";
    signup.addEventListener("click", function () {
      window.location.href = getVendorSignupUrl(draftId);
    });
    var revise = document.createElement("button");
    revise.type = "button";
    revise.className = "kai-secondary";
    revise.textContent = "Revise with Kai";
    revise.addEventListener("click", function () {
      guideStepIndex = 0;
      renderGuideStep();
    });
    actions.appendChild(signup);
    actions.appendChild(revise);
    card.appendChild(actions);
    previewContent.appendChild(card);

    stepLabel.textContent = "Draft ready";
    stepTitle.textContent = "Your website preview is ready.";
    stepHelper.textContent = "Create a vendor account to save it. Approval is only needed before public launch, orders, and payments.";
    progressBar.style.width = "100%";
    answerArea.innerHTML = "";
    var nextActions = document.createElement("div");
    nextActions.className = "kai-nav-row";
    nextActions.appendChild(signup.cloneNode(true));
    nextActions.firstChild.addEventListener("click", function () {
      window.location.href = getVendorSignupUrl(draftId);
    });
    answerArea.appendChild(nextActions);
  }

  async function generateGuidedDraft(button) {
    button.disabled = true;
    button.textContent = "Building preview...";
    try {
      var currentSession = await ensureSession();
      var response = await fetch(apiBase.replace(/\\/$/, "") + "/api/kai/website-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: app, sessionId: currentSession, userRole: userRole, answers: getDraftAnswers() })
      });
      var data = await response.json();
      if (data.draft) {
        try { sessionStorage.setItem("kai.lastWebsiteDraft", JSON.stringify({ draftId: data.draftId, draft: data.draft })); } catch (error) {}
        renderFinalDraft(data.draft, data.draftId);
      } else {
        stepHelper.textContent = data.error || "Kai could not create the website preview yet.";
      }
    } catch (error) {
      stepHelper.textContent = "Kai could not create the website preview right now.";
    } finally {
      button.disabled = false;
      button.textContent = "Generate website preview";
    }
  }

  async function ensureSession() {
    if (sessionId) return sessionId;
    var response = await fetch(apiBase.replace(/\\/$/, "") + "/api/kai/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ app: app, userRole: userRole, language: language }, pagePayload()))
    });
    var data = await response.json();
    sessionId = data.sessionId;
    return sessionId;
  }

  launcher.addEventListener("click", function () { root.dataset.open = "true"; });
  close.addEventListener("click", function () { root.dataset.open = "false"; });
  select.addEventListener("change", function (event) { setLanguage(event.target.value); });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    submit.disabled = true;
    addMessage("user", text);
    addMessage("assistant", "Kai is thinking...");
    var thinking = messages.lastChild;
    try {
      var currentSession = await ensureSession();
      var response = await fetch(apiBase.replace(/\\/$/, "") + "/api/kai/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ app: app, assistantName: "Kai", sessionId: currentSession, userRole: userRole, language: language, message: text }, pagePayload()))
      });
      var data = await response.json();
      thinking.textContent = data.content || data.error || "Kai could not answer that yet.";
    } catch (error) {
      thinking.textContent = "Kai is not available right now. Please try again soon.";
    } finally {
      submit.disabled = false;
    }
  });

  setLanguage(language);
  renderGuideStep();
  if (new URLSearchParams(window.location.search).get("kaiDraftId")) {
    addMessage("assistant", "This signup link includes a Kai website draft reference. Create your vendor account when you are ready, then keep building your store. Approval is only needed before public launch, orders, and payments.");
  }
})();`;
}

export default {
  async fetch(request: Request, env: KaiWorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") return json(request, env, { ok: true });

    if (env.AI_COACH_ENABLED === "false") {
      return json(request, env, { error: "KAI is disabled" }, { status: 403 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/kai/session" && request.method === "POST") {
      return createSession(request, env);
    }
    if (url.pathname === "/api/kai/message" && request.method === "POST") {
      return createMessage(request, env);
    }
    if (url.pathname === "/api/kai/workflows" && request.method === "GET") {
      return json(request, env, { workflows: kaiWorkflowRegistry });
    }
    if (url.pathname === "/api/kai/knowledge/sources" && request.method === "GET") {
      return listKnowledgeSources(request, url, env);
    }
    if (url.pathname === "/api/kai/preferences" && request.method === "POST") {
      return updatePreferences(request, env);
    }
    if (url.pathname === "/api/kai/context" && request.method === "GET") {
      return getContext(request, env);
    }
    if (url.pathname === "/api/kai/workflow-state" && request.method === "POST") {
      return updateWorkflowState(request, env);
    }
    if (url.pathname === "/api/kai/website-draft" && request.method === "POST") {
      return generateWebsiteDraft(request, env);
    }
    if (url.pathname === "/api/kai/website-draft" && request.method === "GET") {
      return getWebsiteDraft(request, env);
    }
    if ((url.pathname === "/embed/kai.js" || url.pathname === "/kai.js") && request.method === "GET") {
      return javascript(createEmbedScript(url.origin));
    }

    return json(request, env, { error: "Not found" }, { status: 404 });
  },
};
