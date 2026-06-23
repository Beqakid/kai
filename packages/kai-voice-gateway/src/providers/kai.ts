// ── Kai Core Provider Abstraction ──

import { KaiProviderName, KaiCoreResponse, AppId, UserRole } from '../types';
import { Errors } from '../errors';
import { KaiCoreService } from '../services/kai-core';

/** Params for Kai provider respond method */
export interface KaiRespondParams {
  transcript: string;
  appId: string;
  userId: string;
  userRole: string;
  currentScreen: string;
  allowedActions: string[];
  sessionId: string;
}

/** Interface all Kai providers must implement */
export interface KaiProvider {
  readonly name: KaiProviderName;
  respond(params: KaiRespondParams): Promise<KaiCoreResponse>;
}

/** Mock Kai — returns a canned response */
export class MockKaiProvider implements KaiProvider {
  readonly name: KaiProviderName = 'mock';

  async respond(_params: KaiRespondParams): Promise<KaiCoreResponse> {
    await new Promise((r) => setTimeout(r, 400));
    return {
      responseText:
        'Kai Voice Gateway is connected. Voice response will be added in the next phase.',
      riskLevel: 'safe',
      requiresConfirmation: false,
      suggestedActions: [],
      actions: [],
    };
  }
}

/**
 * Kai Core Provider — uses KaiCoreService for safe, context-aware responses.
 * This is the real provider for Kai Voice v1.
 */
export class KaiCoreProvider implements KaiProvider {
  readonly name: KaiProviderName = 'kai-core';
  private readonly service: KaiCoreService;

  constructor() {
    this.service = new KaiCoreService();
  }

  async respond(params: KaiRespondParams): Promise<KaiCoreResponse> {
    try {
      const result = this.service.processRequest({
        transcript: params.transcript,
        appId: params.appId as AppId,
        userId: params.userId,
        userRole: params.userRole as UserRole,
        currentScreen: params.currentScreen,
        allowedActions: params.allowedActions,
        sessionId: params.sessionId,
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.gatewayFailure(`Kai Core processing failed: ${msg}`);
    }
  }
}

/** Factory to get the right Kai provider */
export function getKaiProvider(name: KaiProviderName): KaiProvider {
  switch (name) {
    case 'mock':
      return new MockKaiProvider();
    case 'kai-core':
      return new KaiCoreProvider();
    default:
      throw Errors.unsupportedProvider('Kai', name);
  }
}
