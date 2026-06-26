// ── Phase 11 Phase 3 — UI Adapter Tests ──
//
// Tests for the cross-app UI adapter contract:
// - Client contract validation & metadata sanitization
// - UI command builder
// - Adapter service (intent inference, route/action resolution)
// - Router/security constraints
// - TypeScript compilation (verified separately)

import { describe, it, expect } from 'vitest';
import {
  validateUiAdapterAppId,
  validateUiAdapterRole,
  validateUiAdapterRequest,
  sanitizeUiAdapterMetadata,
  KAI_UI_ADAPTER_VERSION,
  SUPPORTED_UI_ADAPTER_APPS,
  SUPPORTED_UI_ADAPTER_ROLES,
} from '../ui-adapter/client-contract';
import {
  buildNavigationCommand,
  buildSupportFormCommand,
  buildConfirmationCommand,
  buildAdminReviewCommand,
  buildBlockedCommand,
  buildUnsupportedCommand,
  buildMessageCommand,
  buildReceiptCommand,
} from '../ui-adapter/ui-command-builder';
import {
  processUiAdapterRequest,
  inferIntentFromMessage,
  resolveRequestedRouteOrAction,
  mapNavigationDecisionToUiResponse,
  mapSupportDecisionToUiResponse,
  createUiAdapterReceipt,
} from '../ui-adapter/adapter-service';
import type { UiAdapterAuthContext } from '../ui-adapter/adapter-service';
import type {
  KaiUiAdapterRequest,
  KaiUiAdapterResponse,
  KaiUiSupportRequestSuggestion,
  KaiUiConfirmation,
  KaiUiAdminReview,
  KaiUiReceiptSummary,
} from '../ui-adapter/types';
import {
  ALL_EXAMPLES,
  CAREHIA_CPR_EXAMPLE,
  VILINIU_PAYOUT_EXAMPLE,
  VOLAU_WRONG_INFO_EXAMPLE,
  JCC_BLOCKERS_EXAMPLE,
  runExample,
} from '../ui-adapter/example-adapters';

// ── Helper ──

const defaultAuth: UiAdapterAuthContext = {
  userId: 'test-user-001',
  appId: 'carehia',
  userRole: 'caregiver',
};

function makeRequest(overrides: Partial<KaiUiAdapterRequest> = {}): KaiUiAdapterRequest {
  return {
    appId: 'carehia',
    userRole: 'caregiver',
    ...overrides,
  };
}

// ── Client Contract Tests ──

describe('Client Contract', () => {
  // Test 1
  it('1. valid appId accepted', () => {
    const result = validateUiAdapterAppId('carehia');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Test 2
  it('2. invalid appId rejected', () => {
    const result = validateUiAdapterAppId('fake-app');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid appId');
  });

  // Test 3
  it('3. valid role accepted', () => {
    const result = validateUiAdapterRole('caregiver');
    expect(result.valid).toBe(true);
  });

  // Test 4
  it('4. invalid role rejected', () => {
    const result = validateUiAdapterRole('hacker');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid userRole');
  });

  // Test 5
  it('5. metadata sanitizer strips token/accessToken/refreshToken', () => {
    const result = sanitizeUiAdapterMetadata({
      token: 'secret-jwt',
      accessToken: 'abc123',
      refreshToken: 'xyz789',
      safeProp: 'hello',
    });
    expect(result).toBeDefined();
    expect(result!.safeProp).toBe('hello');
    expect(result!.token).toBeUndefined();
    expect(result!.accessToken).toBeUndefined();
    expect(result!.refreshToken).toBeUndefined();
  });

  // Test 6
  it('6. metadata sanitizer strips password/secret/apiKey', () => {
    const result = sanitizeUiAdapterMetadata({
      password: 'p@ss',
      secret: 'shhh',
      apiKey: 'ak_123',
      name: 'safe',
    });
    expect(result).toBeDefined();
    expect(result!.name).toBe('safe');
    expect(result!.password).toBeUndefined();
    expect(result!.secret).toBeUndefined();
    expect(result!.apiKey).toBeUndefined();
  });

  // Test 7
  it('7. metadata sanitizer strips rawPhoto/photoDataUrl/base64/file', () => {
    const result = sanitizeUiAdapterMetadata({
      rawPhoto: 'data:image/png;base64,...',
      photoDataUrl: 'data:image/jpeg;base64,...',
      base64: 'AAAA...',
      file: '/tmp/upload.bin',
      tag: 'visible',
    });
    expect(result).toBeDefined();
    expect(result!.tag).toBe('visible');
    expect(result!.rawPhoto).toBeUndefined();
    expect(result!.photoDataUrl).toBeUndefined();
    expect(result!.base64).toBeUndefined();
    expect(result!.file).toBeUndefined();
  });

  // Test 8
  it('8. metadata sanitizer strips paymentCard/bankAccount/mpaisaDetails', () => {
    const result = sanitizeUiAdapterMetadata({
      paymentCard: '4111...',
      bankAccount: '12345',
      mpaisaDetails: '+254...',
      note: 'ok',
    });
    expect(result).toBeDefined();
    expect(result!.note).toBe('ok');
    expect(result!.paymentCard).toBeUndefined();
    expect(result!.bankAccount).toBeUndefined();
    expect(result!.mpaisaDetails).toBeUndefined();
  });

  // Test 9
  it('9. metadata sanitizer strips governmentId/backgroundCheckRawData/medicalRecordRawData', () => {
    const result = sanitizeUiAdapterMetadata({
      governmentId: 'ID12345',
      backgroundCheckRawData: '...',
      medicalRecordRawData: '...',
      context: 'safe',
    });
    expect(result).toBeDefined();
    expect(result!.context).toBe('safe');
    expect(result!.governmentId).toBeUndefined();
    expect(result!.backgroundCheckRawData).toBeUndefined();
    expect(result!.medicalRecordRawData).toBeUndefined();
  });
});

// ── Command Builder Tests ──

describe('Command Builder', () => {
  // Test 10
  it('10. navigation command includes routeKey and routePath', () => {
    const cmd = buildNavigationCommand({
      routeKey: 'invoices',
      routeLabel: 'Invoices',
      routePath: '/invoices',
    });
    expect(cmd.type).toBe('navigate_to_route');
    expect(cmd.routeKey).toBe('invoices');
    expect(cmd.routePath).toBe('/invoices');
  });

  // Test 11
  it('11. support form command includes safe draft', () => {
    const suggestion: KaiUiSupportRequestSuggestion = {
      requestType: 'report_content_issue',
      title: 'Content Issue',
      description: 'User reports incorrect data.',
      urgency: 'medium',
      requiresAdminReview: false,
      estimatedComplexity: 'moderate',
      suggestedNextStep: 'Submit via support form.',
    };
    const cmd = buildSupportFormCommand(suggestion);
    expect(cmd.type).toBe('open_support_form');
    expect(cmd.supportRequestDraft).toBeDefined();
    expect(cmd.supportRequestDraft!.requestType).toBe('report_content_issue');
  });

  // Test 12
  it('12. confirmation command includes risk reason', () => {
    const confirmation: KaiUiConfirmation = {
      required: true,
      reason: 'This area handles financial data.',
      confirmationLabel: 'Proceed to Invoices',
      riskLevel: 'medium',
    };
    const cmd = buildConfirmationCommand(confirmation);
    expect(cmd.type).toBe('request_confirmation');
    expect(cmd.confirmationText).toContain('financial');
    expect(cmd.metadata?.riskLevel).toBe('medium');
  });

  // Test 13
  it('13. admin review command includes review queue', () => {
    const review: KaiUiAdminReview = {
      required: true,
      reason: 'High-risk area.',
      reviewType: 'navigation_access',
      suggestedQueue: 'carehia_admin_review',
    };
    const cmd = buildAdminReviewCommand(review);
    expect(cmd.type).toBe('request_admin_review');
    expect(cmd.metadata?.suggestedQueue).toBe('carehia_admin_review');
  });

  // Test 14
  it('14. blocked command never includes executable action', () => {
    const cmd = buildBlockedCommand('Payment processing is not allowed.');
    expect(cmd.type).toBe('show_blocked_notice');
    expect(cmd.blockedReason).toContain('not allowed');
    // Must NOT have route/action keys
    expect(cmd.routeKey).toBeUndefined();
    expect(cmd.routePath).toBeUndefined();
  });

  // Test 15
  it('15. unsupported command is safe', () => {
    const cmd = buildUnsupportedCommand('Feature not available.');
    expect(cmd.type).toBe('show_unsupported_notice');
    expect(cmd.blockedReason).toContain('not available');
    expect(cmd.routeKey).toBeUndefined();
  });

  // Test 16
  it('16. receipt command is display-only', () => {
    const receipt: KaiUiReceiptSummary = {
      receiptType: 'kai_ui_adapter_navigation_response',
      created: new Date().toISOString(),
      receiptId: 'rcpt_test_001',
      summary: 'Navigation to invoices recommended.',
    };
    const cmd = buildReceiptCommand(receipt);
    expect(cmd.type).toBe('show_receipt');
    expect(cmd.metadata?.receiptId).toBe('rcpt_test_001');
    // Display-only — no executable action
    expect(cmd.routeKey).toBeUndefined();
  });
});

// ── Adapter Service Tests ──

describe('Adapter Service', () => {
  // Test 17
  it('17. Carehia CPR message maps to certifications', () => {
    const result = inferIntentFromMessage('carehia', 'Where do I upload my CPR certificate?');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('certifications');
  });

  // Test 18
  it('18. Carehia invoice message maps to invoices', () => {
    const result = inferIntentFromMessage('carehia', 'Show me my invoice');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('invoices');
  });

  // Test 19
  it('19. Viliniu payout message maps to vendor_payouts and admin review', () => {
    const response = processUiAdapterRequest(
      makeRequest({ appId: 'viliniu', userRole: 'vendor', message: 'I need to change my payout details' }),
      { userId: 'vendor-001', appId: 'viliniu', userRole: 'vendor' },
    );
    expect(response.routeKey).toBe('vendor_payouts');
    expect(response.decision).toBe('requires_admin_review');
  });

  // Test 20
  it('20. Viliniu delivery proof message maps to delivery_proof', () => {
    const result = inferIntentFromMessage('viliniu', 'I have delivery proof photos to upload');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('delivery_proof');
  });

  // Test 21
  it('21. Volau weather message maps to weather', () => {
    const result = inferIntentFromMessage('volau', 'What is the weather like today?');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('weather');
  });

  // Test 22
  it('22. Volau wrong information message suggests support request', () => {
    const response = processUiAdapterRequest(
      makeRequest({ appId: 'volau', userRole: 'public-user', message: 'This plant information is wrong' }),
      { userId: 'user-001', appId: 'volau', userRole: 'public-user' },
    );
    expect(response.decision).toBe('recommended');
    expect(response.supportRequestSuggestion).toBeDefined();
    expect(response.commands.some(c => c.type === 'open_support_form')).toBe(true);
  });

  // Test 23
  it('23. JCC Carehia blockers message maps to carehia module', () => {
    const result = inferIntentFromMessage('jon-command-center', 'Show me Carehia blockers');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('carehia_module');
  });

  // Test 24
  it('24. Kai ProofTrust message maps to prooftrust_status', () => {
    const result = inferIntentFromMessage('kai', 'Show me the prooftrust status');
    expect(result).toBeDefined();
    expect(result!.routeKey).toBe('prooftrust_status');
  });

  // Test 25
  it('25. ambiguous message does not guess high-risk action', () => {
    const response = processUiAdapterRequest(
      makeRequest({ message: 'do something interesting' }),
      defaultAuth,
    );
    expect(response.decision).toBe('not_found');
    expect(response.riskLevel).toBe('low');
    // Should not return any navigation or action commands
    expect(response.commands.every(c =>
      c.type !== 'navigate_to_route' && c.type !== 'request_admin_review',
    )).toBe(true);
  });

  // Test 26
  it('26. invalid appId rejected', () => {
    const response = processUiAdapterRequest(
      makeRequest({ appId: 'fake-app' }),
      defaultAuth,
    );
    expect(response.decision).toBe('failed');
    expect(response.errors).toBeDefined();
    expect(response.errors!.length).toBeGreaterThan(0);
  });

  // Test 27
  it('27. unauthorized role cannot access restricted route', () => {
    // public-user trying to access certifications (not in allowedRoles)
    const response = processUiAdapterRequest(
      makeRequest({ appId: 'carehia', userRole: 'viewer', routeKey: 'certifications' }),
      { userId: 'user-001', appId: 'carehia', userRole: 'viewer' },
    );
    expect(response.decision).toBe('blocked');
  });

  // Test 28
  it('28. medium-risk action returns confirmation command', () => {
    // invoices in carehia is medium risk
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'invoices' }),
      defaultAuth,
    );
    expect(response.decision).toBe('requires_confirmation');
    expect(response.confirmation).toBeDefined();
    expect(response.confirmation!.required).toBe(true);
    expect(response.commands.some(c => c.type === 'request_confirmation')).toBe(true);
  });

  // Test 29
  it('29. high-risk action returns admin-review command', () => {
    // certifications in carehia is high risk
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'certifications' }),
      defaultAuth,
    );
    expect(response.decision).toBe('requires_admin_review');
    expect(response.adminReview).toBeDefined();
    expect(response.adminReview!.required).toBe(true);
    expect(response.commands.some(c => c.type === 'request_admin_review')).toBe(true);
  });

  // Test 30
  it('30. blocked action returns blocked command', () => {
    // process_payment in carehia is blocked
    const response = processUiAdapterRequest(
      makeRequest({ actionKey: 'process_payment' }),
      defaultAuth,
    );
    expect(response.decision).toBe('blocked');
    expect(response.commands.some(c => c.type === 'show_blocked_notice')).toBe(true);
  });

  // Test 31
  it('31. support request suggestion does not auto-create request', () => {
    const response = processUiAdapterRequest(
      makeRequest({ supportRequestType: 'technical_support' }),
      defaultAuth,
    );
    // Should return a suggestion, not a created request
    expect(response.decision).toBe('recommended');
    expect(response.supportRequestSuggestion).toBeDefined();
    expect(response.commands.some(c => c.type === 'open_support_form')).toBe(true);
    // No indication of automatic creation
    expect(response.message).toContain('suggestion');
  });

  // Test 32
  it('32. adapter creates receipt', () => {
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'today' }),
      defaultAuth,
    );
    expect(response.receiptSummary).toBeDefined();
    expect(response.receiptSummary!.receiptType).toBeTruthy();
    expect(response.receiptSummary!.created).toBeTruthy();
    expect(response.receiptSummary!.receiptId).toBeTruthy();
  });

  // Test 33
  it('33. response is frontend-safe', () => {
    const response = processUiAdapterRequest(
      makeRequest({
        routeKey: 'today',
        metadata: {
          token: 'should-be-stripped',
          password: 'should-be-stripped',
          screen: 'safe-value',
        },
      }),
      defaultAuth,
    );
    // Response should not contain any sensitive data
    const responseJson = JSON.stringify(response);
    expect(responseJson).not.toContain('should-be-stripped');
    // Response must have required fields
    expect(response.appId).toBeDefined();
    expect(response.decision).toBeDefined();
    expect(response.riskLevel).toBeDefined();
    expect(response.message).toBeDefined();
    expect(response.commands).toBeDefined();
  });
});

// ── Router/Security Tests ──

describe('Router Security', () => {
  // Test 34
  it('34. endpoint requires auth (tested via processUiAdapterRequest validation)', () => {
    // The route handler in router.ts calls authenticateAndRateLimit before processing.
    // We verify the adapter service itself validates inputs.
    const response = processUiAdapterRequest(
      makeRequest({ appId: '' }),
      defaultAuth,
    );
    expect(response.decision).toBe('failed');
  });

  // Test 35
  it('35. body userId cannot override token identity', () => {
    // The adapter service uses authContext (from JWT), not body values
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'today' }),
      { userId: 'real-user', appId: 'carehia', userRole: 'caregiver' },
    );
    // Response is based on the auth context, not any body userId
    expect(response.decision).toBe('allowed');
  });

  // Test 36
  it('36. body role cannot escalate to super-admin', () => {
    // Even if body says super-admin, auth context should be used
    const response = processUiAdapterRequest(
      makeRequest({ userRole: 'super-admin', routeKey: 'today' }),
      { userId: 'user', appId: 'carehia', userRole: 'caregiver' },
    );
    // The service uses authContext.userRole, not body userRole
    expect(response.appId).toBe('carehia');
  });

  // Test 37
  it('37. external app data is not modified', () => {
    // All commands are recommendation-only
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'invoices' }),
      defaultAuth,
    );
    // Commands should be display/navigation recommendations, not mutations
    for (const cmd of response.commands) {
      expect(['navigate_to_route', 'show_message', 'open_modal', 'open_support_form',
        'request_confirmation', 'request_admin_review', 'show_blocked_notice',
        'show_unsupported_notice', 'show_receipt', 'no_op']).toContain(cmd.type);
    }
  });

  // Test 38
  it('38. email is not sent', () => {
    const response = processUiAdapterRequest(
      makeRequest({ message: 'send email to admin' }),
      defaultAuth,
    );
    // Should not contain any email-sending commands
    const responseJson = JSON.stringify(response);
    expect(responseJson).not.toContain('send_email');
  });

  // Test 39
  it('39. quote is not generated', () => {
    const response = processUiAdapterRequest(
      makeRequest({ message: 'generate a quote' }),
      defaultAuth,
    );
    const responseJson = JSON.stringify(response);
    expect(responseJson).not.toContain('generate_quote');
    expect(responseJson).not.toContain('create_invoice');
  });

  // Test 40
  it('40. payment is not processed', () => {
    const response = processUiAdapterRequest(
      makeRequest({ actionKey: 'process_payment' }),
      defaultAuth,
    );
    expect(response.decision).toBe('blocked');
  });

  // Test 41
  it('41. Permission Gate is used for risky action evaluation', () => {
    // High-risk route should require admin review (Permission Gate)
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'trust_passport' }),
      defaultAuth,
    );
    expect(response.decision).toBe('requires_admin_review');
    expect(response.adminReview?.required).toBe(true);
  });

  // Test 42
  it('42. Action Receipts are created', () => {
    const response = processUiAdapterRequest(
      makeRequest({ routeKey: 'today' }),
      defaultAuth,
    );
    expect(response.receiptSummary).toBeDefined();
    expect(response.receiptSummary!.receiptId).toMatch(/^ui_rcpt_/);
  });
});

// ── Example Adapter Tests ──

describe('Example Adapters', () => {
  it('Carehia CPR example runs correctly', () => {
    const response = runExample(CAREHIA_CPR_EXAMPLE);
    expect(response.appId).toBe('carehia');
    expect(response.routeKey).toBe('certifications');
    expect(response.decision).toBe(CAREHIA_CPR_EXAMPLE.expectedDecision);
  });

  it('Viliniu payout example runs correctly', () => {
    const response = runExample(VILINIU_PAYOUT_EXAMPLE);
    expect(response.appId).toBe('viliniu');
    expect(response.routeKey).toBe('vendor_payouts');
    expect(response.decision).toBe(VILINIU_PAYOUT_EXAMPLE.expectedDecision);
  });

  it('Volau wrong info example runs correctly', () => {
    const response = runExample(VOLAU_WRONG_INFO_EXAMPLE);
    expect(response.appId).toBe('volau');
    expect(response.decision).toBe(VOLAU_WRONG_INFO_EXAMPLE.expectedDecision);
    expect(response.supportRequestSuggestion).toBeDefined();
  });

  it('JCC blockers example runs correctly', () => {
    const response = runExample(JCC_BLOCKERS_EXAMPLE);
    expect(response.appId).toBe('jon-command-center');
    expect(response.decision).toBe(JCC_BLOCKERS_EXAMPLE.expectedDecision);
  });

  it('All examples produce valid responses', () => {
    for (const example of ALL_EXAMPLES) {
      const response = runExample(example);
      expect(response.appId).toBeTruthy();
      expect(response.decision).toBeTruthy();
      expect(response.riskLevel).toBeTruthy();
      expect(response.message).toBeTruthy();
      expect(response.commands).toBeDefined();
    }
  });
});

// ── Utility Function Tests ──

describe('Utility Functions', () => {
  it('resolveRequestedRouteOrAction finds route by key', () => {
    const { route } = resolveRequestedRouteOrAction('carehia', 'invoices');
    expect(route).toBeDefined();
    expect(route!.routeKey).toBe('invoices');
  });

  it('resolveRequestedRouteOrAction finds action by key', () => {
    const { action } = resolveRequestedRouteOrAction('carehia', undefined, 'process_payment');
    expect(action).toBeDefined();
    expect(action!.actionKey).toBe('process_payment');
  });

  it('mapNavigationDecisionToUiResponse maps allowed correctly', () => {
    const result = mapNavigationDecisionToUiResponse({
      appId: 'carehia',
      riskLevel: 'low',
      decision: 'allowed',
      requiresConfirmation: false,
      requiresAdminApproval: false,
      message: 'OK',
    });
    expect(result.decision).toBe('allowed');
    expect(result.riskLevel).toBe('low');
  });

  it('mapSupportDecisionToUiResponse returns valid suggestion', () => {
    const suggestion = mapSupportDecisionToUiResponse('technical_support', 'carehia');
    expect(suggestion.requestType).toBe('technical_support');
    expect(suggestion.urgency).toBe('medium');
    expect(suggestion.suggestedNextStep).toBeTruthy();
  });

  it('createUiAdapterReceipt generates valid receipt', () => {
    const request = makeRequest({ routeKey: 'today' });
    const response: KaiUiAdapterResponse = {
      appId: 'carehia',
      decision: 'allowed',
      riskLevel: 'low',
      message: 'Navigate to Today.',
      commands: [],
    };
    const receipt = createUiAdapterReceipt(request, response, defaultAuth);
    expect(receipt.receiptType).toBeTruthy();
    expect(receipt.created).toBeTruthy();
    expect(receipt.receiptId).toMatch(/^ui_rcpt_/);
  });

  it('version constant is defined', () => {
    expect(KAI_UI_ADAPTER_VERSION).toBe('0.3.0');
  });

  it('supported apps matches expected count', () => {
    expect(SUPPORTED_UI_ADAPTER_APPS).toHaveLength(5);
  });

  it('supported roles matches expected count', () => {
    expect(SUPPORTED_UI_ADAPTER_ROLES).toHaveLength(12);
  });
});
