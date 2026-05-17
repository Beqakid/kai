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

    return json({ error: "Not found" }, { status: 404 });
  },
};
