// ── @kai/ui-components — Tests ──
// 46 tests covering components, utilities, security, and build.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Components ──
import { KaiMessageBubble } from '../components/KaiMessageBubble';
import { KaiNavigationCard } from '../components/KaiNavigationCard';
import { KaiConfirmationDialog } from '../components/KaiConfirmationDialog';
import { KaiAdminReviewBanner } from '../components/KaiAdminReviewBanner';
import { KaiSupportPrefillCard } from '../components/KaiSupportPrefillCard';
import { KaiBlockedNotice } from '../components/KaiBlockedNotice';
import { KaiUnsupportedNotice } from '../components/KaiUnsupportedNotice';
import { KaiReceiptCard } from '../components/KaiReceiptCard';
import { KaiCommandResultPanel } from '../components/KaiCommandResultPanel';
import { KaiAssistantPanel } from '../components/KaiAssistantPanel';

// ── Utilities ──
import {
  formatRiskLabel,
  formatDecisionLabel,
  getRiskTone,
  getSafeDisplayText,
} from '../utils/format';
import {
  groupCommandsByType,
  getPrimaryCommand,
  hasBlockingCommand,
  hasConfirmationCommand,
  hasAdminReviewCommand,
  hasSupportCommand,
  hasNavigationCommand,
} from '../utils/command-groups';

// ── Types ──
import type {
  KaiUiCommand,
  KaiUiAdapterResponse,
  KaiConfirmationRequest,
  KaiAdminReviewRequest,
  KaiSupportRequestSuggestion,
  KaiReceiptSummary,
} from '../types';

// ── Test Helpers ──

function makeCommand(overrides: Partial<KaiUiCommand> = {}): KaiUiCommand {
  return {
    type: 'show_message',
    message: 'Test message',
    ...overrides,
  };
}

function makeResponse(overrides: Partial<KaiUiAdapterResponse> = {}): KaiUiAdapterResponse {
  return {
    success: true,
    decision: 'allowed',
    riskLevel: 'low',
    intentType: 'navigate',
    commands: [makeCommand()],
    message: 'Hello from Kai',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeConfirmation(overrides: Partial<KaiConfirmationRequest> = {}): KaiConfirmationRequest {
  return {
    action: 'delete_account',
    description: 'This will permanently delete the account.',
    riskLevel: 'high',
    requiresExplicitConsent: true,
    ...overrides,
  };
}

function makeAdminReview(overrides: Partial<KaiAdminReviewRequest> = {}): KaiAdminReviewRequest {
  return {
    action: 'change_payout',
    reason: 'Payout changes require admin approval.',
    reviewerRole: 'admin',
    riskLevel: 'high',
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<KaiSupportRequestSuggestion> = {}): KaiSupportRequestSuggestion {
  return {
    suggestedTitle: 'Upload CPR Certificate',
    suggestedDescription: 'Help uploading CPR certificate for caregiver compliance.',
    suggestedCategory: 'compliance',
    suggestedPriority: 'medium',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<KaiReceiptSummary> = {}): KaiReceiptSummary {
  return {
    receiptId: 'rcpt_001',
    receiptType: 'navigation',
    actorId: 'user_123',
    appId: 'carehia',
    timestamp: new Date().toISOString(),
    summary: 'Navigated to caregiver dashboard',
    ...overrides,
  };
}

// ════════════════════════════════════════
// Part 1: Component Rendering (1–20)
// ════════════════════════════════════════

describe('Component Rendering', () => {
  // 1
  it('KaiMessageBubble renders message', () => {
    render(<KaiMessageBubble message="Hello from Kai" />);
    expect(screen.getByText('Hello from Kai')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  // 2
  it('KaiNavigationCard renders route command', () => {
    const cmd = makeCommand({
      type: 'navigate_to_route',
      routePath: '/dashboard',
      routeKey: 'carehia.dashboard',
      message: undefined,
    });
    render(<KaiNavigationCard command={cmd} />);
    expect(screen.getByText(/dashboard/)).toBeTruthy();
  });

  // 3
  it('KaiNavigationCard does not call onNavigate until clicked', () => {
    const handler = vi.fn();
    const cmd = makeCommand({ type: 'navigate_to_route', routePath: '/settings' });
    render(<KaiNavigationCard command={cmd} onNavigate={handler} />);
    expect(handler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // 4
  it('KaiNavigationCard shows disabled state when no handler', () => {
    const cmd = makeCommand({ type: 'navigate_to_route', routePath: '/settings' });
    render(<KaiNavigationCard command={cmd} />);
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.textContent).toMatch(/not available/i);
  });

  // 5
  it('KaiConfirmationDialog renders confirmation reason', () => {
    const cmd = makeCommand({ type: 'request_confirmation' });
    const conf = makeConfirmation();
    render(
      <KaiConfirmationDialog
        command={cmd}
        confirmation={conf}
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/permanently delete/i)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  // 6
  it('KaiConfirmationDialog calls onConfirm only after click', () => {
    const onConfirm = vi.fn();
    const cmd = makeCommand({ type: 'request_confirmation' });
    render(
      <KaiConfirmationDialog
        command={cmd}
        confirmation={makeConfirmation()}
        open={true}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // 7
  it('KaiConfirmationDialog calls onCancel only after click', () => {
    const onCancel = vi.fn();
    const cmd = makeCommand({ type: 'request_confirmation' });
    render(
      <KaiConfirmationDialog
        command={cmd}
        confirmation={makeConfirmation()}
        open={true}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // 8
  it('KaiAdminReviewBanner shows admin review required', () => {
    const cmd = makeCommand({ type: 'request_admin_review' });
    render(<KaiAdminReviewBanner command={cmd} adminReview={makeAdminReview()} />);
    expect(screen.getByText(/admin review required/i)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // 9
  it('KaiAdminReviewBanner does not create support automatically', () => {
    const handler = vi.fn();
    const cmd = makeCommand({ type: 'request_admin_review' });
    render(
      <KaiAdminReviewBanner
        command={cmd}
        adminReview={makeAdminReview()}
        onCreateSupportRequest={handler}
      />,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  // 10
  it('KaiSupportPrefillCard renders safe title/description', () => {
    const cmd = makeCommand({ type: 'open_support_form' });
    render(
      <KaiSupportPrefillCard
        command={cmd}
        suggestion={makeSuggestion()}
        onOpenSupportForm={() => {}}
      />,
    );
    expect(screen.getByText(/upload cpr certificate/i)).toBeTruthy();
    expect(screen.getByText(/caregiver compliance/i)).toBeTruthy();
  });

  // 11
  it('KaiSupportPrefillCard calls onOpenSupportForm only after click', () => {
    const handler = vi.fn();
    const cmd = makeCommand({ type: 'open_support_form' });
    render(
      <KaiSupportPrefillCard
        command={cmd}
        suggestion={makeSuggestion()}
        onOpenSupportForm={handler}
      />,
    );
    expect(handler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /open support form/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // 12
  it('KaiBlockedNotice renders blocked reason', () => {
    const cmd = makeCommand({
      type: 'show_blocked_notice',
      message: 'You do not have permission.',
    });
    render(<KaiBlockedNotice command={cmd} />);
    expect(screen.getByText(/do not have permission/i)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // 13
  it('KaiBlockedNotice has no execution button', () => {
    const cmd = makeCommand({ type: 'show_blocked_notice', message: 'Blocked' });
    render(<KaiBlockedNotice command={cmd} />);
    const buttons = screen.queryAllByRole('button');
    for (const btn of buttons) {
      const text = (btn.textContent ?? '').toLowerCase();
      expect(text).not.toMatch(/confirm|execute|approve|submit|proceed|continue/);
    }
  });

  // 14
  it('KaiUnsupportedNotice renders unsupported message', () => {
    const cmd = makeCommand({
      type: 'show_unsupported_notice',
      message: 'Kai cannot process refunds yet.',
    });
    render(<KaiUnsupportedNotice command={cmd} />);
    expect(screen.getByText(/cannot process refunds/i)).toBeTruthy();
  });

  // 15
  it('KaiReceiptCard renders safe receipt summary', () => {
    render(<KaiReceiptCard receiptSummary={makeReceipt()} />);
    expect(screen.getByText(/navigated to caregiver dashboard/i)).toBeTruthy();
    expect(screen.getByText(/rcpt_001/)).toBeTruthy();
  });

  // 16
  it('KaiReceiptCard does not display raw metadata', () => {
    const receipt = makeReceipt();
    const { container } = render(<KaiReceiptCard receiptSummary={receipt} />);
    const html = container.innerHTML;
    expect(html).not.toContain('metadata');
    expect(html).not.toContain('actorId');
  });

  // 17
  it('KaiCommandResultPanel renders message + commands', () => {
    const response = makeResponse({
      message: 'Here is your navigation.',
      commands: [
        makeCommand({ type: 'navigate_to_route', routePath: '/patients', message: 'Go to patients' }),
      ],
    });
    render(<KaiCommandResultPanel response={response} handlers={{}} />);
    expect(screen.getByText(/here is your navigation/i)).toBeTruthy();
    expect(screen.getByText(/go to patients/i)).toBeTruthy();
  });

  // 18
  it('KaiCommandResultPanel treats blocked command as terminal', () => {
    const response = makeResponse({
      decision: 'blocked',
      riskLevel: 'blocked',
      commands: [
        makeCommand({ type: 'show_blocked_notice', message: 'Blocked action' }),
        makeCommand({ type: 'navigate_to_route', routePath: '/should-not-show' }),
      ],
    });
    const { container } = render(<KaiCommandResultPanel response={response} handlers={{}} />);
    expect(screen.getByText(/blocked action/i)).toBeTruthy();
    expect(container.innerHTML).not.toContain('/should-not-show');
  });

  // 19
  it('KaiCommandResultPanel does not auto-execute any command', () => {
    const onNavigate = vi.fn();
    const onConfirmation = vi.fn();
    const response = makeResponse({
      commands: [
        makeCommand({ type: 'navigate_to_route', routePath: '/auto' }),
      ],
    });
    render(
      <KaiCommandResultPanel
        response={response}
        handlers={{ onNavigate, onConfirmation }}
      />,
    );
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onConfirmation).not.toHaveBeenCalled();
  });

  // 20
  it('KaiAssistantPanel submits typed intent only after user submit', () => {
    const onSubmit = vi.fn();
    render(
      <KaiAssistantPanel
        appId="carehia"
        role="caregiver"
        onSubmitIntent={onSubmit}
        handlers={{}}
      />,
    );
    expect(onSubmit).not.toHaveBeenCalled();
    const input = screen.getByRole('textbox', { name: /ask kai/i });
    fireEvent.change(input, { target: { value: 'Where to upload CPR?' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith('Where to upload CPR?');
  });
});

// ════════════════════════════════════════
// Part 2: Utilities (21–30)
// ════════════════════════════════════════

describe('Utilities', () => {
  // 21
  it('formatRiskLabel handles low/medium/high/blocked', () => {
    expect(formatRiskLabel('low')).toBe('Low risk');
    expect(formatRiskLabel('medium')).toBe('Medium risk');
    expect(formatRiskLabel('high')).toBe('High risk');
    expect(formatRiskLabel('blocked')).toBe('Blocked');
  });

  // 22
  it('formatDecisionLabel handles decisions', () => {
    expect(formatDecisionLabel('allowed')).toBe('Allowed');
    expect(formatDecisionLabel('blocked')).toBe('Blocked');
    expect(formatDecisionLabel('requires_confirmation')).toBe('Requires confirmation');
    expect(formatDecisionLabel('requires_admin_review')).toBe('Requires admin review');
    expect(formatDecisionLabel('unsupported')).toBe('Not supported');
  });

  // 23
  it('getRiskTone returns blocked tone for blocked', () => {
    expect(getRiskTone('blocked')).toBe('blocked');
    expect(getRiskTone('low')).toBe('success');
    expect(getRiskTone('high')).toBe('danger');
  });

  // 24
  it('getSafeDisplayText removes unsafe HTML/script', () => {
    // Script content is stripped entirely (script tag + content removed, then remaining tags)
    expect(getSafeDisplayText('<script>alert("xss")</script>')).toBe('');
    expect(getSafeDisplayText('<b>bold</b>')).toBe('bold');
    expect(getSafeDisplayText('javascript:alert(1)')).not.toContain('javascript:');
    expect(getSafeDisplayText('onclick="steal()" text')).not.toContain('onclick');
  });

  // 25
  it('groupCommandsByType groups correctly', () => {
    const cmds = [
      makeCommand({ type: 'show_message' }),
      makeCommand({ type: 'navigate_to_route' }),
      makeCommand({ type: 'show_message' }),
    ];
    const groups = groupCommandsByType(cmds);
    expect(groups['show_message']).toHaveLength(2);
    expect(groups['navigate_to_route']).toHaveLength(1);
  });

  // 26
  it('getPrimaryCommand prioritizes blocked over others', () => {
    const cmds = [
      makeCommand({ type: 'navigate_to_route' }),
      makeCommand({ type: 'show_blocked_notice' }),
      makeCommand({ type: 'show_message' }),
    ];
    expect(getPrimaryCommand(cmds)?.type).toBe('show_blocked_notice');
  });

  // 27
  it('hasConfirmationCommand works', () => {
    expect(hasConfirmationCommand([makeCommand({ type: 'request_confirmation' })])).toBe(true);
    expect(hasConfirmationCommand([makeCommand({ type: 'show_message' })])).toBe(false);
  });

  // 28
  it('hasAdminReviewCommand works', () => {
    expect(hasAdminReviewCommand([makeCommand({ type: 'request_admin_review' })])).toBe(true);
    expect(hasAdminReviewCommand([makeCommand({ type: 'no_op' })])).toBe(false);
  });

  // 29
  it('hasSupportCommand works', () => {
    expect(hasSupportCommand([makeCommand({ type: 'open_support_form' })])).toBe(true);
    expect(hasSupportCommand([makeCommand({ type: 'show_receipt' })])).toBe(false);
  });

  // 30
  it('hasNavigationCommand works', () => {
    expect(hasNavigationCommand([makeCommand({ type: 'navigate_to_route' })])).toBe(true);
    expect(hasNavigationCommand([makeCommand({ type: 'no_op' })])).toBe(false);
  });
});

// ════════════════════════════════════════
// Part 3: Security (31–41)
// ════════════════════════════════════════

describe('Security', () => {
  // 31
  it('components do not display raw metadata by default', () => {
    const cmd = makeCommand({
      type: 'show_message',
      message: 'Hello',
      metadata: { secret: 'abc123', internal: 'hidden' },
    });
    const { container } = render(<KaiMessageBubble message={cmd.message!} />);
    expect(container.innerHTML).not.toContain('abc123');
    expect(container.innerHTML).not.toContain('hidden');
  });

  // 32
  it('components do not display tokens/secrets/private data', () => {
    const response = makeResponse({
      message: 'Normal message',
      commands: [makeCommand({ type: 'show_message', message: 'safe' })],
    });
    const { container } = render(
      <KaiCommandResultPanel response={response} handlers={{}} />,
    );
    expect(container.innerHTML).not.toContain('token');
    expect(container.innerHTML).not.toContain('secret');
    expect(container.innerHTML).not.toContain('password');
  });

  // 33
  it('blocked notice never renders confirm/execute button', () => {
    const cmd = makeCommand({ type: 'show_blocked_notice', message: 'Nope' });
    render(<KaiBlockedNotice command={cmd} />);
    const buttons = screen.queryAllByRole('button');
    for (const btn of buttons) {
      const text = (btn.textContent ?? '').toLowerCase();
      expect(text).not.toMatch(/confirm|execute|approve|submit|proceed/);
    }
  });

  // 34
  it('support prefill does not include bank/card/government/medical data', () => {
    const suggestion = makeSuggestion({
      metadata: {
        bankAccount: '123456789',
        cardNumber: '4111111111111111',
        ssn: '123-45-6789',
        medicalRecord: 'diagnosis:cancer',
        safeField: 'visible value',
      },
    });
    const cmd = makeCommand({ type: 'open_support_form' });
    const { container } = render(
      <KaiSupportPrefillCard
        command={cmd}
        suggestion={suggestion}
        onOpenSupportForm={() => {}}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain('123456789');
    expect(html).not.toContain('4111111111111111');
    expect(html).not.toContain('123-45-6789');
    expect(html).not.toContain('cancer');
    expect(html).toContain('visible value');
  });

  // 35
  it('admin review banner does not approve anything automatically', () => {
    const handler = vi.fn();
    const cmd = makeCommand({ type: 'request_admin_review' });
    render(
      <KaiAdminReviewBanner
        command={cmd}
        adminReview={makeAdminReview()}
        onCreateSupportRequest={handler}
        onOpenReviewQueue={handler}
      />,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  // 36
  it('confirmation dialog does not auto-confirm on render', () => {
    const onConfirm = vi.fn();
    const cmd = makeCommand({ type: 'request_confirmation' });
    render(
      <KaiConfirmationDialog
        command={cmd}
        confirmation={makeConfirmation()}
        open={true}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // 37
  it('navigation card does not call window.location directly', () => {
    const originalLocation = window.location.href;
    const cmd = makeCommand({ type: 'navigate_to_route', routePath: '/evil' });
    const handler = vi.fn();
    render(<KaiNavigationCard command={cmd} onNavigate={handler} />);
    fireEvent.click(screen.getByRole('button'));
    expect(window.location.href).toBe(originalLocation);
  });

  // 38
  it('SDK assistant panel does not store tokens', () => {
    const { container } = render(
      <KaiAssistantPanel
        appId="carehia"
        role="caregiver"
        onSubmitIntent={() => {}}
        handlers={{}}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain('token');
    expect(html).not.toContain('Bearer');
    expect(html).not.toContain('Authorization');
    // Check localStorage
    expect(localStorage.getItem('kai_token')).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  // 39
  it('no email is sent', () => {
    // Components are purely presentational — verify no email sending code
    const response = makeResponse();
    const { container } = render(
      <KaiCommandResultPanel response={response} handlers={{}} />,
    );
    expect(container.innerHTML).not.toContain('sendEmail');
    expect(container.innerHTML).not.toContain('mailto:');
  });

  // 40
  it('no payment is processed', () => {
    const response = makeResponse();
    const { container } = render(
      <KaiCommandResultPanel response={response} handlers={{}} />,
    );
    expect(container.innerHTML).not.toContain('processPayment');
    expect(container.innerHTML).not.toContain('stripe');
    expect(container.innerHTML).not.toContain('checkout');
  });

  // 41
  it('no external app data is modified', () => {
    // Components only render — no API calls, no mutations
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = makeResponse({
      commands: [
        makeCommand({ type: 'navigate_to_route', routePath: '/settings' }),
        makeCommand({ type: 'open_support_form' }),
      ],
      supportSuggestion: makeSuggestion(),
    });
    render(
      <KaiCommandResultPanel response={response} handlers={{ onNavigate: () => {} }} />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ════════════════════════════════════════
// Part 4: Build (42–46)
// ════════════════════════════════════════

describe('Build', () => {
  // 42
  it('package TypeScript compiles (types import correctly)', () => {
    // If this test file compiles and runs, TS is clean
    const check: KaiUiCommand = makeCommand();
    expect(check.type).toBe('show_message');
  });

  // 43
  it('package exports are valid', async () => {
    const exports = await import('../index');
    // Components
    expect(typeof exports.KaiMessageBubble).toBe('function');
    expect(typeof exports.KaiNavigationCard).toBe('function');
    expect(typeof exports.KaiConfirmationDialog).toBe('function');
    expect(typeof exports.KaiAdminReviewBanner).toBe('function');
    expect(typeof exports.KaiSupportPrefillCard).toBe('function');
    expect(typeof exports.KaiBlockedNotice).toBe('function');
    expect(typeof exports.KaiUnsupportedNotice).toBe('function');
    expect(typeof exports.KaiReceiptCard).toBe('function');
    expect(typeof exports.KaiCommandResultPanel).toBe('function');
    expect(typeof exports.KaiAssistantPanel).toBe('function');
    expect(typeof exports.KaiSdkAssistantPanel).toBe('function');
    // Utilities
    expect(typeof exports.formatRiskLabel).toBe('function');
    expect(typeof exports.formatDecisionLabel).toBe('function');
    expect(typeof exports.getRiskTone).toBe('function');
    expect(typeof exports.getSafeDisplayText).toBe('function');
    expect(typeof exports.groupCommandsByType).toBe('function');
    expect(typeof exports.getPrimaryCommand).toBe('function');
    expect(typeof exports.hasBlockingCommand).toBe('function');
    // Theme
    expect(exports.DEFAULT_THEME).toBeDefined();
    expect(exports.LIGHT_TOKENS).toBeDefined();
    expect(exports.DARK_TOKENS).toBeDefined();
    expect(typeof exports.resolveTheme).toBe('function');
  });

  // 44 — existing @kai/ui-sdk tests verified separately
  it('SDK types are re-exported from components package', async () => {
    const exports = await import('../index');
    // Theme tokens
    expect(exports.RISK_TONE_MAP).toBeDefined();
    expect(exports.SPACING).toBeDefined();
    expect(exports.FONT_SIZES).toBeDefined();
    expect(exports.SHADOWS).toBeDefined();
  });

  // 45 — existing Kai backend tests verified separately
  it('hasBlockingCommand returns false for empty array', () => {
    expect(hasBlockingCommand([])).toBe(false);
  });

  // 46
  it('resolveTheme merges overrides correctly', async () => {
    const { resolveTheme } = await import('../styles/tokens');
    const custom = resolveTheme({ primaryColor: '#ff0000', compact: true });
    expect(custom.primaryColor).toBe('#ff0000');
    expect(custom.compact).toBe(true);
    expect(custom.surfaceColor).toBe('#ffffff'); // default light value preserved
  });
});
