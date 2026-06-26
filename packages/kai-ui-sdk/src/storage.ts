// ── @kai/ui-sdk — Storage ──
// Lightweight in-memory storage. Default is memory-only.
// No auth tokens are ever persisted. No localStorage for tokens.
// localStorage is never used by default — all state is in-memory.

import type { KaiUiAdapterResponse } from './types';

/** In-memory store for the last response and debug log */
export class KaiResponseStore {
  private _lastResponse: KaiUiAdapterResponse | null = null;
  private _debugMode: boolean;

  constructor(opts?: { debugMode?: boolean }) {
    this._debugMode = opts?.debugMode ?? false;
  }

  /** Store a response in memory only */
  setLastResponse(response: KaiUiAdapterResponse): void {
    this._lastResponse = response;
  }

  /** Get last stored response */
  getLastResponse(): KaiUiAdapterResponse | null {
    return this._lastResponse;
  }

  /** Clear stored response */
  clear(): void {
    this._lastResponse = null;
  }

  /** Debug-guarded log — only outputs in debug mode, never logs tokens */
  debugLog(label: string, data?: unknown): void {
    if (!this._debugMode) return;
    // Safety: strip any token-like fields before logging
    if (data && typeof data === 'object') {
      const safe = sanitizeForLog(data as Record<string, unknown>);
      console.debug(`[kai-sdk] ${label}`, safe);
    } else {
      console.debug(`[kai-sdk] ${label}`, data ?? '');
    }
  }

  get debugMode(): boolean {
    return this._debugMode;
  }

  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
  }
}

/** Generate a unique client request ID */
export function generateClientRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `kai-sdk-${timestamp}-${random}`;
}

// Fields that must NEVER appear in debug logs
const LOG_SENSITIVE_FIELDS = new Set([
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'secret',
  'apikey',
  'paymentcard',
  'bankaccount',
  'ssn',
  'governmentid',
]);

function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (LOG_SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeForLog(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
