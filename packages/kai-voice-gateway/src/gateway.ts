// ── KaiVoiceGateway — Core Service ──
//
// Phase 2: Real JWT auth — identity comes from verified token, not body.
// Phase 3: Receipt logging via ActionReceiptLogger.
// All routes require auth. allowedActions validated server-side.
// Raw audio is never stored (unless ENABLE_KAI_AUDIO_STORAGE=true, future R2).

import {
  Env,
  SessionResponse,
  TranscribeResponse,
  RespondResponse,
  HistoryResponse,
  UserRole,
} from './types';
import { Errors } from './errors';
import {
  authenticateAndRateLimit,
  validateVoiceRequest,
  requireAdmin,
  AuthResult,
} from './auth';
import { getSTTProvider } from './providers/stt';
import { getKaiProvider } from './providers/kai';
import { getTTSProvider, getVoiceConfig } from './providers/tts';
import { VoiceLogger } from './services/voice-logger';
import {
  validateAudioSize,
  validateAudioDuration,
  validateJsonBodySize,
} from './services/security';

/** Generate a unique session/entry ID */
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * KaiVoiceGateway — orchestrates voice sessions, transcription,
 * Kai responses, and TTS. Provider-agnostic via the abstraction layer.
 * All routes enforce auth, rate limiting, and server-side validation.
 */
export class KaiVoiceGateway {
  private readonly logger: VoiceLogger;

  constructor(private readonly env: Env) {
    this.logger = new VoiceLogger(env.KAI_DB);
  }

  // ── POST /api/kai/voice/session ──
  async createSession(request: Request): Promise<Response> {
    const auth = await authenticateAndRateLimit(request, this.env);
    validateJsonBodySize(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw Errors.gatewayFailure('Invalid JSON in request body.');
    }

    const validated = validateVoiceRequest(body, auth);

    const sessionId = generateId('vses');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min

    const response: SessionResponse = {
      sessionId,
      appId: validated.appId,
      userId: validated.userId,
      userRole: validated.userRole,
      currentScreen: validated.currentScreen,
      allowedActions: validated.allowedActions, // Server-validated actions
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      providers: {
        stt: this.env.KAI_STT_PROVIDER,
        tts: this.env.KAI_TTS_PROVIDER,
        kai: this.env.KAI_CORE_PROVIDER,
      },
    };

    // Log session to D1
    await this.logger.logSession({
      sessionId,
      appId: validated.appId,
      userId: validated.userId,
      userRole: validated.userRole,
      currentScreen: validated.currentScreen,
      providerStt: this.env.KAI_STT_PROVIDER,
      providerTts: this.env.KAI_TTS_PROVIDER,
    });

    return this.json(response, 201);
  }

  // ── POST /api/kai/voice/transcribe ──
  async transcribe(request: Request): Promise<Response> {
    const auth = await authenticateAndRateLimit(request, this.env);

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw Errors.gatewayFailure('Expected multipart/form-data.');
    }

    // Extract audio file
    const audioFile = formData.get("audio") as unknown as File | null;
    if (!audioFile) {
      throw Errors.missingAudio();
    }

    // ── Security: validate audio file size ──
    validateAudioSize(audioFile.size);

    // Extract metadata from form (used for currentScreen and allowedActions)
    const metadata: Record<string, unknown> = {};
    for (const key of ['sessionId', 'currentScreen']) {
      const val = formData.get(key);
      if (!val || typeof val !== 'string') {
        throw Errors.missingField(key);
      }
      metadata[key] = val;
    }

    // Optional body fields that get validated against token
    for (const key of ['appId', 'userId', 'userRole']) {
      const val = formData.get(key);
      if (val && typeof val === 'string') {
        metadata[key] = val;
      }
    }

    const actionsRaw = formData.get('allowedActions');
    metadata.allowedActions = actionsRaw ? JSON.parse(actionsRaw as string) : [];

    const validated = validateVoiceRequest(metadata, auth);

    // ── Do NOT store raw audio ──
    const audioBuffer = await audioFile.arrayBuffer();

    if (this.env.ENABLE_KAI_AUDIO_STORAGE === 'true') {
      // Future: store in R2 for debugging/compliance
      // await this.env.KAI_AUDIO_BUCKET.put(`${sessionId}/${interactionId}.webm`, audioBuffer);
    }
    // Audio buffer is discarded after transcription (garbage collected)

    // Transcribe via provider
    const stt = getSTTProvider(this.env.KAI_STT_PROVIDER, this.env);
    const result = await stt.transcribe(
      audioBuffer,
      metadata.sessionId as string,
      audioFile.type || 'audio/webm',
    );

    // ── Security: validate audio duration ──
    validateAudioDuration(result.durationMs);

    const response: TranscribeResponse = {
      sessionId: metadata.sessionId as string,
      transcript: result.transcript,
      confidence: result.confidence,
      language: result.language,
      durationMs: result.durationMs,
      provider: stt.name,
    };

    return this.json(response);
  }

  // ── POST /api/kai/voice/respond ──
  async respond(request: Request): Promise<Response> {
    const auth = await authenticateAndRateLimit(request, this.env);
    validateJsonBodySize(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw Errors.gatewayFailure('Invalid JSON in request body.');
    }

    const validated = validateVoiceRequest(body, auth);

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      throw Errors.missingField('sessionId');
    }
    if (!body.transcript || typeof body.transcript !== 'string') {
      throw Errors.missingField('transcript');
    }

    // Get Kai response — pass D1 for receipt logging
    const kai = getKaiProvider(this.env.KAI_CORE_PROVIDER, this.env.KAI_DB);
    const kaiResult = await kai.respond({
      transcript: body.transcript as string,
      appId: validated.appId,
      userId: validated.userId,
      userRole: validated.userRole,
      currentScreen: validated.currentScreen,
      allowedActions: validated.allowedActions, // Server-validated
      sessionId: body.sessionId as string,
    });

    // Generate TTS audio
    const tts = getTTSProvider(this.env.KAI_TTS_PROVIDER, this.env);
    const voiceConfig = getVoiceConfig(this.env);
    let ttsAudioBase64: string | null = null;
    let ttsAudioFormat: string | null = null;
    let ttsProviderName = tts.name;

    try {
      const ttsResult = await tts.synthesize({
        text: kaiResult.responseText,
        sessionId: body.sessionId as string,
        voice: voiceConfig,
      });

      if (ttsResult.audioData && ttsResult.audioData.byteLength > 0) {
        ttsAudioBase64 = arrayBufferToBase64(ttsResult.audioData);
        ttsAudioFormat = ttsResult.audioFormat;
      }
    } catch (err) {
      // TTS failure is non-fatal — text response still returned
      console.error('[Gateway] TTS failed, returning text-only:', err);
    }

    // Log interaction to D1
    await this.logger.logInteraction({
      sessionId: body.sessionId as string,
      appId: validated.appId,
      userId: validated.userId,
      userRole: validated.userRole,
      transcript: body.transcript as string,
      kaiResponse: kaiResult.responseText,
      riskLevel: kaiResult.riskLevel,
      requiresConfirmation: kaiResult.requiresConfirmation,
      suggestedActions: kaiResult.suggestedActions,
      actionTaken: null,
      errorMessage: null,
      sttProvider: this.env.KAI_STT_PROVIDER,
      ttsProvider: ttsProviderName,
      durationMs: null,
    });

    const response: RespondResponse = {
      sessionId: body.sessionId as string,
      response: kaiResult.responseText,
      responseText: kaiResult.responseText,
      riskLevel: kaiResult.riskLevel,
      requiresConfirmation: kaiResult.requiresConfirmation,
      suggestedActions: kaiResult.suggestedActions,
      actions: kaiResult.actions,
      provider: kai.name,
      ttsAudioUrl: null,
      ttsAudioBase64,
      ttsAudioFormat,
      ttsProvider: ttsProviderName,
    };

    return this.json(response);
  }

  // ── GET /api/kai/voice/history ──
  // Admin-only: returns paginated voice interaction history from D1.
  async getHistory(request: Request): Promise<Response> {
    const auth = await authenticateAndRateLimit(request, this.env);

    // Admin check uses the verified token's role
    requireAdmin(auth.userRole);

    const url = new URL(request.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(
      Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)),
      100,
    );
    const filterAppId = url.searchParams.get('appId') || undefined;
    const filterUserId = url.searchParams.get('userId') || undefined;
    const filterRiskLevel = url.searchParams.get('riskLevel') || undefined;

    const { entries, total } = await this.logger.getHistory({
      page,
      pageSize,
      appId: filterAppId,
      userId: filterUserId,
      riskLevel: filterRiskLevel,
    });

    const response: HistoryResponse = {
      entries,
      total,
      page,
      pageSize,
    };

    return this.json(response);
  }

  // ── Helpers ──

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
}

/** Convert ArrayBuffer to base64 string (Cloudflare Workers compatible) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
