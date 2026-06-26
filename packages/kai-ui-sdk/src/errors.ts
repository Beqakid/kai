// ── @kai/ui-sdk — Errors ──
// Safe error classes for Kai SDK — never expose tokens, raw bodies, or stack traces to UI.

export class KaiSdkError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly debugInfo?: string;

  constructor(
    message: string,
    opts?: { code?: string; statusCode?: number; debugInfo?: string }
  ) {
    // Safe message only — no tokens, no raw request bodies
    super(message);
    this.name = 'KaiSdkError';
    this.code = opts?.code ?? 'KAI_SDK_ERROR';
    this.statusCode = opts?.statusCode;
    this.debugInfo = opts?.debugInfo;
    // Remove stack trace from production display
    const ErrorWithCapture = Error as ErrorConstructor & {
      captureStackTrace?: (target: object, ctor: Function) => void;
    };
    if (typeof ErrorWithCapture.captureStackTrace === 'function') {
      ErrorWithCapture.captureStackTrace(this, this.constructor);
    }
  }

  /** Returns a UI-safe representation — no stack, no debug info */
  toSafeString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

export class KaiAuthError extends KaiSdkError {
  constructor(message = 'Authentication failed', opts?: { statusCode?: number; debugInfo?: string }) {
    super(message, { code: 'KAI_AUTH_ERROR', ...opts });
    this.name = 'KaiAuthError';
  }
}

export class KaiNetworkError extends KaiSdkError {
  constructor(message = 'Network request failed', opts?: { debugInfo?: string }) {
    super(message, { code: 'KAI_NETWORK_ERROR', ...opts });
    this.name = 'KaiNetworkError';
  }
}

export class KaiValidationError extends KaiSdkError {
  constructor(message: string, opts?: { debugInfo?: string }) {
    super(message, { code: 'KAI_VALIDATION_ERROR', ...opts });
    this.name = 'KaiValidationError';
  }
}

export class KaiCommandError extends KaiSdkError {
  constructor(message: string, opts?: { debugInfo?: string }) {
    super(message, { code: 'KAI_COMMAND_ERROR', ...opts });
    this.name = 'KaiCommandError';
  }
}
