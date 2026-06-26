// ── Kai UI Adapter — Client Contract ──
//
// Phase 11 Phase 3: Validation helpers and constants for the
// cross-app UI adapter. Includes metadata sanitization to strip
// sensitive fields before any processing or receipt creation.
//
// Safety: Sanitizer removes tokens, passwords, PII, payment details,
// and raw data fields. Nothing sensitive is passed downstream.

import {
  KaiUiAdapterAppId,
  KAI_UI_ADAPTER_APP_IDS,
  KaiUiAdapterRole,
  KAI_UI_ADAPTER_ROLES,
  KaiUiIntentType,
  KAI_UI_INTENT_TYPES,
  KaiUiCommandType,
  KAI_UI_COMMAND_TYPES,
  KaiUiAdapterRequest,
} from './types';

// ── Version ──

export const KAI_UI_ADAPTER_VERSION = '0.3.0';

// ── Supported Constants ──

export const SUPPORTED_UI_ADAPTER_APPS: readonly string[] = KAI_UI_ADAPTER_APP_IDS;
export const SUPPORTED_UI_ADAPTER_ROLES: readonly string[] = KAI_UI_ADAPTER_ROLES;
export const SUPPORTED_UI_INTENTS: readonly string[] = KAI_UI_INTENT_TYPES;
export const SUPPORTED_UI_COMMANDS: readonly string[] = KAI_UI_COMMAND_TYPES;

// ── Sensitive metadata keys to strip ──

const SENSITIVE_METADATA_KEYS = new Set([
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'secret',
  'apikey',
  'rawphoto',
  'photodataurl',
  'base64',
  'file',
  'rawprivatedata',
  'paymentcard',
  'bankaccount',
  'mpaisadetails',
  'ssn',
  'governmentid',
  'backgroundcheckrawdata',
  'medicalrecordrawdata',
]);

// ── Validation Helpers ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a UI adapter appId.
 */
export function validateUiAdapterAppId(appId: string): ValidationResult {
  if (!appId) {
    return { valid: false, errors: ['appId is required.'] };
  }
  if (!KAI_UI_ADAPTER_APP_IDS.includes(appId as KaiUiAdapterAppId)) {
    return { valid: false, errors: [`Invalid appId: "${appId}". Supported: ${KAI_UI_ADAPTER_APP_IDS.join(', ')}.`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate a UI adapter role.
 */
export function validateUiAdapterRole(role: string): ValidationResult {
  if (!role) {
    return { valid: false, errors: ['userRole is required.'] };
  }
  const normalized = role.replace(/_/g, '-');
  if (!KAI_UI_ADAPTER_ROLES.includes(normalized as KaiUiAdapterRole)) {
    return { valid: false, errors: [`Invalid userRole: "${role}". Supported: ${KAI_UI_ADAPTER_ROLES.join(', ')}.`] };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate a complete UI adapter request.
 */
export function validateUiAdapterRequest(input: Partial<KaiUiAdapterRequest>): ValidationResult {
  const errors: string[] = [];

  if (!input.appId) {
    errors.push('appId is required.');
  } else {
    const appResult = validateUiAdapterAppId(input.appId);
    if (!appResult.valid) errors.push(...appResult.errors);
  }

  if (!input.userRole) {
    errors.push('userRole is required.');
  } else {
    const roleResult = validateUiAdapterRole(input.userRole);
    if (!roleResult.valid) errors.push(...roleResult.errors);
  }

  // intentType is optional, but if provided must be valid
  if (input.intentType && !KAI_UI_INTENT_TYPES.includes(input.intentType)) {
    errors.push(`Invalid intentType: "${input.intentType}".`);
  }

  // message length check
  if (input.message && input.message.length > 2000) {
    errors.push('message exceeds maximum length of 2000 characters.');
  }

  // clientRequestId length check
  if (input.clientRequestId && input.clientRequestId.length > 128) {
    errors.push('clientRequestId exceeds maximum length of 128 characters.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize metadata by stripping sensitive keys.
 * Case-insensitive matching. Values over 500 chars are truncated.
 */
export function sanitizeUiAdapterMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // Case-insensitive key check (strip camelCase, snake_case, etc.)
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    if (SENSITIVE_METADATA_KEYS.has(normalizedKey)) {
      continue; // Strip entirely — do not include even as [REDACTED]
    }

    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
