import { describe, it, expect } from 'vitest';
import {
  PendingActionStore,
  CreatePendingActionInput,
  PendingActionRow,
} from '../../services/pending-action-store';

// ── Mock D1 Database ──

function createMockD1(): any {
  const store: Record<string, any> = {};
  return {
    prepare: (sql: string) => {
      let boundArgs: any[] = [];
      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        run: async () => {
          if (sql.includes('INSERT INTO kai_pending_actions')) {
            store[boundArgs[0]] = {
              id: boundArgs[0],
              app_id: boundArgs[1],
              project: boundArgs[2],
              user_id: boundArgs[3],
              user_role: boundArgs[4],
              session_id: boundArgs[5],
              task_id: boundArgs[6],
              action_type: boundArgs[7],
              action_summary: boundArgs[8],
              prepared_output: boundArgs[9],
              risk_level: boundArgs[10],
              gate_decision_json: boundArgs[11],
              status: boundArgs[12],
              expires_at: boundArgs[13],
              created_at: boundArgs[14],
              metadata_json: boundArgs[15],
              confirmed_at: null,
              denied_at: null,
              confirmed_by: null,
              denied_by: null,
            };
          }
          if (sql.includes('UPDATE')) {
            if (sql.includes("SET status = 'executed'")) {
              // markExecuted: bind(id)
              const id = boundArgs[0];
              if (store[id]) store[id].status = 'executed';
            } else if (sql.includes("SET status = 'confirmed'")) {
              // confirmPendingAction: bind(confirmedAt, confirmedBy, id)
              const id = boundArgs[2];
              if (store[id]) {
                store[id].status = 'confirmed';
                store[id].confirmed_at = boundArgs[0];
                store[id].confirmed_by = boundArgs[1];
              }
            } else if (sql.includes("SET status = 'denied'")) {
              const id = boundArgs[2];
              if (store[id]) {
                store[id].status = 'denied';
                store[id].denied_at = boundArgs[0];
                store[id].denied_by = boundArgs[1];
              }
            } else if (sql.includes("SET status = 'expired'")) {
              for (const row of Object.values(store)) {
                if (
                  row.status === 'pending' &&
                  new Date(row.expires_at) <= new Date(boundArgs[0])
                ) {
                  row.status = 'expired';
                }
              }
            } else if (sql.includes('SET status = ?')) {
              const status = boundArgs[0];
              const id = boundArgs[1];
              if (store[id]) store[id].status = status;
            }
          }
          return { meta: { changes: 1 } };
        },
        first: async <T>(): Promise<T | null> => {
          if (sql.includes('SELECT') && sql.includes('WHERE id = ?')) {
            return (store[boundArgs[0]] as T) || null;
          }
          if (sql.includes('COUNT')) {
            return { total: Object.keys(store).length } as T;
          }
          return null;
        },
        all: async () => ({ results: Object.values(store) }),
      };
      return stmt;
    },
  };
}

// ── Helpers ──

function mediumRiskInput(overrides: Partial<CreatePendingActionInput> = {}): CreatePendingActionInput {
  return {
    appId: 'jon-command-center',
    userId: 'user-A',
    userRole: 'admin',
    actionType: 'deploy-service',
    actionSummary: 'Deploy backend v2.3',
    riskLevel: 'medium',
    ...overrides,
  };
}

// ── Tests ──

describe('Pending Confirmation Security Retest', () => {
  it('medium-risk action creates pending action', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput());

    expect(row).toBeDefined();
    expect(row.status).toBe('pending');
    expect(row.risk_level).toBe('medium');
    expect(row.id).toMatch(/^pa_/);
  });

  it('medium-risk action does not execute before confirmation', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput());

    expect(row.status).toBe('pending');
    expect(row.status).not.toBe('executed');
    expect(row.confirmed_at).toBeNull();
  });

  it('confirm route requires valid authCtx — succeeds with valid context', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));
    const result = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction!.status).toBe('confirmed');
    expect(result.pendingAction!.confirmed_by).toBe('user-A');
  });

  it('deny route requires valid authCtx — succeeds with valid context', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));
    const result = await store.denyPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction!.status).toBe('denied');
    expect(result.pendingAction!.denied_by).toBe('user-A');
  });

  it('different user cannot confirm pending action', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));
    const result = await store.confirmPendingAction(row.id, {
      userId: 'user-B',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('not authorized');
  });

  it('different user cannot deny pending action', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));
    const result = await store.denyPendingAction(row.id, {
      userId: 'user-B',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('not authorized');
  });

  it('super-admin can confirm another users pending action', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));
    const result = await store.confirmPendingAction(row.id, {
      userId: 'super-admin-1',
      userRole: 'super-admin',
    });

    expect(result.success).toBe(true);
    expect(result.pendingAction!.status).toBe('confirmed');
    expect(result.pendingAction!.confirmed_by).toBe('super-admin-1');
  });

  it('expired pending action cannot be confirmed', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    // expiryMinutes=-1 → already expired
    const row = await store.createPendingAction(
      mediumRiskInput({ expiryMinutes: -1 }),
    );

    const result = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('already executed pending action cannot be confirmed again', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));

    // Confirm then mark executed
    await store.confirmPendingAction(row.id, { userId: 'user-A', userRole: 'admin' });
    await store.markExecuted(row.id);

    // Try to confirm again
    const result = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('executed');
  });

  it('already denied pending action cannot be confirmed', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));

    // Deny first
    await store.denyPendingAction(row.id, { userId: 'user-A', userRole: 'admin' });

    // Try to confirm
    const result = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('denied');
  });

  it('confirm only works for pending status actions', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));

    // Confirm it once
    const first = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });
    expect(first.success).toBe(true);

    // Second confirm should fail — status is now 'confirmed', not 'pending'
    const second = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });
    expect(second.success).toBe(false);
    expect(second.reason).toContain('confirmed');
  });

  it('denied pending action cannot be re-confirmed', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    const row = await store.createPendingAction(mediumRiskInput({ userId: 'user-A' }));

    // Deny
    const denyResult = await store.denyPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });
    expect(denyResult.success).toBe(true);
    expect(denyResult.pendingAction!.status).toBe('denied');

    // Attempt confirm after deny
    const confirmResult = await store.confirmPendingAction(row.id, {
      userId: 'user-A',
      userRole: 'admin',
    });
    expect(confirmResult.success).toBe(false);
    expect(confirmResult.reason).toContain('denied');
  });

  it('high-risk action cannot become pending', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    await expect(
      store.createPendingAction(mediumRiskInput({ riskLevel: 'high' })),
    ).rejects.toThrow('Cannot create pending action for high-risk');
  });

  it('blocked action cannot become pending', async () => {
    const db = createMockD1();
    const store = new PendingActionStore(db);

    await expect(
      store.createPendingAction(mediumRiskInput({ riskLevel: 'blocked' })),
    ).rejects.toThrow('Cannot create pending action for blocked-risk');
  });
});
