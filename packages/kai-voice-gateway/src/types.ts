// ── Kai Voice Gateway — Shared Types ──

/** Supported app IDs that Kai can serve */
export const VALID_APP_IDS = [
  'jon-command-center',
  'carehia',
  'viliniu',
  'volau',
] as const;
export type AppId = (typeof VALID_APP_IDS)[number];

/** Supported user roles */
export const VALID_ROLES = [
  'super-admin',
  'admin',
  'vendor',
  'customer',
  'viewer',
] as const;
export type UserRole = (typeof VALID_ROLES)[number];

/** Roles allowed to view admin voice history */
export const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(['super-admin']);

/** Provider names */
export type STTProviderName = 'mock' | 'cloudflare-ai' | 'whisper' | 'deepgram';
export type TTSProviderName = 'mock' | 'cloudflare-ai' | 'openai-tts' | 'elevenlabs';
export type KaiProviderName = 'mock' | 'kai-core';

/** TTS voice configuration */
export interface TTSVoiceConfig {
  voiceName: string;
  language: string;
  speed?: number; // 0.5–2.0, default 1.0
}

/** Risk levels for Kai responses */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'blocked';

// ── Security Limits ──

/** Maximum audio file size in bytes (10 MB) */
export const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum audio duration in seconds (120s = 2 min) */
export const MAX_AUDIO_DURATION_SECONDS = 120;

/** Maximum request body size for JSON endpoints (1 MB) */
export const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024;

/** Rate limit: max requests per user per minute */
export const RATE_LIMIT_PER_MINUTE = 30;

/** Rate limit window in milliseconds */
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ── Allowed Actions Registry (server-side truth) ──
// Only these actions can be requested per app+role combo.

export const ALLOWED_ACTIONS_REGISTRY: Record<AppId, Record<UserRole, readonly string[]>> = {
  'jon-command-center': {
    'super-admin': ['view', 'edit', 'manage-users', 'manage-vendors', 'view-analytics', 'manage-settings',
      'read_project_status', 'summarize_blockers', 'generate_tasklet_prompt', 'explain_phase_status',
      'list_tasks', 'create_task', 'prioritize_tasks', 'execute_task_action', 'help_me_out', 'orchestrator_next'],
    admin: ['view', 'edit', 'manage-users', 'view-analytics',
      'read_project_status', 'summarize_blockers', 'explain_phase_status'],
    vendor: ['view'],
    customer: ['view'],
    viewer: ['view'],
  },
  carehia: {
    'super-admin': ['view', 'edit', 'manage-users', 'manage-clients', 'manage-schedules', 'view-analytics', 'manage-settings'],
    admin: ['view', 'edit', 'manage-clients', 'manage-schedules', 'view-analytics'],
    vendor: ['view', 'edit', 'manage-schedules'],
    customer: ['view', 'view-schedules'],
    viewer: ['view'],
  },
  viliniu: {
    'super-admin': ['view', 'edit', 'manage-users', 'manage-vendors', 'manage-products', 'manage-orders', 'view-analytics', 'manage-settings'],
    admin: ['view', 'edit', 'manage-vendors', 'manage-products', 'manage-orders', 'view-analytics'],
    vendor: ['view', 'edit', 'manage-products', 'view-orders'],
    customer: ['view', 'browse-products', 'place-orders'],
    viewer: ['view'],
  },
  volau: {
    'super-admin': ['view', 'edit', 'manage-users', 'view-analytics', 'manage-settings'],
    admin: ['view', 'edit', 'manage-users', 'view-analytics'],
    vendor: ['view', 'edit'],
    customer: ['view'],
    viewer: ['view'],
  },
};

// ── D1 Database binding type ──

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/** Environment bindings for the Cloudflare Worker */
export interface Env {
  KAI_STT_PROVIDER: STTProviderName;
  KAI_TTS_PROVIDER: TTSProviderName;
  KAI_CORE_PROVIDER: KaiProviderName;
  ENABLE_KAI_AUDIO_STORAGE: string; // "true" | "false"
  KAI_AUTH_SECRET: string;
  // TTS config
  KAI_TTS_VOICE?: string;
  KAI_TTS_LANGUAGE?: string;
  KAI_TTS_SPEED?: string;
  // Provider API keys (set via wrangler secret)
  OPENAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  // Cloudflare Workers AI binding
  AI?: Ai;
  // D1 Database binding
  KAI_DB?: D1Database;
  // Future: R2 for audio storage
  // KAI_AUDIO_BUCKET?: R2Bucket;
}

/** Cloudflare Workers AI binding type */
export interface Ai {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Authenticated user context extracted from token */
export interface AuthContext {
  userId: string;
  appId: AppId;
  userRole: UserRole;
}

/** Voice session request body */
export interface SessionRequest {
  appId: string;
  userId: string;
  userRole: string;
  currentScreen: string;
  allowedActions: string[];
}

/** Voice session response */
export interface SessionResponse {
  sessionId: string;
  appId: AppId;
  userId: string;
  userRole: UserRole;
  currentScreen: string;
  allowedActions: string[];
  createdAt: string;
  expiresAt: string;
  providers: {
    stt: STTProviderName;
    tts: TTSProviderName;
    kai: KaiProviderName;
  };
}

/** Transcribe request — multipart form with audio + metadata */
export interface TranscribeRequest {
  sessionId: string;
  appId: string;
  userId: string;
  userRole: string;
  currentScreen: string;
  allowedActions: string[];
  audio: Blob | File;
}

/** Transcribe response */
export interface TranscribeResponse {
  sessionId: string;
  transcript: string;
  confidence: number;
  language: string;
  durationMs: number;
  provider: STTProviderName;
}

/** Respond request */
export interface RespondRequest {
  sessionId: string;
  appId: string;
  userId: string;
  userRole: string;
  currentScreen: string;
  allowedActions: string[];
  transcript: string;
}

/** Kai Core response structure */
export interface KaiCoreResponse {
  responseText: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  actions: string[];
}

/** Respond response */
export interface RespondResponse {
  sessionId: string;
  response: string;
  responseText: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  actions: string[];
  provider: KaiProviderName;
  ttsAudioUrl: string | null;
  ttsAudioBase64: string | null;
  ttsAudioFormat: string | null;
  ttsProvider: TTSProviderName;
}

/** History entry (for admin voice history) */
export interface HistoryEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  appId: string;
  userId: string;
  userRole: string;
  transcript: string;
  response: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  sttProvider: string;
  ttsProvider: string;
  errorMessage: string | null;
}

/** History response */
export interface HistoryResponse {
  entries: HistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** Standard error response */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: string;
}
