// ── KaiCoreService — Safe, Context-Aware AI Response Engine ──
//
// Phase 4: Sensitive natural-language requests route through
// the KaiPermissionGate before any response is generated.
// Phase 3: Integrated with ActionReceiptLogger for auditable receipts.

import { AppId, UserRole, RiskLevel, KaiCoreResponse } from '../types';
import { ActionReceiptLogger } from './action-receipt-logger';
import { KaiPermissionGate } from './kai-permission-gate';

// ── BLOCKED ACTIONS — Kai Voice v1 cannot perform these ──

const BLOCKED_ACTIONS = new Set([
  'process_payment',
  'issue_refund',
  'change_payout',
  'delete_user',
  'approve_background_check',
  'approve_identity_verification',
  'change_bank_details',
  'deploy_code',
  'modify_production_schema',
  'drop_table',
  'truncate_table',
  'delete_database',
  'transfer_funds',
  'modify_billing',
  'grant_admin',
  'revoke_access',
  'approve_withdrawal',
]);

// ── CONTEXT-AWARE RESPONSE TEMPLATES ──

interface AppContext {
  greeting: string;
  capabilities: string[];
  screens: Record<string, string[]>;
}

const APP_CONTEXTS: Record<AppId, AppContext> = {
  'jon-command-center': {
    greeting: "I'm Kai, your Command Center assistant",
    capabilities: [
      'view platform overview and metrics',
      'check vendor statuses across apps',
      'review recent activity and alerts',
      'navigate between apps',
      'explain dashboard data',
    ],
    screens: {
      dashboard: [
        'view active vendors and users',
        'check platform health metrics',
        'review recent alerts',
      ],
      vendors: [
        'search and filter vendors',
        'view vendor profiles',
        'check vendor compliance status',
      ],
      settings: [
        'explain configuration options',
        'guide through settings',
      ],
    },
  },
  carehia: {
    greeting: "I'm Kai, your Carehia care platform assistant",
    capabilities: [
      'navigate care provider workflows',
      'explain scheduling and availability',
      'guide through client management',
      'help with care plan reviews',
      'answer platform questions',
    ],
    screens: {
      dashboard: [
        'view upcoming appointments',
        'check client statuses',
        'review care metrics',
      ],
      clients: [
        'search client records',
        'view care plans',
        'check visit history',
      ],
      scheduling: [
        'view schedules',
        'explain availability rules',
        'help with shift planning',
      ],
    },
  },
  viliniu: {
    greeting: "I'm Kai, your Viliniu marketplace assistant",
    capabilities: [
      'guide vendor onboarding',
      'explain product listing process',
      'help with service setup',
      'navigate storefront features',
      'answer marketplace questions',
    ],
    screens: {
      dashboard: [
        'view sales overview',
        'check order statuses',
        'review vendor metrics',
      ],
      products: [
        'search and manage products',
        'explain listing requirements',
        'help with pricing',
      ],
      orders: [
        'view order details',
        'explain order workflow',
        'track fulfillment',
      ],
    },
  },
  volau: {
    greeting: "I'm Kai, your Volau assistant",
    capabilities: [
      'navigate platform features',
      'explain workflows and processes',
      'guide through setup and configuration',
      'answer general questions',
    ],
    screens: {
      dashboard: [
        'view key metrics',
        'check recent activity',
        'navigate to sections',
      ],
    },
  },
  kai: {
    greeting: "I'm Kai, your Kai system assistant",
    capabilities: [
      'task management',
      'action receipts',
      'navigation guidance',
    ],
    screens: {
      dashboard: [
        'view tasks',
        'view receipts',
      ],
    },
  },
};

// ── ROLE-BASED GUIDANCE ──

const ROLE_GUIDANCE: Record<UserRole, string> = {
  'super-admin': 'You have full visibility. I can help you review anything across the platform.',
  admin: 'As an admin, I can guide you through management and configuration tasks.',
  vendor: 'I can help you manage your profile, products, and services.',
  customer: 'I can help you find what you need and navigate the platform.',
  viewer: 'I can show you information and help you understand what you see.',
  caregiver: 'I can help you manage your schedule, clients, and care activities.',
  client: 'I can help you view your care schedule and connect with your caregiver.',
  'agency-admin': 'I can help you manage your agency\'s caregivers and clients.',
  contributor: 'I can help you submit and manage your contributions.',
  reviewer: 'I can help you review submissions and manage the review queue.',
  driver: 'I can help you manage your deliveries and navigation.',
  'public-user': 'I can help you explore and find what you need.',
};

// ── MAIN SERVICE ──

/** Context passed alongside the voice request for receipt logging */
export interface KaiCoreContext {
  transcript: string;
  appId: AppId;
  userId: string;
  userRole: UserRole;
  currentScreen: string;
  allowedActions: string[];
  sessionId: string;
}

export class KaiCoreService {
  private readonly receiptLogger: ActionReceiptLogger | undefined;
  private readonly gate: KaiPermissionGate;

  constructor(receiptLogger?: ActionReceiptLogger) {
    this.receiptLogger = receiptLogger;
    this.gate = new KaiPermissionGate(receiptLogger);
  }

  /**
   * Process a voice request and return a safe, contextual response.
   * Phase 4: Routes sensitive NL requests through the permission gate.
   */
  processRequest(params: KaiCoreContext): KaiCoreResponse {
    const { transcript, appId, userRole, currentScreen, allowedActions } = params;

    // ── Phase 4: Gate check for sensitive NL requests ──
    const gateResult = this.gate.evaluateNaturalLanguage({
      transcript,
      appId,
      userId: params.userId,
      userRole,
      sessionId: params.sessionId,
    });

    if (gateResult) {
      // Gate detected a sensitive request — return gate-style denial
      const riskLevel: RiskLevel = gateResult.riskLevel === 'blocked' ? 'blocked' : 'high';
      return {
        responseText: gateResult.riskLevel === 'blocked'
          ? `I can't perform that action through voice. ${gateResult.reason} ${gateResult.recommendedFallback}`
          : `That request involves high-risk operations. ${gateResult.reason} ${gateResult.recommendedFallback}`,
        riskLevel,
        requiresConfirmation: gateResult.requiresAdminApproval,
        suggestedActions: [gateResult.recommendedFallback],
        actions: [],
      };
    }

    // ── Step 1: Check for blocked actions in allowedActions list ──
    const blockedCheck = this.checkBlockedActions(transcript, allowedActions);
    if (blockedCheck) {
      this.logBlockedOrWarning(params, blockedCheck);
      return blockedCheck;
    }

    // ── Step 2: Validate allowed actions against safety rules ──
    const sanitizedActions = this.sanitizeAllowedActions(allowedActions);

    // ── Step 3: Generate contextual response ──
    const response = this.generateResponse(transcript, appId, userRole, currentScreen, sanitizedActions);

    // Fire-and-forget receipt for explanations
    this.logExplanationReceipt(params, response);

    return response;
  }

  // ── Receipt logging helpers (fire-and-forget, never throws) ──

  private logBlockedOrWarning(ctx: KaiCoreContext, response: KaiCoreResponse): void {
    if (!this.receiptLogger) return;

    if (response.riskLevel === 'blocked') {
      this.receiptLogger.logBlockedAction({
        appId: ctx.appId,
        userId: ctx.userId,
        userRole: ctx.userRole,
        sessionId: ctx.sessionId,
        source: 'kai-core',
        userIntent: ctx.transcript,
        blockedReason: 'Blocked actions requested via allowedActions list',
        riskLevel: response.riskLevel,
        kaiResponse: response.responseText,
      }).catch(() => {});
    } else if (response.riskLevel === 'high') {
      this.receiptLogger.logRiskWarning({
        appId: ctx.appId,
        userId: ctx.userId,
        userRole: ctx.userRole,
        sessionId: ctx.sessionId,
        source: 'kai-core',
        userIntent: ctx.transcript,
        riskLevel: response.riskLevel,
        kaiResponse: response.responseText,
        requiresConfirmation: response.requiresConfirmation,
      }).catch(() => {});
    }
  }

  private logExplanationReceipt(ctx: KaiCoreContext, response: KaiCoreResponse): void {
    if (!this.receiptLogger) return;
    if (response.riskLevel !== 'safe') return;

    this.receiptLogger.logExplanation({
      appId: ctx.appId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      sessionId: ctx.sessionId,
      source: 'kai-core',
      userIntent: ctx.transcript,
      kaiResponse: response.responseText,
    }).catch(() => {});
  }

  /**
   * Check if the transcript or allowed actions contain blocked operations.
   */
  private checkBlockedActions(
    transcript: string,
    allowedActions: string[],
  ): KaiCoreResponse | null {
    // Check if any allowedActions include blocked items
    const requestedBlocked = allowedActions.filter((a) =>
      BLOCKED_ACTIONS.has(a.toLowerCase().replace(/\s+/g, '_')),
    );

    if (requestedBlocked.length > 0) {
      return {
        responseText:
          `I can't perform these actions in voice mode: ${requestedBlocked.join(', ')}. ` +
          'These require manual confirmation through the platform UI for safety.',
        riskLevel: 'blocked',
        requiresConfirmation: false,
        suggestedActions: ['Use the platform UI for this action'],
        actions: [],
      };
    }

    return null;
  }

  /**
   * Remove any blocked actions from the allowed list server-side.
   */
  private sanitizeAllowedActions(allowedActions: string[]): string[] {
    return allowedActions.filter(
      (a) => !BLOCKED_ACTIONS.has(a.toLowerCase().replace(/\s+/g, '_')),
    );
  }

  /**
   * Generate a helpful, context-aware response.
   */
  private generateResponse(
    transcript: string,
    appId: AppId,
    userRole: UserRole,
    currentScreen: string,
    allowedActions: string[],
  ): KaiCoreResponse {
    const ctx = APP_CONTEXTS[appId];
    const roleGuidance = ROLE_GUIDANCE[userRole];
    const normalizedTranscript = transcript.toLowerCase().trim();

    // ── Greeting / introduction ──
    if (this.isGreeting(normalizedTranscript)) {
      const screenHints = ctx.screens[currentScreen];
      const screenInfo = screenHints
        ? ` On this screen, I can help you ${screenHints[0]}.`
        : '';

      return {
        responseText:
          `Hey! ${ctx.greeting}. ${roleGuidance}${screenInfo} What would you like to do?`,
        riskLevel: 'safe',
        requiresConfirmation: false,
        suggestedActions: ctx.capabilities.slice(0, 3),
        actions: [],
      };
    }

    // ── Help / what can you do ──
    if (this.isHelpRequest(normalizedTranscript)) {
      const capList = ctx.capabilities.map((c) => `• ${c}`).join('\n');
      return {
        responseText:
          `${ctx.greeting}. Here's what I can help with:\n${capList}\n\n` +
          `${roleGuidance} Just ask and I'll guide you.`,
        riskLevel: 'safe',
        requiresConfirmation: false,
        suggestedActions: ctx.capabilities.slice(0, 3),
        actions: [],
      };
    }

    // ── Screen-specific guidance ──
    if (this.isScreenQuestion(normalizedTranscript)) {
      const screenHints = ctx.screens[currentScreen];
      if (screenHints) {
        const hintList = screenHints.map((h) => `• ${h}`).join('\n');
        return {
          responseText:
            `On this screen, here's what you can do:\n${hintList}\n\nWant me to walk you through any of these?`,
          riskLevel: 'safe',
          requiresConfirmation: false,
          suggestedActions: screenHints,
          actions: [],
        };
      }
    }

    // ── Navigation requests ──
    if (this.isNavigationRequest(normalizedTranscript)) {
      const availableScreens = Object.keys(ctx.screens);
      return {
        responseText:
          `I can help you navigate! Available sections: ${availableScreens.join(', ')}. ` +
          'Which one would you like to go to?',
        riskLevel: 'safe',
        requiresConfirmation: false,
        suggestedActions: availableScreens.map((s) => `Go to ${s}`),
        actions: [],
      };
    }

    // ── Status / overview requests ──
    if (this.isStatusRequest(normalizedTranscript)) {
      return {
        responseText:
          `Let me help you get an overview. ${roleGuidance} ` +
          'I can show you the dashboard metrics, recent activity, or help you find specific information. ' +
          'What area would you like to check?',
        riskLevel: 'safe',
        requiresConfirmation: false,
        suggestedActions: [
          'View dashboard metrics',
          'Check recent activity',
          'Search for something specific',
        ],
        actions: [],
      };
    }

    // ── Default contextual response ──
    return {
      responseText:
        `I heard you say: "${transcript}". ` +
        `${ctx.greeting}, and I'm here to guide you. ` +
        `${roleGuidance} ` +
        'In the next update, I\'ll have deeper understanding to help with more specific requests. ' +
        'For now, try asking me what I can do, or ask about this screen.',
      riskLevel: 'safe',
      requiresConfirmation: false,
      suggestedActions: ctx.capabilities.slice(0, 2),
      actions: [],
    };
  }

  // ── Intent Detection Helpers ──

  private isGreeting(t: string): boolean {
    return /^(hey|hi|hello|sup|yo|what'?s\s*up|good\s*(morning|afternoon|evening)|howdy)/i.test(t);
  }

  private isHelpRequest(t: string): boolean {
    return /\b(help|what can you do|what do you do|capabilities|features|how.*(work|use))/i.test(t);
  }

  private isScreenQuestion(t: string): boolean {
    return /\b(this screen|this page|what.*(here|see)|where am i|current.*(screen|page|view))/i.test(t);
  }

  private isNavigationRequest(t: string): boolean {
    return /\b(go to|navigate|take me|show me|open|switch to)/i.test(t);
  }

  private isStatusRequest(t: string): boolean {
    return /\b(status|overview|summary|how.*(things|everything)|what'?s\s*(happening|going\s*on))/i.test(t);
  }
}
