// ── Voice Logger — D1 Session & Interaction Logging ──
//
// Logs all voice sessions and interactions to D1 for auditing.
// Fails gracefully — logging errors never block the voice pipeline.

import {
  D1Database,
  AppId,
  UserRole,
  RiskLevel,
  STTProviderName,
  TTSProviderName,
  HistoryEntry,
} from '../types';

/** Generate a unique ID with prefix */
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * VoiceLogger — writes session and interaction records to D1.
 * All methods are fire-and-forget safe (catch errors internally).
 */
export class VoiceLogger {
  private readonly db: D1Database | undefined;

  constructor(db: D1Database | undefined) {
    this.db = db;
  }

  /** Whether D1 is available */
  get isEnabled(): boolean {
    return !!this.db;
  }

  // ── Session Logging ──

  /**
   * Log a new voice session. Returns the session ID.
   */
  async logSession(params: {
    sessionId: string;
    appId: AppId;
    userId: string;
    userRole: UserRole;
    currentScreen: string;
    providerStt: STTProviderName;
    providerTts: string;
  }): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .prepare(
          `INSERT INTO kai_voice_sessions (id, app_id, user_id, user_role, current_screen, provider_stt, provider_tts, started_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          params.sessionId,
          params.appId,
          params.userId,
          params.userRole,
          params.currentScreen,
          params.providerStt,
          params.providerTts,
        )
        .run();
    } catch (err) {
      console.error('[VoiceLogger] Failed to log session:', err);
    }
  }

  /**
   * Mark a session as ended.
   */
  async endSession(sessionId: string): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .prepare(`UPDATE kai_voice_sessions SET ended_at = datetime('now') WHERE id = ?`)
        .bind(sessionId)
        .run();
    } catch (err) {
      console.error('[VoiceLogger] Failed to end session:', err);
    }
  }

  // ── Interaction Logging ──

  /**
   * Log a voice interaction (transcription + response).
   */
  async logInteraction(params: {
    sessionId: string;
    appId: AppId;
    userId: string;
    userRole: UserRole;
    transcript: string | null;
    kaiResponse: string | null;
    riskLevel: RiskLevel;
    requiresConfirmation: boolean;
    suggestedActions: string[];
    actionTaken: string | null;
    errorMessage: string | null;
    sttProvider: string | null;
    ttsProvider: string | null;
    durationMs: number | null;
  }): Promise<string> {
    const interactionId = generateId('vint');

    if (!this.db) return interactionId;

    try {
      await this.db
        .prepare(
          `INSERT INTO kai_voice_interactions
           (id, session_id, app_id, user_id, user_role, transcript, kai_response,
            risk_level, requires_confirmation, suggested_actions_json, action_taken,
            error_message, stt_provider, tts_provider, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(
          interactionId,
          params.sessionId,
          params.appId,
          params.userId,
          params.userRole,
          params.transcript,
          params.kaiResponse,
          params.riskLevel,
          params.requiresConfirmation ? 1 : 0,
          JSON.stringify(params.suggestedActions),
          params.actionTaken,
          params.errorMessage,
          params.sttProvider,
          params.ttsProvider,
          params.durationMs,
        )
        .run();
    } catch (err) {
      console.error('[VoiceLogger] Failed to log interaction:', err);
    }

    return interactionId;
  }

  // ── History Queries (Admin Only) ──

  /**
   * Get paginated voice interaction history.
   * Supports filtering by appId, userId, riskLevel.
   */
  async getHistory(params: {
    page: number;
    pageSize: number;
    appId?: string;
    userId?: string;
    riskLevel?: string;
  }): Promise<{ entries: HistoryEntry[]; total: number }> {
    if (!this.db) {
      return { entries: [], total: 0 };
    }

    try {
      // Build WHERE clause dynamically
      const conditions: string[] = [];
      const binds: unknown[] = [];

      if (params.appId) {
        conditions.push('app_id = ?');
        binds.push(params.appId);
      }
      if (params.userId) {
        conditions.push('user_id = ?');
        binds.push(params.userId);
      }
      if (params.riskLevel) {
        conditions.push('risk_level = ?');
        binds.push(params.riskLevel);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total
      const countStmt = this.db.prepare(
        `SELECT COUNT(*) as count FROM kai_voice_interactions ${where}`,
      );
      const countResult = await (binds.length > 0 ? countStmt.bind(...binds) : countStmt)
        .first<{ count: number }>();
      const total = countResult?.count ?? 0;

      // Fetch page
      const offset = (params.page - 1) * params.pageSize;
      const selectStmt = this.db.prepare(
        `SELECT id, session_id, app_id, user_id, user_role, transcript, kai_response,
                risk_level, requires_confirmation, suggested_actions_json,
                stt_provider, tts_provider, error_message, created_at
         FROM kai_voice_interactions ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      );

      const allBinds = [...binds, params.pageSize, offset];
      const result = await selectStmt.bind(...allBinds).all<{
        id: string;
        session_id: string;
        app_id: string;
        user_id: string;
        user_role: string;
        transcript: string | null;
        kai_response: string | null;
        risk_level: string;
        requires_confirmation: number;
        suggested_actions_json: string | null;
        stt_provider: string | null;
        tts_provider: string | null;
        error_message: string | null;
        created_at: string;
      }>();

      const entries: HistoryEntry[] = result.results.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.created_at,
        appId: row.app_id,
        userId: row.user_id,
        userRole: row.user_role,
        transcript: row.transcript ?? '',
        response: row.kai_response ?? '',
        riskLevel: (row.risk_level as RiskLevel) || 'safe',
        requiresConfirmation: row.requires_confirmation === 1,
        suggestedActions: row.suggested_actions_json
          ? JSON.parse(row.suggested_actions_json)
          : [],
        sttProvider: row.stt_provider ?? '',
        ttsProvider: row.tts_provider ?? '',
        errorMessage: row.error_message,
      }));

      return { entries, total };
    } catch (err) {
      console.error('[VoiceLogger] Failed to query history:', err);
      return { entries: [], total: 0 };
    }
  }
}
