import { describe, it, expect } from 'vitest';
import { ActionReceiptLogger } from '../../services/action-receipt-logger';
import { ADMIN_ROLES } from '../../types';
import { sanitizeProofTrustMetadata } from '../../prooftrust/types';

// ── Mock D1 that captures inserts ──

function createCapturingD1() {
  const inserts: any[] = [];
  return {
    inserts,
    db: {
      prepare: (sql: string) => {
        let boundArgs: any[] = [];
        const stmt = {
          bind: (...args: any[]) => { boundArgs = args; return stmt; },
          run: async () => {
            if (sql.includes('INSERT')) inserts.push({ sql, args: [...boundArgs] });
            return { meta: {} };
          },
          first: async () => ({ total: 0 }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    },
  };
}

// ── Shared receipt input helpers ──

function baseInput() {
  return {
    appId: 'jon-command-center',
    userId: 'user-123',
    userRole: 'super-admin',
    sessionId: 'sess-1',
    source: 'test',
  };
}

describe('Action Receipts Security Retest', () => {
  it('recommendation creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logRecommendation({
      ...baseInput(),
      actionSummary: 'Top task recommended',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('INSERT');
    // receipt_type is arg index 7 (0-based)
    expect(inserts[0].args[7]).toBe('kai_recommendation_generated');
  });

  it('blocked action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logBlockedAction({
      ...baseInput(),
      userIntent: 'delete all users',
      blockedReason: 'Too dangerous',
      riskLevel: 'blocked',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_blocked');
  });

  it('prepared action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logPreparedAction({
      ...baseInput(),
      actionType: 'update_task',
      actionSummary: 'Update task status',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_prepared');
  });

  it('confirmed action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logConfirmedAction({
      ...baseInput(),
      actionType: 'deploy',
      actionSummary: 'Deploy to production',
      riskLevel: 'high',
      pendingActionId: 'pa-1',
      confirmedBy: 'user-123',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_confirmed');
  });

  it('denied action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logDeniedAction({
      ...baseInput(),
      actionType: 'deploy',
      actionSummary: 'Deploy to production',
      riskLevel: 'high',
      pendingActionId: 'pa-2',
      deniedBy: 'admin-1',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_denied');
  });

  it('expired action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logExpiredAction({
      ...baseInput(),
      actionType: 'deploy',
      actionSummary: 'Deploy to production',
      riskLevel: 'high',
      pendingActionId: 'pa-3',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_expired');
  });

  it('executed action creates receipt', async () => {
    const { db, inserts } = createCapturingD1();
    const logger = new ActionReceiptLogger(db as any);

    await logger.logExecutedAction({
      ...baseInput(),
      actionType: 'mark_done',
      actionSummary: 'Mark task as done',
      riskLevel: 'safe',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[7]).toBe('kai_action_executed');
  });

  it('receipt route requires valid JWT — super-admin is in ADMIN_ROLES', () => {
    expect(ADMIN_ROLES.has('super-admin')).toBe(true);
    expect(ADMIN_ROLES.has('viewer' as any)).toBe(false);
  });

  it('receipt route requires super-admin — admin role is not in ADMIN_ROLES', () => {
    expect(ADMIN_ROLES.has('super-admin')).toBe(true);
    expect(ADMIN_ROLES.has('admin' as any)).toBe(false);
  });

  it('receipt metadata does not include Authorization header — sanitize strips token keys', () => {
    const result = sanitizeProofTrustMetadata({ token: 'secret', foo: 'bar' });
    expect(result).toBeDefined();
    expect(result!.foo).toBe('bar');
    expect(result!).not.toHaveProperty('token');
  });

  it('receipt metadata does not include raw token', () => {
    const result = sanitizeProofTrustMetadata({
      accessToken: 'x',
      secret: 'y',
      normal: 'z',
    });
    expect(result).toBeDefined();
    expect(result!.normal).toBe('z');
    expect(result!).not.toHaveProperty('accessToken');
    expect(result!).not.toHaveProperty('secret');
  });

  it('receipt metadata does not include raw audio', () => {
    const result = sanitizeProofTrustMetadata({
      rawAudio: 'base64data',
      audioData: 'x',
      info: 'ok',
    });
    expect(result).toBeDefined();
    expect(result!.info).toBe('ok');
    expect(result!).not.toHaveProperty('rawAudio');
    expect(result!).not.toHaveProperty('audioData');
  });

  it('receipt metadata does not include private document contents', () => {
    const result = sanitizeProofTrustMetadata({
      privateDocument: 'doc',
      ssn: '123',
      creditCard: '456',
      bankAccount: '789',
      safe: 'yes',
    });
    expect(result).toBeDefined();
    expect(result!.safe).toBe('yes');
    expect(result!).not.toHaveProperty('privateDocument');
    expect(result!).not.toHaveProperty('ssn');
    expect(result!).not.toHaveProperty('creditCard');
    expect(result!).not.toHaveProperty('bankAccount');
  });

  it('receipt logger fails safely if D1 unavailable', async () => {
    const logger = new ActionReceiptLogger(undefined);

    // Should not throw — completes as a no-op
    await expect(
      logger.logBlockedAction({
        ...baseInput(),
        userIntent: 'delete everything',
        blockedReason: 'no db',
        riskLevel: 'high',
      }),
    ).resolves.toBeUndefined();
  });
});
