// ── Kai Voice Gateway — Error Handling ──

import { ErrorResponse } from './types';

export class KaiGatewayError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'KaiGatewayError';
  }

  toResponse(): Response {
    const body: ErrorResponse = {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
    return new Response(JSON.stringify(body), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// ── Pre-built error factories ──

export const Errors = {
  unauthorized(details?: string) {
    return new KaiGatewayError(401, 'UNAUTHORIZED', 'Authentication required.', details);
  },

  forbidden(details?: string) {
    return new KaiGatewayError(403, 'FORBIDDEN', 'Access denied.', details);
  },

  invalidAppId(appId: string) {
    return new KaiGatewayError(
      400,
      'INVALID_APP_ID',
      `Invalid appId: "${appId}".`,
      'Must be one of: jon-command-center, carehia, viliniu, volau.',
    );
  },

  invalidUserRole(role: string) {
    return new KaiGatewayError(
      400,
      'INVALID_USER_ROLE',
      `Invalid userRole: "${role}".`,
      'Must be one of: super-admin, admin, vendor, customer, viewer.',
    );
  },

  invalidAllowedAction(action: string) {
    return new KaiGatewayError(
      400,
      'INVALID_ALLOWED_ACTION',
      `Action "${action}" is not permitted for this app/role combination.`,
    );
  },

  missingAudio() {
    return new KaiGatewayError(400, 'MISSING_AUDIO', 'No audio payload provided.');
  },

  missingField(field: string) {
    return new KaiGatewayError(400, 'MISSING_FIELD', `Missing required field: "${field}".`);
  },

  audioTooLarge(sizeBytes: number, maxBytes: number) {
    return new KaiGatewayError(
      413,
      'AUDIO_TOO_LARGE',
      `Audio file too large: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB.`,
      `Maximum allowed: ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
    );
  },

  audioDurationExceeded(durationSeconds: number, maxSeconds: number) {
    return new KaiGatewayError(
      400,
      'AUDIO_DURATION_EXCEEDED',
      `Audio duration (${durationSeconds.toFixed(0)}s) exceeds maximum (${maxSeconds}s).`,
    );
  },

  rateLimited() {
    return new KaiGatewayError(
      429,
      'RATE_LIMITED',
      'Too many requests. Please wait a moment before trying again.',
    );
  },

  requestTimeout() {
    return new KaiGatewayError(
      408,
      'REQUEST_TIMEOUT',
      'Request timed out. Please try again.',
    );
  },

  requestTooLarge(maxBytes: number) {
    return new KaiGatewayError(
      413,
      'REQUEST_TOO_LARGE',
      `Request body exceeds maximum size of ${(maxBytes / 1024).toFixed(0)} KB.`,
    );
  },

  unsupportedProvider(type: string, name: string) {
    return new KaiGatewayError(
      400,
      'UNSUPPORTED_PROVIDER',
      `Unsupported ${type} provider: "${name}".`,
    );
  },

  gatewayFailure(details?: string) {
    return new KaiGatewayError(
      500,
      'GATEWAY_FAILURE',
      'Kai Voice Gateway encountered an internal error.',
      details,
    );
  },

  notFound(path: string) {
    return new KaiGatewayError(404, 'NOT_FOUND', `Route not found: ${path}`);
  },

  methodNotAllowed(method: string) {
    return new KaiGatewayError(405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed.`);
  },

  databaseError(details?: string) {
    return new KaiGatewayError(
      500,
      'DATABASE_ERROR',
      'Database operation failed.',
      details,
    );
  },


  providerNotConfigured(provider: string, details?: string) {
    return new KaiGatewayError(
      500,
      'PROVIDER_NOT_CONFIGURED',
      `Provider "${provider}" is not properly configured.`,
      details,
    );
  },
};
