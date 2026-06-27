import { describe, it, expect, vi } from 'vitest';
import {
  isSensitiveAction,
  getSensitiveCategory,
  createHostCommandHandlers,
  createViliniuCommandHandlers,
} from '../handlers';
import type { HostAppCallbacks } from '../types';

describe('isSensitiveAction', () => {
  it('returns true for payout actions', () => {
    expect(isSensitiveAction('process-payout')).toBe(true);
  });

  it('returns true for refund actions', () => {
    expect(isSensitiveAction('issue-refund')).toBe(true);
  });

  it('returns true for bank-detail actions', () => {
    expect(isSensitiveAction('update-bank-detail')).toBe(true);
  });

  it('returns true for payment-processing actions', () => {
    expect(isSensitiveAction('payment-processing-setup')).toBe(true);
  });

  it('returns true for vendor-approval actions', () => {
    expect(isSensitiveAction('vendor-approval-request')).toBe(true);
  });

  it('returns false for view-dashboard', () => {
    expect(isSensitiveAction('view-dashboard')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSensitiveAction(undefined)).toBe(false);
  });
});

describe('getSensitiveCategory', () => {
  it('returns correct category', () => {
    expect(getSensitiveCategory('process-payout')).toBe('payout');
    expect(getSensitiveCategory('issue-refund')).toBe('refund');
    expect(getSensitiveCategory('update-bank-detail')).toBe('bank-detail');
  });

  it('returns null for non-sensitive action', () => {
    expect(getSensitiveCategory('view-dashboard')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getSensitiveCategory(undefined)).toBeNull();
  });
});

describe('createHostCommandHandlers', () => {
  function makeCallbacks(): HostAppCallbacks {
    return {
      onNavigate: vi.fn(),
      onOpenSupportForm: vi.fn(),
      onShowConfirmation: vi.fn(),
      onRequestAdminReview: vi.fn(),
      onShowBlockedNotice: vi.fn(),
      onShowReceipt: vi.fn(),
      onShowMessage: vi.fn(),
      onToast: vi.fn(),
    };
  }

  it('onNavigate calls callback with routePath', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    handlers.onNavigate!({ type: 'navigate', routePath: '/dashboard', message: '' } as any);
    expect(cbs.onNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('onBlocked calls callback (terminal)', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    handlers.onBlocked!({ type: 'blocked', message: 'Not allowed' } as any);
    expect(cbs.onShowBlockedNotice).toHaveBeenCalledWith('Not allowed');
  });

  it('onMessage calls callback', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    handlers.onMessage!({ type: 'message', message: 'Hello', severity: 'info' } as any);
    expect(cbs.onShowMessage).toHaveBeenCalledWith('Hello', 'info');
  });

  it('onNoOp does nothing', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    // Should not throw
    handlers.onNoOp!();
    // No callbacks called
    expect(cbs.onNavigate).not.toHaveBeenCalled();
    expect(cbs.onShowMessage).not.toHaveBeenCalled();
  });

  it('onConfirmation routes sensitive actions to admin review', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    handlers.onConfirmation!({
      action: 'process-payout',
      description: 'Payout $100',
    } as any);
    expect(cbs.onRequestAdminReview).toHaveBeenCalled();
    expect(cbs.onShowConfirmation).not.toHaveBeenCalled();
  });

  it('onConfirmation allows non-sensitive confirmations', () => {
    const cbs = makeCallbacks();
    const handlers = createHostCommandHandlers(cbs);
    handlers.onConfirmation!({
      action: 'update-profile',
      description: 'Update display name',
    } as any);
    expect(cbs.onShowConfirmation).toHaveBeenCalledWith('update-profile', 'Update display name');
    expect(cbs.onRequestAdminReview).not.toHaveBeenCalled();
  });
});

describe('createViliniuCommandHandlers', () => {
  it('routes ALL sensitive confirmations to admin review', () => {
    const cbs: HostAppCallbacks = {
      onRequestAdminReview: vi.fn(),
      onShowConfirmation: vi.fn(),
    };
    const handlers = createViliniuCommandHandlers(cbs);
    handlers.onConfirmation!({
      action: 'issue-refund',
      description: 'Refund $50',
    } as any);
    expect(cbs.onRequestAdminReview).toHaveBeenCalled();
    expect(cbs.onShowConfirmation).not.toHaveBeenCalled();
  });

  it('falls back to blocked notice when no admin review handler', () => {
    const cbs: HostAppCallbacks = {
      onShowBlockedNotice: vi.fn(),
      onShowConfirmation: vi.fn(),
    };
    const handlers = createViliniuCommandHandlers(cbs);
    handlers.onConfirmation!({
      action: 'process-payout',
      description: 'Payout $100',
    } as any);
    expect(cbs.onShowBlockedNotice).toHaveBeenCalledWith(
      'This action requires admin approval. Please contact your administrator.',
    );
    expect(cbs.onShowConfirmation).not.toHaveBeenCalled();
  });
});
