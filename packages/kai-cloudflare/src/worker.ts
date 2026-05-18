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
      "Generated draft only. Approval is required before saving or publishing.",
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

  var greetings = {
    en: "Hi, I'm Kai. I can help you set up your business profile, build your Viliniu website, add products or services, and guide you through the platform.",
    es: "Hola, soy Kai. Puedo ayudarte a configurar tu perfil de negocio, crear tu sitio de Viliniu, agregar productos o servicios y guiarte por la plataforma.",
    fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo vakarautaka na nomu itukutuku ni bisinisi, tara na nomu website ni Viliniu, kuria na iyaya se veiqaravi, ka dusimaki iko ena platform."
  };

  var style = document.createElement("style");
  style.textContent = ".kai-embed{position:fixed;right:16px;bottom:16px;z-index:9999;font-family:Inter,system-ui,sans-serif;color:#0f172a}.kai-embed button,.kai-embed input,.kai-embed select,.kai-embed textarea{font:inherit}.kai-embed-launch{width:56px;height:56px;border:0;border-radius:999px;background:#0f766e;color:#fff;font-weight:700;box-shadow:0 16px 40px rgba(15,23,42,.28);cursor:pointer}.kai-embed-panel{display:none;width:min(420px,calc(100vw - 32px));height:min(640px,calc(100vh - 32px));overflow:hidden;flex-direction:column;border:1px solid #cbd5e1;border-radius:8px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.3)}.kai-embed[data-open=true] .kai-embed-panel{display:flex}.kai-embed[data-open=true] .kai-embed-launch{display:none}.kai-embed-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #e2e8f0}.kai-embed-head h2,.kai-embed-head p{margin:0}.kai-embed-head h2{font-size:15px;line-height:20px}.kai-embed-head p{font-size:12px;line-height:18px;color:#64748b}.kai-embed-actions{display:flex;align-items:center;gap:8px}.kai-embed-actions select,.kai-embed-actions button{height:32px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155}.kai-embed-actions select{max-width:132px;padding:0 8px}.kai-embed-actions button{min-width:32px;cursor:pointer}.kai-embed-quick{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid #e2e8f0;overflow-x:auto;background:#fff}.kai-embed-quick button{white-space:nowrap;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#334155;padding:6px 10px;font-size:12px;cursor:pointer}.kai-embed-messages{display:flex;min-height:0;flex:1;flex-direction:column;gap:10px;overflow-y:auto;padding:14px;background:#f8fafc}.kai-embed-msg{max-width:85%;border-radius:8px;padding:10px 12px;font-size:14px;line-height:20px;white-space:pre-wrap}.kai-embed-assistant{margin-right:auto;border:1px solid #e2e8f0;background:#fff;color:#334155}.kai-embed-user{margin-left:auto;background:#0f766e;color:#fff}.kai-embed-lead{display:grid;gap:8px;white-space:normal}.kai-embed-lead h3,.kai-embed-preview h3{margin:0;color:#0f172a;font-size:15px;line-height:20px}.kai-embed-lead p,.kai-embed-preview p{margin:0;color:#475569}.kai-embed-lead label{display:grid;gap:4px;color:#334155;font-size:12px;font-weight:650}.kai-embed-lead input,.kai-embed-lead textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:8px;color:#0f172a;background:#fff}.kai-embed-lead textarea{min-height:58px;resize:vertical}.kai-embed-lead input:focus,.kai-embed-lead textarea:focus{border-color:#0f766e;outline:none}.kai-embed-lead-actions,.kai-embed-preview-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}.kai-embed-primary,.kai-embed-secondary{border-radius:6px;padding:8px 10px;font-size:13px;font-weight:650;cursor:pointer}.kai-embed-primary{border:0;background:#0f766e;color:#fff}.kai-embed-secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}.kai-embed-primary:disabled{cursor:not-allowed;background:#cbd5e1;color:#64748b}.kai-embed-preview{display:grid;gap:8px;white-space:normal}.kai-embed-preview dl{display:grid;gap:6px;margin:0}.kai-embed-preview dt{font-size:12px;font-weight:700;color:#64748b}.kai-embed-preview dd{margin:0;color:#0f172a}.kai-embed-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid #e2e8f0;padding:12px;background:#fff}.kai-embed-form input,.kai-embed-form button{min-height:40px;border-radius:6px}.kai-embed-form input{min-width:0;border:1px solid #cbd5e1;padding:0 10px;color:#0f172a}.kai-embed-form input:focus{border-color:#0f766e;outline:none}.kai-embed-form button{border:0;padding:0 12px;background:#0f766e;color:#fff;cursor:pointer;font-weight:650}.kai-embed-form button:disabled{cursor:not-allowed;background:#cbd5e1;color:#64748b}@media(max-width:520px){.kai-embed{right:12px;bottom:12px}.kai-embed-panel{width:calc(100vw - 24px);height:min(620px,calc(100vh - 24px))}}";
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "kai-embed";
  root.innerHTML = '<button class="kai-embed-launch" type="button" aria-label="Open Kai">Kai</button><section class="kai-embed-panel" aria-label="Kai AI coach"><header class="kai-embed-head"><div><h2>Kai</h2><p>Guide mode</p></div><div class="kai-embed-actions"><select aria-label="Kai language"><option value="en">English</option><option value="es">Espanol</option><option value="fj">Vosa Vakaviti</option></select><button type="button" aria-label="Minimize Kai">-</button></div></header><div class="kai-embed-quick"><button type="button" data-kai-quick="explain">Explain this page</button><button type="button" data-kai-quick="workflows">Show workflows</button><button type="button" data-kai-quick="draft">Website preview</button></div><div class="kai-embed-messages" aria-live="polite"></div><form class="kai-embed-form"><input aria-label="Message Kai" placeholder="Ask Kai for guidance..." /><button type="submit">Send</button></form></section>';
  document.body.appendChild(root);

  var launcher = root.querySelector(".kai-embed-launch");
  var close = root.querySelector(".kai-embed-actions button");
  var select = root.querySelector("select");
  var messages = root.querySelector(".kai-embed-messages");
  var form = root.querySelector("form");
  var input = root.querySelector("input");
  var submit = root.querySelector(".kai-embed-form button");
  var quickButtons = root.querySelectorAll("[data-kai-quick]");

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

  function startWebsitePreviewLeadFlow() {
    addMessage("user", "Draft my business website before signup.");
    addAssistantHtml('<div class="kai-embed-lead" data-kai-lead-form><h3>Let us draft your website first.</h3><p>Answer a few basics. You can preview the draft, then create a vendor account only when you want to save or publish it.</p><label>Business name<input name="businessName" autocomplete="organization" placeholder="Bula Fresh"></label><label>Business type<input name="businessType" placeholder="Farm produce vendor"></label><label>Products or services<textarea name="offerings" placeholder="Fresh vegetables, herbs, weekly produce boxes"></textarea></label><label>Location or service area<input name="location" placeholder="Suva, Fiji"></label><label>Contact for customers<input name="contactInfo" placeholder="Phone, email, WhatsApp, or address"></label><label>Brand colors or style<input name="colors" placeholder="Green, warm, fresh"></label><label>Short business story<textarea name="businessStory" placeholder="What should customers know about your business?"></textarea></label><label>Preferred customer action<input name="preferredCustomerAction" placeholder="Order Now, Call Us, Request Quote"></label><div class="kai-embed-lead-actions"><button class="kai-embed-primary" type="button" data-kai-lead-submit>Generate preview</button><button class="kai-embed-secondary" type="button" data-kai-lead-sample>Show sample</button><button class="kai-embed-secondary" type="button" data-kai-lead-cancel>Maybe later</button></div></div>');
  }

  function field(formNode, name) {
    var item = formNode.querySelector("[name='" + name + "']");
    return item && item.value ? item.value.trim() : "";
  }

  function appendPreviewRow(list, label, value) {
    if (!value) return;
    var term = document.createElement("dt");
    var description = document.createElement("dd");
    term.textContent = label;
    description.textContent = Array.isArray(value) ? value.join(", ") : value;
    list.appendChild(term);
    list.appendChild(description);
  }

  function renderDraftPreview(container, draft, draftId) {
    container.innerHTML = "";
    var preview = document.createElement("div");
    preview.className = "kai-embed-preview";
    var title = document.createElement("h3");
    title.textContent = "Website preview for " + draft.businessName;
    var intro = document.createElement("p");
    intro.textContent = "Here is a draft you can save after creating a vendor account, then keep improving before approval.";
    var list = document.createElement("dl");
    appendPreviewRow(list, "Headline", draft.businessName);
    appendPreviewRow(list, "Tagline", draft.tagline);
    appendPreviewRow(list, "About", draft.about);
    appendPreviewRow(list, "Products", draft.products);
    appendPreviewRow(list, "Services", draft.services);
    appendPreviewRow(list, "CTA", draft.ctaStyle);
    appendPreviewRow(list, "SEO title", draft.seo && draft.seo.title);
    appendPreviewRow(list, "SEO description", draft.seo && draft.seo.description);
    appendPreviewRow(list, "Brand colors", draft.branding && draft.branding.suggestedColors);
    appendPreviewRow(list, "Logo idea", draft.logoPrompt);
    var note = document.createElement("p");
    note.textContent = "Kai will not publish anything automatically. Create a free Viliniu vendor account to save this draft, keep building, and request approval before going live.";
    var actions = document.createElement("div");
    actions.className = "kai-embed-preview-actions";
    var signup = document.createElement("button");
    signup.className = "kai-embed-primary";
    signup.type = "button";
    signup.setAttribute("data-kai-signup", "true");
    signup.setAttribute("data-kai-draft-id", draftId || "");
    signup.textContent = "Create account to save";
    var revise = document.createElement("button");
    revise.className = "kai-embed-secondary";
    revise.type = "button";
    revise.setAttribute("data-kai-revise-draft", "true");
    revise.textContent = "Revise draft";
    actions.appendChild(signup);
    actions.appendChild(revise);
    preview.appendChild(title);
    preview.appendChild(intro);
    preview.appendChild(list);
    preview.appendChild(note);
    preview.appendChild(actions);
    container.appendChild(preview);
    messages.scrollTop = messages.scrollHeight;
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "es" || nextLanguage === "fj" ? nextLanguage : "en";
    localStorage.setItem("kai.language", language);
    select.value = language;
    addMessage("assistant", greetings[language]);
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
  quickButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      var action = button.getAttribute("data-kai-quick");
      if (action === "draft") {
        startWebsitePreviewLeadFlow();
        return;
      }
      input.value = action === "workflows" ? "Show me the best Viliniu workflows for this page." : "Explain this Viliniu page and what I should do next.";
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  });
  messages.addEventListener("click", async function (event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    if (target.getAttribute("data-kai-lead-sample") !== null) {
      var sampleFormNode = target.closest("[data-kai-lead-form]");
      if (!sampleFormNode) return;
      target.disabled = true;
      target.textContent = "Generating...";
      try {
        var sampleSession = await ensureSession();
        var sampleResponse = await fetch(apiBase.replace(/\\/$/, "") + "/api/kai/website-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: app, sessionId: sampleSession, userRole: userRole, answers: { businessName: "Bula Fresh", businessType: "farm produce vendor", products: ["Fresh vegetables", "Herbs", "Weekly produce boxes"], services: ["Weekly produce box delivery"], location: "Suva, Fiji", serviceArea: "Suva and nearby communities", contactInfo: "hello@example.com", preferredBrandingColors: ["green", "warm", "fresh"], businessStory: "Family-run local produce with weekly boxes for busy households.", preferredCustomerAction: "Order Now", hasLogo: false } })
        });
        var sampleData = await sampleResponse.json();
        if (sampleData.draft) {
          try { sessionStorage.setItem("kai.lastWebsiteDraft", JSON.stringify({ draftId: sampleData.draftId, draft: sampleData.draft })); } catch (error) {}
          renderDraftPreview(sampleFormNode, sampleData.draft, sampleData.draftId);
        } else {
          addMessage("assistant", sampleData.error || "Kai could not create the sample preview yet.");
        }
      } catch (error) {
        addMessage("assistant", "Kai could not create the sample preview right now.");
      } finally {
        target.disabled = false;
        target.textContent = "Show sample";
      }
      return;
    }
    if (target.getAttribute("data-kai-lead-cancel") !== null) {
      addMessage("assistant", "No problem. I can draft the website whenever the business is ready.");
      return;
    }
    if (target.getAttribute("data-kai-revise-draft") !== null) {
      startWebsitePreviewLeadFlow();
      return;
    }
    if (target.getAttribute("data-kai-signup") !== null) {
      window.location.href = getVendorSignupUrl(target.getAttribute("data-kai-draft-id"));
      return;
    }
    if (target.getAttribute("data-kai-lead-submit") === null) return;
    var formNode = target.closest("[data-kai-lead-form]");
    if (!formNode) return;
    var businessName = field(formNode, "businessName");
    if (!businessName) {
      addMessage("assistant", "Add a business name first so I can create a useful draft.");
      return;
    }
    target.disabled = true;
    target.textContent = "Generating...";
    var answers = {
      businessName: businessName,
      businessType: field(formNode, "businessType") || "local business",
      products: splitList(field(formNode, "offerings")),
      services: splitList(field(formNode, "offerings")),
      location: field(formNode, "location"),
      serviceArea: field(formNode, "location"),
      contactInfo: field(formNode, "contactInfo"),
      preferredBrandingColors: splitList(field(formNode, "colors")),
      businessStory: field(formNode, "businessStory"),
      preferredCustomerAction: field(formNode, "preferredCustomerAction") || "Request Quote",
      hasLogo: false
    };
    try {
      var currentSession = await ensureSession();
      var response = await fetch(apiBase.replace(/\\/$/, "") + "/api/kai/website-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: app, sessionId: currentSession, userRole: userRole, answers: answers })
      });
      var data = await response.json();
      if (data.draft) {
        try { sessionStorage.setItem("kai.lastWebsiteDraft", JSON.stringify({ draftId: data.draftId, draft: data.draft })); } catch (error) {}
        renderDraftPreview(formNode, data.draft, data.draftId);
      } else {
        addMessage("assistant", data.error || "Kai could not create the website preview yet.");
      }
    } catch (error) {
      addMessage("assistant", "Kai could not create the website preview right now.");
    } finally {
      target.disabled = false;
      target.textContent = "Generate preview";
    }
  });
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
