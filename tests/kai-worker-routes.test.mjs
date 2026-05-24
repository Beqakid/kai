import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import worker from '../packages/kai-cloudflare/dist/worker.js';

class MockD1 {
  constructor() {
    this.sessions = [];
    this.messages = [];
    this.preferences = [];
    this.auditLogs = [];
    this.workflowStates = [];
    this.knowledgeSources = [
      {
        id: 'viliniu_overview',
        app: 'viliniu',
        language: 'en',
        title: 'Viliniu overview',
        path: 'knowledge/viliniu/en/overview.md',
        summary: 'Viliniu helps vendors and service providers create a marketplace presence.',
        enabled: 1,
      },
    ];
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    if (this.sql.includes('INSERT INTO kai_sessions')) {
      this.db.sessions.push({
        id: this.args[0],
        app: this.args[1],
        user_id: this.args[2],
        user_role: this.args[3],
        language: this.args[4],
        guidance_mode: this.args[5],
        metadata_json: this.args[6],
      });
    }
    if (this.sql.includes('INSERT INTO kai_messages')) {
      this.db.messages.push({
        id: this.args[0],
        session_id: this.args[1],
        role: this.args[2],
        language: this.args[3],
        content: this.args[4],
        workflow_id: this.args[5],
        knowledge_sources_json: this.args[6],
      });
    }
    if (this.sql.includes('INSERT INTO kai_user_preferences')) {
      const [id, app, userId, preferredLanguage, preferencesJson] = this.args;
      const existing = this.db.preferences.find((item) => item.app === app && item.user_id === userId);
      if (existing) {
        existing.preferred_language = preferredLanguage;
        existing.preferences_json = preferencesJson;
      } else {
        this.db.preferences.push({ id, app, user_id: userId, preferred_language: preferredLanguage, preferences_json: preferencesJson });
      }
    }
    if (this.sql.includes('INSERT INTO kai_audit_logs')) {
      this.db.auditLogs.push({
        id: this.args[0],
        app: this.args[1],
        session_id: this.args[2],
        user_id: this.args[3],
        action: this.args[4],
        permission: this.args[5],
        allowed: this.args[6],
        reason: this.args[7],
        metadata_json: this.args[8],
        created_at: new Date(0).toISOString(),
      });
    }
    if (this.sql.includes('INSERT INTO kai_workflow_states')) {
      this.db.workflowStates.push({
        id: this.args[0],
        session_id: this.args[1],
        app: this.args[2],
        user_id: this.args[3],
        workflow_id: this.args[4],
        current_step_id: this.args[5],
        completed_step_ids_json: this.args[6],
        status: this.args[7],
      });
    }
    return { success: true };
  }

  async all() {
    if (this.sql.includes('FROM kai_knowledge_sources')) {
      const [app, language] = this.args;
      return {
        results: this.db.knowledgeSources.filter(
          (source) => source.app === app && source.language === language && source.enabled === 1,
        ),
      };
    }
    return { results: [] };
  }

  async first() {
    if (this.sql.includes('FROM kai_audit_logs')) {
      const [id, action] = this.args;
      const item = this.db.auditLogs.find((log) => log.id === id && log.action === action && log.allowed === 1);
      return item ?? null;
    }
    return null;
  }
}

function env() {
  return {
    KAI_DB: new MockD1(),
    AI_COACH_ENABLED: 'true',
    KAI_DEFAULT_LANGUAGE: 'en',
    KAI_ALLOWED_ORIGINS: 'https://viliniu.com,http://localhost:8787',
  };
}

async function jsonResponse(response) {
  return {
    status: response.status,
    body: await response.json(),
    cors: response.headers.get('Access-Control-Allow-Origin'),
  };
}

function request(path, init = {}) {
  return new Request(`https://kai.example.test${path}`, {
    ...init,
    headers: {
      Origin: 'https://viliniu.com',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

describe('Kai Worker API routes', () => {
  it('creates sessions and returns a multilingual greeting', async () => {
    const testEnv = env();
    const response = await worker.fetch(
      request('/api/kai/session', {
        method: 'POST',
        body: JSON.stringify({ app: 'viliniu', userRole: 'vendor', language: 'es', url: 'https://vendor.viliniu.com/register' }),
      }),
      testEnv,
    );
    const data = await jsonResponse(response);

    assert.equal(data.status, 200);
    assert.equal(data.body.language, 'es');
    assert.equal(data.body.pageContext.appSurface, 'vendor');
    assert.equal(data.cors, 'https://viliniu.com');
    assert.equal(testEnv.KAI_DB.sessions.length, 1);
  });

  it('logs messages and uses the fallback provider safely', async () => {
    const testEnv = env();
    const session = await worker.fetch(request('/api/kai/session', { method: 'POST', body: '{}' }), testEnv);
    const { sessionId } = await session.json();

    const response = await worker.fetch(
      request('/api/kai/message', {
        method: 'POST',
        body: JSON.stringify({ app: 'viliniu', sessionId, message: 'How do I create a website?', language: 'en' }),
      }),
      testEnv,
    );
    const data = await jsonResponse(response);

    assert.equal(data.status, 200);
    assert.match(data.body.content, /guide/i);
    assert.equal(testEnv.KAI_DB.messages.length, 2);
  });

  it('generates and retrieves approval-gated website drafts', async () => {
    const testEnv = env();
    const response = await worker.fetch(
      request('/api/kai/website-draft', {
        method: 'POST',
        body: JSON.stringify({
          app: 'viliniu',
          userRole: 'vendor',
          answers: {
            businessName: 'Bula Fresh',
            businessType: 'farm produce vendor',
            products: ['Vegetables'],
            preferredCustomerAction: 'Order Now',
          },
        }),
      }),
      testEnv,
    );
    const created = await jsonResponse(response);

    assert.equal(created.status, 200);
    assert.equal(created.body.approvalRequired, true);
    assert.equal(created.body.phase2Behavior, 'draft_only');

    const fetched = await worker.fetch(request(`/api/kai/website-draft?id=${created.body.draftId}`, { method: 'GET' }), testEnv);
    const data = await jsonResponse(fetched);
    assert.equal(data.status, 200);
    assert.equal(data.body.draft.businessName, 'Bula Fresh');
  });

  it('handles preferences, workflow state, sources, creative drafts, handoff, and bad input', async () => {
    const testEnv = env();
    const missingMessage = await worker.fetch(request('/api/kai/message', { method: 'POST', body: '{}' }), testEnv);
    assert.equal(missingMessage.status, 400);

    const preferences = await worker.fetch(
      request('/api/kai/preferences', {
        method: 'POST',
        body: JSON.stringify({ app: 'viliniu', userId: 'user_1', preferredLanguage: 'fj' }),
      }),
      testEnv,
    );
    assert.equal(preferences.status, 200);

    const sources = await worker.fetch(request('/api/kai/knowledge/sources?app=viliniu&language=en', { method: 'GET' }), testEnv);
    assert.equal((await sources.json()).sources.length, 1);

    const session = await worker.fetch(request('/api/kai/session', { method: 'POST', body: '{}' }), testEnv);
    const { sessionId } = await session.json();
    const state = await worker.fetch(
      request('/api/kai/workflow-state', {
        method: 'POST',
        body: JSON.stringify({ sessionId, workflowId: 'ai_website_setup', currentStepId: 'business_name' }),
      }),
      testEnv,
    );
    assert.equal(state.status, 200);

    const asset = await worker.fetch(
      request('/api/kai/creative-asset-draft', {
        method: 'POST',
        body: JSON.stringify({ userRole: 'vendor', businessName: 'Bula Fresh', assetType: 'logo', businessType: 'farm produce vendor' }),
      }),
      testEnv,
    );
    assert.equal(asset.status, 200);

    const draft = await worker.fetch(
      request('/api/kai/website-draft', {
        method: 'POST',
        body: JSON.stringify({ userRole: 'vendor', answers: { businessName: 'Bula Fresh' } }),
      }),
      testEnv,
    );
    const { draftId } = await draft.json();
    const handoff = await worker.fetch(
      request('/api/kai/viliniu/handoff', {
        method: 'POST',
        body: JSON.stringify({ draftId, handoffTarget: 'vendor_signup' }),
      }),
      testEnv,
    );
    assert.equal(handoff.status, 200);
  });
});
