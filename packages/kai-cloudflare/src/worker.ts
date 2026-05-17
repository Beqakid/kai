import { MockKaiModelProvider, OpenAIKaiModelProvider, type KaiModelProvider } from "@kai/core";
import { getKaiGreeting, normalizeKaiLanguage } from "@kai/language";
import { kaiWorkflowRegistry } from "@kai/workflows";

export interface KaiWorkerEnv {
  KAI_DB: D1Database;
  OPENAI_API_KEY?: string;
  KAI_DEFAULT_LANGUAGE?: string;
  AI_COACH_ENABLED?: string;
  AI_COACH_MULTILINGUAL?: string;
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
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

async function createSession(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    app?: string;
    userId?: string;
    userRole?: string;
    language?: string;
  };
  const language = normalizeKaiLanguage(body.language ?? env.KAI_DEFAULT_LANGUAGE);
  const sessionId = createId("kai_session");

  await env.KAI_DB.prepare(
    "INSERT INTO kai_sessions (id, app, user_id, user_role, language, guidance_mode, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(sessionId, body.app ?? "viliniu", body.userId ?? null, body.userRole ?? null, language, "GUIDE_MODE", "{}")
    .run();

  return json({
    sessionId,
    language,
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
  };

  if (!body.sessionId || !body.message) {
    return json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const language = normalizeKaiLanguage(body.language ?? env.KAI_DEFAULT_LANGUAGE);
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
    language,
    message: body.message,
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
      JSON.stringify(response.knowledgeSourceIds ?? []),
    )
    .run();

  return json({ ...response, messageId: assistantMessageId });
}

async function updatePreferences(request: Request, env: KaiWorkerEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    app?: string;
    userId?: string;
    preferredLanguage?: string;
    preferences?: Record<string, unknown>;
  };

  if (!body.userId) {
    return json({ error: "userId is required" }, { status: 400 });
  }

  const id = createId("kai_pref");
  const language = normalizeKaiLanguage(body.preferredLanguage ?? env.KAI_DEFAULT_LANGUAGE);

  await env.KAI_DB.prepare(
    "INSERT INTO kai_user_preferences (id, app, user_id, preferred_language, preferences_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(app, user_id) DO UPDATE SET preferred_language = excluded.preferred_language, preferences_json = excluded.preferences_json, updated_at = CURRENT_TIMESTAMP",
  )
    .bind(id, body.app ?? "viliniu", body.userId, language, JSON.stringify(body.preferences ?? {}))
    .run();

  return json({ ok: true, preferredLanguage: language });
}

async function listKnowledgeSources(url: URL, env: KaiWorkerEnv): Promise<Response> {
  const app = url.searchParams.get("app") ?? "viliniu";
  const language = normalizeKaiLanguage(url.searchParams.get("language") ?? env.KAI_DEFAULT_LANGUAGE);
  const result = await env.KAI_DB.prepare(
    "SELECT id, app, language, title, path, summary, enabled FROM kai_knowledge_sources WHERE app = ? AND language = ? AND enabled = 1 ORDER BY title",
  )
    .bind(app, language)
    .all();

  return json({ sources: result.results ?? [] });
}

function createEmbedScript(origin: string): string {
  return `
(function () {
  if (window.__kaiWidgetLoaded) return;
  window.__kaiWidgetLoaded = true;

  var apiBase = document.currentScript && document.currentScript.dataset.apiBase || "${origin}";
  var app = document.currentScript && document.currentScript.dataset.app || "viliniu";
  var language = localStorage.getItem("kai.language") || document.currentScript && document.currentScript.dataset.language || "en";
  var sessionId = null;

  var greetings = {
    en: "Hi, I'm Kai. I can help you set up your business profile, build your Viliniu website, add products or services, and guide you through the platform.",
    es: "Hola, soy Kai. Puedo ayudarte a configurar tu perfil de negocio, crear tu sitio de Viliniu, agregar productos o servicios y guiarte por la plataforma.",
    fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo vakarautaka na nomu itukutuku ni bisinisi, tara na nomu website ni Viliniu, kuria na iyaya se veiqaravi, ka dusimaki iko ena platform."
  };

  var style = document.createElement("style");
  style.textContent = ".kai-embed{position:fixed;right:16px;bottom:16px;z-index:9999;font-family:Inter,system-ui,sans-serif;color:#0f172a}.kai-embed button,.kai-embed input,.kai-embed select{font:inherit}.kai-embed-launch{width:56px;height:56px;border:0;border-radius:999px;background:#0f766e;color:#fff;font-weight:700;box-shadow:0 16px 40px rgba(15,23,42,.28);cursor:pointer}.kai-embed-panel{display:none;width:min(420px,calc(100vw - 32px));height:min(640px,calc(100vh - 32px));overflow:hidden;flex-direction:column;border:1px solid #cbd5e1;border-radius:8px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.3)}.kai-embed[data-open=true] .kai-embed-panel{display:flex}.kai-embed[data-open=true] .kai-embed-launch{display:none}.kai-embed-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #e2e8f0}.kai-embed-head h2,.kai-embed-head p{margin:0}.kai-embed-head h2{font-size:15px;line-height:20px}.kai-embed-head p{font-size:12px;line-height:18px;color:#64748b}.kai-embed-actions{display:flex;align-items:center;gap:8px}.kai-embed-actions select,.kai-embed-actions button{height:32px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155}.kai-embed-actions select{max-width:132px;padding:0 8px}.kai-embed-actions button{min-width:32px;cursor:pointer}.kai-embed-messages{display:flex;min-height:0;flex:1;flex-direction:column;gap:10px;overflow-y:auto;padding:14px;background:#f8fafc}.kai-embed-msg{max-width:85%;border-radius:8px;padding:10px 12px;font-size:14px;line-height:20px;white-space:pre-wrap}.kai-embed-assistant{margin-right:auto;border:1px solid #e2e8f0;background:#fff;color:#334155}.kai-embed-user{margin-left:auto;background:#0f766e;color:#fff}.kai-embed-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid #e2e8f0;padding:12px;background:#fff}.kai-embed-form input,.kai-embed-form button{min-height:40px;border-radius:6px}.kai-embed-form input{min-width:0;border:1px solid #cbd5e1;padding:0 10px;color:#0f172a}.kai-embed-form input:focus{border-color:#0f766e;outline:none}.kai-embed-form button{border:0;padding:0 12px;background:#0f766e;color:#fff;cursor:pointer;font-weight:650}.kai-embed-form button:disabled{cursor:not-allowed;background:#cbd5e1;color:#64748b}@media(max-width:520px){.kai-embed{right:12px;bottom:12px}.kai-embed-panel{width:calc(100vw - 24px);height:min(620px,calc(100vh - 24px))}}";
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "kai-embed";
  root.innerHTML = '<button class="kai-embed-launch" type="button" aria-label="Open Kai">Kai</button><section class="kai-embed-panel" aria-label="Kai AI coach"><header class="kai-embed-head"><div><h2>Kai</h2><p>Guide mode</p></div><div class="kai-embed-actions"><select aria-label="Kai language"><option value="en">English</option><option value="es">Espanol</option><option value="fj">Vosa Vakaviti</option></select><button type="button" aria-label="Minimize Kai">-</button></div></header><div class="kai-embed-messages" aria-live="polite"></div><form class="kai-embed-form"><input aria-label="Message Kai" placeholder="Ask Kai for guidance..." /><button type="submit">Send</button></form></section>';
  document.body.appendChild(root);

  var launcher = root.querySelector(".kai-embed-launch");
  var close = root.querySelector(".kai-embed-actions button");
  var select = root.querySelector("select");
  var messages = root.querySelector(".kai-embed-messages");
  var form = root.querySelector("form");
  var input = root.querySelector("input");
  var submit = root.querySelector(".kai-embed-form button");

  function addMessage(role, text) {
    var node = document.createElement("div");
    node.className = "kai-embed-msg kai-embed-" + role;
    node.textContent = text;
    messages.appendChild(node);
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
      body: JSON.stringify({ app: app, userRole: "visitor", language: language })
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
        body: JSON.stringify({ app: app, assistantName: "Kai", sessionId: currentSession, userRole: "visitor", language: language, message: text })
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
})();`;
}

export default {
  async fetch(request: Request, env: KaiWorkerEnv): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });

    if (env.AI_COACH_ENABLED === "false") {
      return json({ error: "KAI is disabled" }, { status: 403 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/kai/session" && request.method === "POST") {
      return createSession(request, env);
    }
    if (url.pathname === "/api/kai/message" && request.method === "POST") {
      return createMessage(request, env);
    }
    if (url.pathname === "/api/kai/workflows" && request.method === "GET") {
      return json({ workflows: kaiWorkflowRegistry });
    }
    if (url.pathname === "/api/kai/knowledge/sources" && request.method === "GET") {
      return listKnowledgeSources(url, env);
    }
    if (url.pathname === "/api/kai/preferences" && request.method === "POST") {
      return updatePreferences(request, env);
    }
    if ((url.pathname === "/embed/kai.js" || url.pathname === "/kai.js") && request.method === "GET") {
      return javascript(createEmbedScript(url.origin));
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};
