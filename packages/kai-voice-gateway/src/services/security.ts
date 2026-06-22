// ── Security Service — Rate Limiting, Audio Limits, Action Validation ──
//
// Enforces server-side security constraints for all voice requests.
// No client-side data is trusted — everything is validated here.

import {
  AppId,
  UserRole,
  ALLOWED_ACTIONS_REGISTRY,
  MAX_AUDIO_SIZE_BYTES,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_JSON_BODY_BYTES,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../types';
import { Errors } from '../errors';

// ── In-memory rate limiter ──
// Uses a sliding window counter per userId.
// In production with multiple Workers instances, replace with KV or D1.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for a given user.
 * Throws 429 if limit exceeded.
 */
export function checkRateLimit(userId: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_PER_MINUTE) {
    throw Errors.rateLimited();
  }
}

/**
 * Periodically clean up expired rate limit entries.
 * Call from the router or on a schedule.
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}

// ── Audio validation ──

/**
 * Validate audio file size.
 * Throws 413 if too large.
 */
export function validateAudioSize(sizeBytes: number): void {
  if (sizeBytes > MAX_AUDIO_SIZE_BYTES) {
    throw Errors.audioTooLarge(sizeBytes, MAX_AUDIO_SIZE_BYTES);
  }
  if (sizeBytes === 0) {
    throw Errors.missingAudio();
  }
}

/**
 * Validate audio duration from STT result.
 * Throws 400 if duration exceeds limit.
 */
export function validateAudioDuration(durationMs: number): void {
  const durationSeconds = durationMs / 1000;
  if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    throw Errors.audioDurationExceeded(durationSeconds, MAX_AUDIO_DURATION_SECONDS);
  }
}

// ── JSON body size validation ──

/**
 * Validate Content-Length for JSON endpoints.
 * Throws 413 if too large.
 */
export function validateJsonBodySize(request: Request): void {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_JSON_BODY_BYTES) {
      throw Errors.requestTooLarge(MAX_JSON_BODY_BYTES);
    }
  }
}

// ── Server-side allowed actions validation ──

/**
 * Validate and sanitize allowedActions against the server-side registry.
 * Only actions explicitly permitted for this app+role combo are allowed.
 * Unknown or unauthorized actions are silently removed (not sent to Kai).
 */
export function validateAllowedActions(
  appId: AppId,
  userRole: UserRole,
  requestedActions: string[],
): string[] {
  const permitted = ALLOWED_ACTIONS_REGISTRY[appId]?.[userRole] ?? [];
  const permittedSet = new Set(permitted);

  // Return only the intersection of requested and permitted
  return requestedActions.filter((action) => permittedSet.has(action));
}

/**
 * Get all permitted actions for an app+role (for session creation).
 */
export function getPermittedActions(appId: AppId, userRole: UserRole): readonly string[] {
  return ALLOWED_ACTIONS_REGISTRY[appId]?.[userRole] ?? [];
}

// ── No-background-listening guarantee ──
// This is an architectural guarantee, not a runtime check.
// The gateway ONLY processes audio when:
// 1. A user explicitly taps the orb (frontend sends POST /transcribe)
// 2. The request includes a valid session + auth token
// 3. Audio is a discrete blob, not a stream
//
// There is:
// - No wake word detection
// - No always-on microphone
// - No streaming audio endpoint
// - No background audio processing
// - Recording starts ONLY from explicit user tap
