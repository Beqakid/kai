// ── @kai/ui-sdk — API Client ──
// Calls POST /api/kai/ui-adapter/evaluate.
// Never stores tokens. Never logs tokens. Never auto-executes commands.

import type {
  KaiAppId,
  KaiClientConfig,
  KaiUiAdapterRequest,
  KaiUiAdapterResponse,
  KaiUserRole,
} from './types';
import { KAI_APP_IDS, KAI_USER_ROLES } from './types';
import { KaiAuthError, KaiNetworkError, KaiSdkError, KaiValidationError } from './errors';
import { KaiResponseStore, generateClientRequestId } from './storage';

// Fields stripped from metadata before sending to server
const UNSAFE_METADATA_FIELDS = new Set([
  'authorization',
  'token',
  'accesstoken',
  'accessToken',
  'refreshtoken',
  'refreshToken',
  'password',
  'secret',
  'apikey',
  'apiKey',
  'paymentcard',
  'paymentCard',
  'bankaccount',
  'bankAccount',
  'ssn',
  'governmentid',
  'governmentId',
  'rawphoto',
  'rawPhoto',
  'photodataurl',
  'photoDataUrl',
  'base64',
  'rawprivatedata',
  'rawPrivateData',
  'medicalrecordrawdata',
  'medicalRecordRawData',
  'backgroundcheckrawdata',
  'backgroundCheckRawData',
  'mpaisadetails',
  'mpaisaDetails',
  'file',
]);

/**
 * Sanitize metadata before sending — strips sensitive fields.
 * Exported for testing but not part of public API.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (UNSAFE_METADATA_FIELDS.has(key) || UNSAFE_METADATA_FIELDS.has(key.toLowerCase())) {
      continue; // Strip unsafe field
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface KaiClient {
  /** Evaluate a free-form intent message */
  evaluateIntent(input: {
    message: string;
    role?: KaiUserRole;
    metadata?: Record<string, unknown>;
    clientRequestId?: string;
  }): Promise<KaiUiAdapterResponse>;

  /** Evaluate navigation to a specific route */
  evaluateNavigation(
    routeKey: string,
    metadata?: Record<string, unknown>
  ): Promise<KaiUiAdapterResponse>;

  /** Evaluate an action */
  evaluateAction(
    actionKey: string,
    metadata?: Record<string, unknown>
  ): Promise<KaiUiAdapterResponse>;

  /** Request help with a message */
  requestHelp(
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<KaiUiAdapterResponse>;

  /** Report an issue */
  reportIssue(
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<KaiUiAdapterResponse>;

  /** Create a support suggestion from a custom input */
  createSupportSuggestion(input: {
    message: string;
    role?: KaiUserRole;
    metadata?: Record<string, unknown>;
    clientRequestId?: string;
  }): Promise<KaiUiAdapterResponse>;

  /** Get the last stored response */
  getLastResponse(): KaiUiAdapterResponse | null;

  /** Clear the last stored response */
  clearLastResponse(): void;
}

/**
 * Create a Kai API client.
 *
 * The client never stores auth tokens, never logs them,
 * and never auto-executes commands from responses.
 */
export function createKaiClient(config: KaiClientConfig): KaiClient {
  // Validate required config
  if (!config.baseUrl) {
    throw new KaiValidationError('baseUrl is required');
  }
  if (!config.appId) {
    throw new KaiValidationError('appId is required');
  }
  if (!KAI_APP_IDS.includes(config.appId as KaiAppId)) {
    throw new KaiValidationError(`Invalid appId: ${config.appId}`);
  }
  if (!config.getAuthToken || typeof config.getAuthToken !== 'function') {
    throw new KaiValidationError('getAuthToken function is required');
  }

  const store = new KaiResponseStore();

  async function callEvaluate(
    request: KaiUiAdapterRequest
  ): Promise<KaiUiAdapterResponse> {
    // Get token — never log it
    let token: string;
    try {
      token = await config.getAuthToken();
    } catch (err) {
      const authError = new KaiAuthError('Failed to retrieve auth token');
      config.onAuthError?.(authError);
      throw authError;
    }

    // Sanitize metadata
    const sanitizedRequest: KaiUiAdapterRequest = {
      ...request,
      metadata: sanitizeMetadata(request.metadata),
      clientRequestId: request.clientRequestId || generateClientRequestId(),
    };

    // Build headers — token is NEVER logged
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...config.defaultHeaders,
    };

    const url = `${config.baseUrl.replace(/\/$/, '')}/api/kai/ui-adapter/evaluate`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(sanitizedRequest),
      });
    } catch (err) {
      const networkError = new KaiNetworkError(
        'Failed to connect to Kai API',
        { debugInfo: err instanceof Error ? err.message : 'Unknown network error' }
      );
      config.onNetworkError?.(networkError);
      throw networkError;
    }

    // Handle non-200 responses safely
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const authError = new KaiAuthError(
          `Authentication failed (${response.status})`,
          { statusCode: response.status }
        );
        config.onAuthError?.(authError);
        throw authError;
      }

      let errorMessage = `Kai API error (${response.status})`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          errorMessage = `Kai API error: ${errorBody.error}`;
        }
      } catch {
        // Could not parse error body — use generic message
      }

      const kaiError = new KaiSdkError(errorMessage, {
        code: 'KAI_API_ERROR',
        statusCode: response.status,
      });
      config.onKaiError?.(kaiError);
      throw kaiError;
    }

    const data: KaiUiAdapterResponse = await response.json();

    // Store response in memory — never auto-execute commands
    store.setLastResponse(data);

    return data;
  }

  function buildRequest(overrides: Partial<KaiUiAdapterRequest>): KaiUiAdapterRequest {
    return {
      appId: config.appId,
      role: config.defaultRole ?? 'viewer',
      message: '',
      ...overrides,
    };
  }

  return {
    evaluateIntent(input) {
      return callEvaluate(
        buildRequest({
          message: input.message,
          role: input.role ?? config.defaultRole,
          metadata: input.metadata,
          clientRequestId: input.clientRequestId,
        })
      );
    },

    evaluateNavigation(routeKey, metadata) {
      return callEvaluate(
        buildRequest({
          message: `Navigate to ${routeKey}`,
          routeKey,
          metadata,
        })
      );
    },

    evaluateAction(actionKey, metadata) {
      return callEvaluate(
        buildRequest({
          message: `Evaluate action ${actionKey}`,
          actionKey,
          metadata,
        })
      );
    },

    requestHelp(message, metadata) {
      return callEvaluate(
        buildRequest({
          message: `Help: ${message}`,
          metadata,
        })
      );
    },

    reportIssue(message, metadata) {
      return callEvaluate(
        buildRequest({
          message: `Issue: ${message}`,
          metadata,
        })
      );
    },

    createSupportSuggestion(input) {
      return callEvaluate(
        buildRequest({
          message: input.message,
          role: input.role ?? config.defaultRole,
          metadata: input.metadata,
          clientRequestId: input.clientRequestId,
        })
      );
    },

    getLastResponse() {
      return store.getLastResponse();
    },

    clearLastResponse() {
      store.clear();
    },
  };
}
