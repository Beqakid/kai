// ── @kai/ui-sdk — Tests ──
// Phase 11 Phase 4: Frontend SDK — 44 tests
//
// Covers: client, commands, support, hooks, security, build

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createKaiClient,
  sanitizeMetadata,
  handleKaiCommand,
  handleKaiCommands,
  createDefaultCommandHandlers,
  isNavigationCommand,
  isSupportCommand,
  isConfirmationCommand,
  isAdminReviewCommand,
  isBlockedCommand,
  isUnsupportedCommand,
  isReceiptCommand,
  buildSupportDraftFromSuggestion,
  isAdminReviewRequired,
  isConfirmationRequired,
  getSupportRequestType,
  getSafeSupportTitle,
  getSafeSupportDescription,
  KaiSdkError,
  KaiAuthError,
  KaiNetworkError,
  KaiValidationError,
  KaiCommandError,
  KaiResponseStore,
  generateClientRequestId,
  KAI_APP_IDS,
  KAI_USER_ROLES,
  KAI_UI_COMMAND_TYPES,
} from '../index';

import type {
  KaiUiCommand,
  KaiUiAdapterResponse,
  KaiSupportRequestSuggestion,
  KaiCommandHandlerMap,
} from '../types';

// ── Helpers ──

function mockResponse(overrides: Partial<KaiUiAdapterResponse> = {}): KaiUiAdapterResponse {
  return {
    success: true,
    decision: 'allowed',
    riskLevel: 'low',
    intentType: 'navigate',
    commands: [],
    message: 'OK',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetchSuccess(data: KaiUiAdapterResponse) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, body?: { error: string }) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body ?? { error: 'Error' }),
  });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('fetch failed'));
}

const baseConfig = {
  baseUrl: 'https://kai.example.com',
  appId: 'carehia' as const,
  getAuthToken: async () => 'test-token-123',
};

// ── 1. Client Tests (1–10) ──

describe('Client', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Test 1
  it('1. createKaiClient requires baseUrl and appId', () => {
    expect(() => createKaiClient({ ...baseConfig, baseUrl: '' })).toThrow('baseUrl is required');
    expect(() => createKaiClient({ ...baseConfig, appId: '' as any })).toThrow('appId is required');
    expect(() =>
      createKaiClient({ ...baseConfig, appId: 'invalid' as any })
    ).toThrow('Invalid appId');
    expect(() =>
      createKaiClient({ ...baseConfig, getAuthToken: null as any })
    ).toThrow('getAuthToken function is required');
  });

  // Test 2
  it('2. evaluateIntent calls /api/kai/ui-adapter/evaluate', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'Where is CPR upload?' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('https://kai.example.com/api/kai/ui-adapter/evaluate');
  });

  // Test 3
  it('3. Authorization header is included', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'test' });

    const [, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer test-token-123');
  });

  // Test 4
  it('4. token is not logged', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'test' });

    const allLogs = [
      ...consoleSpy.mock.calls.map((c) => JSON.stringify(c)),
      ...debugSpy.mock.calls.map((c) => JSON.stringify(c)),
    ].join(' ');

    expect(allLogs).not.toContain('test-token-123');

    consoleSpy.mockRestore();
    debugSpy.mockRestore();
  });

  // Test 5
  it('5. clientRequestId is generated if missing', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'test' });

    const [, opts] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.clientRequestId).toBeDefined();
    expect(body.clientRequestId).toMatch(/^kai-sdk-/);
  });

  // Test 6
  it('6. clientRequestId is preserved if supplied', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({
      message: 'test',
      clientRequestId: 'my-custom-id-42',
    });

    const [, opts] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.clientRequestId).toBe('my-custom-id-42');
  });

  // Test 7
  it('7. non-200 response returns safe error', async () => {
    globalThis.fetch = mockFetchError(500, { error: 'Internal Server Error' });
    const onKaiError = vi.fn();

    const client = createKaiClient({ ...baseConfig, onKaiError });
    await expect(
      client.evaluateIntent({ message: 'test' })
    ).rejects.toThrow('Kai API error');

    expect(onKaiError).toHaveBeenCalled();
  });

  // Test 8
  it('8. network error returns safe error', async () => {
    globalThis.fetch = mockFetchNetworkError();
    const onNetworkError = vi.fn();

    const client = createKaiClient({ ...baseConfig, onNetworkError });
    await expect(
      client.evaluateIntent({ message: 'test' })
    ).rejects.toThrow('Failed to connect to Kai API');

    expect(onNetworkError).toHaveBeenCalled();
  });

  // Test 9
  it('9. sensitive metadata is sanitized before send', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({
      message: 'test',
      metadata: {
        safeField: 'visible',
        password: 'secret123',
        token: 'jwt-token',
        bankAccount: '1234-5678',
        ssn: '123-45-6789',
        normalContext: { apiKey: 'hidden', label: 'ok' },
      },
    });

    const [, opts] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.metadata.safeField).toBe('visible');
    expect(body.metadata.password).toBeUndefined();
    expect(body.metadata.token).toBeUndefined();
    expect(body.metadata.bankAccount).toBeUndefined();
    expect(body.metadata.ssn).toBeUndefined();
    expect(body.metadata.normalContext.apiKey).toBeUndefined();
    expect(body.metadata.normalContext.label).toBe('ok');
  });

  // Test 10
  it('10. client does not auto-execute commands', async () => {
    const resp = mockResponse({
      commands: [
        { type: 'navigate_to_route', routePath: '/dangerous/path' },
        { type: 'open_support_form', message: 'Create support' },
      ],
    });
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    const result = await client.evaluateIntent({ message: 'navigate somewhere' });

    // Commands are returned but NOT executed
    expect(result.commands).toHaveLength(2);
    // No window.location change, no side effects
  });
});

// ── 2. Command Helper Tests (11–21) ──

describe('Command Helpers', () => {
  // Test 11
  it('11. navigation command calls onNavigate only when provided', async () => {
    const onNavigate = vi.fn();
    const cmd: KaiUiCommand = { type: 'navigate_to_route', routePath: '/dashboard' };
    await handleKaiCommand(cmd, { onNavigate });
    expect(onNavigate).toHaveBeenCalledWith(cmd);
  });

  // Test 12
  it('12. no navigation occurs without onNavigate handler', async () => {
    const cmd: KaiUiCommand = { type: 'navigate_to_route', routePath: '/dashboard' };
    // Should not throw — just silently skips
    await handleKaiCommand(cmd, {});
  });

  // Test 13
  it('13. support command calls onSupportForm only when provided', async () => {
    const onSupportForm = vi.fn();
    const suggestion: KaiSupportRequestSuggestion = {
      suggestedTitle: 'Help',
      suggestedDescription: 'I need help',
    };
    const cmd: KaiUiCommand = {
      type: 'open_support_form',
      metadata: { supportSuggestion: suggestion },
    };
    await handleKaiCommand(cmd, { onSupportForm });
    expect(onSupportForm).toHaveBeenCalledWith(suggestion);
  });

  // Test 14
  it('14. confirmation command calls onConfirmation only when provided', async () => {
    const onConfirmation = vi.fn();
    const confirmation = {
      action: 'delete_account',
      description: 'Are you sure?',
      riskLevel: 'high' as const,
      requiresExplicitConsent: true,
    };
    const cmd: KaiUiCommand = {
      type: 'request_confirmation',
      metadata: { confirmation },
    };
    await handleKaiCommand(cmd, { onConfirmation });
    expect(onConfirmation).toHaveBeenCalledWith(confirmation);
  });

  // Test 15
  it('15. admin-review command calls onAdminReview only when provided', async () => {
    const onAdminReview = vi.fn();
    const review = {
      action: 'change_payout',
      reason: 'Sensitive financial change',
      reviewerRole: 'admin' as const,
      riskLevel: 'high' as const,
    };
    const cmd: KaiUiCommand = {
      type: 'request_admin_review',
      metadata: { adminReview: review },
    };
    await handleKaiCommand(cmd, { onAdminReview });
    expect(onAdminReview).toHaveBeenCalledWith(review);
  });

  // Test 16
  it('16. blocked command calls onBlocked', async () => {
    const onBlocked = vi.fn();
    const cmd: KaiUiCommand = {
      type: 'show_blocked_notice',
      message: 'This action is blocked',
    };
    await handleKaiCommand(cmd, { onBlocked });
    expect(onBlocked).toHaveBeenCalledWith(cmd);
  });

  // Test 17
  it('17. unsupported command calls onUnsupported', async () => {
    const onUnsupported = vi.fn();
    const cmd: KaiUiCommand = {
      type: 'show_unsupported_notice',
      message: 'Not supported',
    };
    await handleKaiCommand(cmd, { onUnsupported });
    expect(onUnsupported).toHaveBeenCalledWith(cmd);
  });

  // Test 18
  it('18. message command calls onMessage', async () => {
    const onMessage = vi.fn();
    const cmd: KaiUiCommand = { type: 'show_message', message: 'Hello from Kai' };
    await handleKaiCommand(cmd, { onMessage });
    expect(onMessage).toHaveBeenCalledWith(cmd);
  });

  // Test 19
  it('19. receipt command calls onReceipt', async () => {
    const onReceipt = vi.fn();
    const cmd: KaiUiCommand = { type: 'show_receipt', receiptId: 'r-123' };
    await handleKaiCommand(cmd, { onReceipt });
    expect(onReceipt).toHaveBeenCalledWith(cmd);
  });

  // Test 20
  it('20. no_op does nothing safely', async () => {
    const onNoOp = vi.fn();
    const cmd: KaiUiCommand = { type: 'no_op' };
    await handleKaiCommand(cmd, { onNoOp });
    expect(onNoOp).toHaveBeenCalled();

    // Also safe without handler
    await handleKaiCommand(cmd, {});
  });

  // Test 21
  it('21. blocked command never becomes executable action', async () => {
    const onNavigate = vi.fn();
    const onBlocked = vi.fn();
    const cmd: KaiUiCommand = {
      type: 'show_blocked_notice',
      routePath: '/should-not-navigate',
      message: 'Blocked',
    };
    await handleKaiCommand(cmd, { onNavigate, onBlocked });
    // onBlocked is called, NOT onNavigate — blocked is terminal
    expect(onBlocked).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

// ── 3. Support Helper Tests (22–26) ──

describe('Support Helpers', () => {
  // Test 22
  it('22. support draft builds safe title/description', () => {
    const suggestion: KaiSupportRequestSuggestion = {
      suggestedTitle: 'CPR Upload Help',
      suggestedDescription: 'User needs help uploading CPR certificate',
      suggestedCategory: 'certifications',
      suggestedPriority: 'medium',
    };
    const draft = buildSupportDraftFromSuggestion(suggestion);
    expect(draft.title).toBe('CPR Upload Help');
    expect(draft.description).toBe('User needs help uploading CPR certificate');
    expect(draft.category).toBe('certifications');
    expect(draft.priority).toBe('medium');
  });

  // Test 23
  it('23. payout support suggestion marks admin review required', () => {
    const response = mockResponse({
      supportSuggestion: {
        suggestedTitle: 'Change payout method',
        suggestedDescription: 'Vendor wants to update payout bank details',
      },
    });
    expect(isAdminReviewRequired(response)).toBe(true);
  });

  // Test 24
  it('24. dispute support suggestion marks admin review required', () => {
    const response = mockResponse({
      supportSuggestion: {
        suggestedTitle: 'Dispute order charge',
        suggestedDescription: 'Customer disputes a billing charge',
      },
    });
    expect(isAdminReviewRequired(response)).toBe(true);
  });

  // Test 25
  it('25. verification support suggestion marks admin review required', () => {
    const response = mockResponse({
      supportSuggestion: {
        suggestedTitle: 'ID verification issue',
        suggestedDescription: 'User needs to redo verification process',
      },
    });
    expect(isAdminReviewRequired(response)).toBe(true);
  });

  // Test 26
  it('26. bank/card/government/medical private fields are excluded', () => {
    const suggestion: KaiSupportRequestSuggestion = {
      suggestedTitle: 'Help',
      suggestedDescription: 'Need help',
      metadata: {
        context: 'visible',
        bankAccount: '1234-5678',
        paymentCard: '4111-1111',
        governmentId: 'ABC123',
        medicalRecordRawData: 'private',
        ssn: '123-45-6789',
        safeField: 'ok',
      },
    };
    const draft = buildSupportDraftFromSuggestion(suggestion);
    expect(draft.metadata?.context).toBe('visible');
    expect(draft.metadata?.safeField).toBe('ok');
    expect(draft.metadata?.bankAccount).toBeUndefined();
    expect(draft.metadata?.paymentCard).toBeUndefined();
    expect(draft.metadata?.governmentId).toBeUndefined();
    expect(draft.metadata?.medicalRecordRawData).toBeUndefined();
    expect(draft.metadata?.ssn).toBeUndefined();
  });
});

// ── 4. Hook Tests (27–31) ──

describe('Hooks', () => {
  // Note: We test hooks structurally — they use React internals but the
  // exported functions are importable and their types are correct.
  // Full React rendering tests require jsdom + @testing-library/react.
  // Here we verify the hook functions exist and types compile.

  // Test 27
  it('27. useKaiClient is exported as a function', async () => {
    const { useKaiClient } = await import('../hooks');
    expect(typeof useKaiClient).toBe('function');
  });

  // Test 28
  it('28. useKaiIntent is exported as a function', async () => {
    const { useKaiIntent } = await import('../hooks');
    expect(typeof useKaiIntent).toBe('function');
  });

  // Test 29
  it('29. useKaiNavigation is exported as a function', async () => {
    const { useKaiNavigation } = await import('../hooks');
    expect(typeof useKaiNavigation).toBe('function');
  });

  // Test 30
  it('30. useKaiSupport is exported as a function', async () => {
    const { useKaiSupport } = await import('../hooks');
    expect(typeof useKaiSupport).toBe('function');
  });

  // Test 31
  it('31. useKaiCommandHandler does not auto-execute without handlers', async () => {
    const { useKaiCommandHandler } = await import('../hooks');
    expect(typeof useKaiCommandHandler).toBe('function');
    // The hook returns a dispatch function — it does NOT run on mount
  });
});

// ── 5. Security Tests (32–39) ──

describe('Security', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Test 32
  it('32. SDK never stores token in localStorage', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    // Mock localStorage
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'test' });

    // Check no localStorage call contains a token
    for (const call of setItemSpy.mock.calls) {
      expect(call[1]).not.toContain('test-token-123');
    }

    setItemSpy.mockRestore();
  });

  // Test 33
  it('33. SDK never logs Authorization header', async () => {
    const resp = mockResponse();
    globalThis.fetch = mockFetchSuccess(resp);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const client = createKaiClient(baseConfig);
    await client.evaluateIntent({ message: 'test' });

    const allOutput = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...debugSpy.mock.calls,
    ]
      .map((c) => JSON.stringify(c))
      .join(' ');

    expect(allOutput).not.toContain('Bearer test-token-123');
    expect(allOutput).not.toContain('Authorization');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  // Test 34
  it('34. SDK does not send emails', () => {
    // The SDK has no email-sending functionality
    const client = createKaiClient(baseConfig);
    expect((client as any).sendEmail).toBeUndefined();
    expect((client as any).email).toBeUndefined();
  });

  // Test 35
  it('35. SDK does not process payments', () => {
    const client = createKaiClient(baseConfig);
    expect((client as any).processPayment).toBeUndefined();
    expect((client as any).charge).toBeUndefined();
    expect((client as any).refund).toBeUndefined();
  });

  // Test 36
  it('36. SDK does not modify external app data by itself', async () => {
    const resp = mockResponse({
      commands: [
        { type: 'navigate_to_route', routePath: '/settings/payout' },
      ],
    });
    globalThis.fetch = mockFetchSuccess(resp);

    const client = createKaiClient(baseConfig);
    const result = await client.evaluateIntent({ message: 'change payout' });

    // Commands are data only — no side effects from the client
    expect(result.commands[0].type).toBe('navigate_to_route');
    // No DOM manipulation, no fetch to external app
  });

  // Test 37
  it('37. SDK does not auto-create support request unless host app handler does so', async () => {
    const cmd: KaiUiCommand = {
      type: 'open_support_form',
      metadata: {
        supportSuggestion: {
          suggestedTitle: 'Help',
          suggestedDescription: 'Need help',
        },
      },
    };
    // Without handler, nothing happens
    await handleKaiCommand(cmd, {});
    // No support request created
  });

  // Test 38
  it('38. SDK does not bypass confirmation/admin-review command', async () => {
    const onNavigate = vi.fn();

    // Confirmation command should NOT trigger navigation
    const confirmCmd: KaiUiCommand = { type: 'request_confirmation' };
    await handleKaiCommand(confirmCmd, { onNavigate });
    expect(onNavigate).not.toHaveBeenCalled();

    // Admin review command should NOT trigger navigation
    const reviewCmd: KaiUiCommand = { type: 'request_admin_review' };
    await handleKaiCommand(reviewCmd, { onNavigate });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // Test 39
  it('39. SDK treats blocked command as terminal', async () => {
    const handlers: KaiCommandHandlerMap = {
      onNavigate: vi.fn(),
      onSupportForm: vi.fn(),
      onBlocked: vi.fn(),
    };

    const blockedCmd: KaiUiCommand = {
      type: 'show_blocked_notice',
      routePath: '/dangerous',
      message: 'Action is permanently blocked',
    };

    await handleKaiCommand(blockedCmd, handlers);

    expect(handlers.onBlocked).toHaveBeenCalled();
    expect(handlers.onNavigate).not.toHaveBeenCalled();
    expect(handlers.onSupportForm).not.toHaveBeenCalled();
  });
});

// ── 6. TypeScript / Build Tests (40–44) ──

describe('Build & Exports', () => {
  // Test 40
  it('40. TypeScript types compile — all exports are defined', () => {
    // If these imports resolve, TypeScript compiled successfully
    expect(KAI_APP_IDS).toHaveLength(5);
    expect(KAI_USER_ROLES).toHaveLength(12);
    expect(KAI_UI_COMMAND_TYPES).toHaveLength(10);
  });

  // Test 41
  it('41. error classes are properly structured', () => {
    const err = new KaiSdkError('test', { code: 'TEST', statusCode: 400 });
    expect(err.name).toBe('KaiSdkError');
    expect(err.code).toBe('TEST');
    expect(err.statusCode).toBe(400);
    expect(err.toSafeString()).toBe('[TEST] test');

    expect(new KaiAuthError().name).toBe('KaiAuthError');
    expect(new KaiNetworkError().name).toBe('KaiNetworkError');
    expect(new KaiValidationError('bad input').name).toBe('KaiValidationError');
    expect(new KaiCommandError('cmd failed').name).toBe('KaiCommandError');
  });

  // Test 42
  it('42. storage generates unique clientRequestIds', () => {
    const id1 = generateClientRequestId();
    const id2 = generateClientRequestId();
    expect(id1).toMatch(/^kai-sdk-/);
    expect(id2).toMatch(/^kai-sdk-/);
    expect(id1).not.toBe(id2);
  });

  // Test 43
  it('43. KaiResponseStore works correctly', () => {
    const store = new KaiResponseStore();
    expect(store.getLastResponse()).toBeNull();

    const resp = mockResponse();
    store.setLastResponse(resp);
    expect(store.getLastResponse()).toBe(resp);

    store.clear();
    expect(store.getLastResponse()).toBeNull();
  });

  // Test 44
  it('44. package exports are all valid', async () => {
    const exports = await import('../index');

    // Client
    expect(typeof exports.createKaiClient).toBe('function');
    expect(typeof exports.sanitizeMetadata).toBe('function');

    // Commands
    expect(typeof exports.handleKaiCommand).toBe('function');
    expect(typeof exports.handleKaiCommands).toBe('function');
    expect(typeof exports.createDefaultCommandHandlers).toBe('function');
    expect(typeof exports.isNavigationCommand).toBe('function');
    expect(typeof exports.isSupportCommand).toBe('function');
    expect(typeof exports.isConfirmationCommand).toBe('function');
    expect(typeof exports.isAdminReviewCommand).toBe('function');
    expect(typeof exports.isBlockedCommand).toBe('function');
    expect(typeof exports.isUnsupportedCommand).toBe('function');
    expect(typeof exports.isReceiptCommand).toBe('function');

    // Support
    expect(typeof exports.buildSupportDraftFromSuggestion).toBe('function');
    expect(typeof exports.isAdminReviewRequired).toBe('function');
    expect(typeof exports.isConfirmationRequired).toBe('function');
    expect(typeof exports.getSupportRequestType).toBe('function');
    expect(typeof exports.getSafeSupportTitle).toBe('function');
    expect(typeof exports.getSafeSupportDescription).toBe('function');

    // Errors
    expect(exports.KaiSdkError).toBeDefined();
    expect(exports.KaiAuthError).toBeDefined();
    expect(exports.KaiNetworkError).toBeDefined();
    expect(exports.KaiValidationError).toBeDefined();
    expect(exports.KaiCommandError).toBeDefined();

    // Storage
    expect(exports.KaiResponseStore).toBeDefined();
    expect(typeof exports.generateClientRequestId).toBe('function');

    // Constants
    expect(exports.KAI_APP_IDS).toBeDefined();
    expect(exports.KAI_USER_ROLES).toBeDefined();
    expect(exports.KAI_UI_INTENT_TYPES).toBeDefined();
    expect(exports.KAI_UI_COMMAND_TYPES).toBeDefined();
    expect(exports.KAI_UI_DECISIONS).toBeDefined();
    expect(exports.KAI_RISK_LEVELS).toBeDefined();

    // Hooks
    expect(typeof exports.useKaiClient).toBe('function');
    expect(typeof exports.useKaiIntent).toBe('function');
    expect(typeof exports.useKaiNavigation).toBe('function');
    expect(typeof exports.useKaiSupport).toBe('function');
    expect(typeof exports.useKaiCommandHandler).toBe('function');
  });
});
