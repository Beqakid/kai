// ── Kai UI Adapter — Service ──
//
// Phase 11 Phase 3: Cross-app UI adapter service.
// Processes frontend requests, evaluates routes/actions via Navigation Core,
// and returns frontend-safe responses with UI commands.
//
// Safety rules:
// - Uses deterministic logic only (no LLM/AI inference).
// - JWT/auth context identity is authoritative.
// - Never executes external app changes.
// - Never sends emails, creates invoices, or processes payments.
// - Support request suggestions do not auto-create unless explicitly requested.
// - All requests produce Action Receipts.
// - Metadata is sanitized before any processing.

import {
  KaiUiAdapterRequest,
  KaiUiAdapterResponse,
  KaiUiAdapterAppId,
  KAI_UI_ADAPTER_APP_IDS,
  KaiUiAdapterRole,
  KAI_UI_ADAPTER_ROLES,
  KaiUiIntentType,
  KaiUiDecision,
  KaiUiRiskLevel,
  KaiUiCommand,
  KaiUiSupportRequestSuggestion,
  KaiUiConfirmation,
  KaiUiAdminReview,
  KaiUiReceiptSummary,
} from './types';
import {
  validateUiAdapterRequest,
  sanitizeUiAdapterMetadata,
} from './client-contract';
import {
  buildNavigationCommand,
  buildSupportFormCommand,
  buildConfirmationCommand,
  buildAdminReviewCommand,
  buildBlockedCommand,
  buildUnsupportedCommand,
  buildMessageCommand,
  buildReceiptCommand,
} from './ui-command-builder';
import {
  KaiNavigationCore,
} from '../navigation-core/navigation-core';
import {
  getRegistryRouteByKey,
  getRegistryActionByKey,
  getRegistryRoutesForApp,
} from '../navigation-core/registries/index';
import type {
  KaiSupportedAppId,
  KaiNavigationResult,
  KaiRouteRegistryEntry,
  KaiActionRegistryEntry,
} from '../navigation-core/types';

// ── Auth Context (from JWT) ──

export interface UiAdapterAuthContext {
  userId: string;
  appId: string;
  userRole: string;
}

// ── Intent Inference Rules ──
// Deterministic keyword matching only. No LLM/AI.

interface IntentRule {
  keywords: string[];
  routeKey: string;
  intentType: KaiUiIntentType;
  supportType?: string;
}

const CAREHIA_RULES: IntentRule[] = [
  { keywords: ['cpr', 'certificate', 'certification'], routeKey: 'certifications', intentType: 'navigate' },
  { keywords: ['invoice'], routeKey: 'invoices', intentType: 'navigate' },
  { keywords: ['trust passport', 'identity', 'verification'], routeKey: 'trust_passport', intentType: 'navigate' },
  { keywords: ['review'], routeKey: 'reviews', intentType: 'navigate' },
  { keywords: ['client'], routeKey: 'clients', intentType: 'navigate' },
  { keywords: ['care team'], routeKey: 'care_team', intentType: 'navigate' },
  { keywords: ['schedule'], routeKey: 'schedule', intentType: 'navigate' },
  { keywords: ['time', 'hours', 'clock'], routeKey: 'time_tracker', intentType: 'navigate' },
  { keywords: ['profile'], routeKey: 'profile', intentType: 'navigate' },
  { keywords: ['support', 'help'], routeKey: 'support', intentType: 'request_help' },
];

const VILINIU_RULES: IntentRule[] = [
  { keywords: ['payout', 'bank', 'm-paisa', 'mpaisa', 'mpesa'], routeKey: 'vendor_payouts', intentType: 'navigate' },
  { keywords: ['delivery proof', 'photo', 'delivered'], routeKey: 'delivery_proof', intentType: 'navigate' },
  { keywords: ['product'], routeKey: 'vendor_products', intentType: 'navigate' },
  { keywords: ['order'], routeKey: 'vendor_orders', intentType: 'navigate' },
  { keywords: ['inventory', 'stock'], routeKey: 'inventory', intentType: 'navigate' },
  { keywords: ['review', 'rating'], routeKey: 'reviews', intentType: 'navigate' },
  { keywords: ['dispute'], routeKey: 'disputes', intentType: 'navigate' },
  { keywords: ['support', 'help'], routeKey: 'support', intentType: 'request_help' },
];

const VOLAU_RULES: IntentRule[] = [
  // Issue-reporting rules MUST come before content-word rules like "plant"
  // to avoid "This plant information is wrong" matching species_lookup.
  { keywords: ['wrong information', 'incorrect', 'correction', 'error in', 'is wrong', 'not correct', 'inaccurate'],
    routeKey: 'support', intentType: 'report_issue',
    supportType: 'report_content_issue' },
  { keywords: ['weather'], routeKey: 'weather', intentType: 'navigate' },
  { keywords: ['plant', 'fish', 'species', 'animal'], routeKey: 'species_lookup', intentType: 'navigate' },
  { keywords: ['emergency', 'danger', 'sos'], routeKey: 'emergency_help', intentType: 'navigate' },
  { keywords: ['map', 'location'], routeKey: 'map', intentType: 'navigate' },
  { keywords: ['support', 'help'], routeKey: 'support', intentType: 'request_help' },
];

const JCC_RULES: IntentRule[] = [
  { keywords: ['carehia blocker', 'carehia module'], routeKey: 'carehia_module', intentType: 'navigate' },
  { keywords: ['launch blocker'], routeKey: 'launch_blockers', intentType: 'navigate' },
  { keywords: ['receipt'], routeKey: 'receipts', intentType: 'navigate' },
  { keywords: ['pending confirmation', 'pending action'], routeKey: 'pending_confirmations', intentType: 'navigate' },
  { keywords: ['support queue'], routeKey: 'support_queue', intentType: 'navigate' },
  { keywords: ['viliniu'], routeKey: 'viliniu_module', intentType: 'navigate' },
  { keywords: ['volau'], routeKey: 'volau_module', intentType: 'navigate' },
  { keywords: ['project'], routeKey: 'projects', intentType: 'navigate' },
];

const KAI_RULES: IntentRule[] = [
  { keywords: ['prooftrust', 'trust status'], routeKey: 'prooftrust_status', intentType: 'navigate' },
  { keywords: ['receipt'], routeKey: 'receipts', intentType: 'navigate' },
  { keywords: ['task'], routeKey: 'tasks', intentType: 'navigate' },
  { keywords: ['development intelligence', 'dev intel'], routeKey: 'development_intelligence', intentType: 'navigate' },
  { keywords: ['setting', 'config'], routeKey: 'settings', intentType: 'open_settings' },
  { keywords: ['support', 'help'], routeKey: 'support', intentType: 'request_help' },
];

const INTENT_RULES_BY_APP: Record<string, IntentRule[]> = {
  'carehia': CAREHIA_RULES,
  'viliniu': VILINIU_RULES,
  'volau': VOLAU_RULES,
  'jon-command-center': JCC_RULES,
  'kai': KAI_RULES,
};

// ── Service ──

/**
 * Process a UI adapter request.
 * Validates input, evaluates route/action, infers intent if needed,
 * and returns a frontend-safe response with commands.
 */
export function processUiAdapterRequest(
  input: KaiUiAdapterRequest,
  authContext: UiAdapterAuthContext,
): KaiUiAdapterResponse {
  // 1. Validate request
  const validation = validateUiAdapterRequest(input);
  if (!validation.valid) {
    return makeFailedResponse(input, validation.errors);
  }

  // 2. Use JWT/auth context as authoritative
  const appId = input.appId as KaiUiAdapterAppId;
  const userRole = (authContext.userRole.replace(/_/g, '-')) as KaiUiAdapterRole;

  // 3. Sanitize metadata
  const sanitizedMeta = sanitizeUiAdapterMetadata(input.metadata);

  // 4. Route-key based evaluation
  if (input.routeKey) {
    return resolveRouteRequest(appId, userRole, input.routeKey, input, sanitizedMeta);
  }

  // 5. Action-key based evaluation
  if (input.actionKey) {
    return resolveActionRequest(appId, userRole, input.actionKey, input, sanitizedMeta);
  }

  // 6. Support request type
  if (input.supportRequestType) {
    return resolveSupportRequest(appId, userRole, input.supportRequestType, input, sanitizedMeta);
  }

  // 7. Message-based intent inference (deterministic only)
  if (input.message) {
    return inferAndResolveFromMessage(appId, userRole, input.message, input, sanitizedMeta);
  }

  // 8. No actionable input
  return {
    appId,
    decision: 'unsupported',
    riskLevel: 'low',
    message: 'No route, action, support request type, or message was provided. Please specify what you need.',
    commands: [buildUnsupportedCommand('No actionable input provided.')],
    clientRequestId: input.clientRequestId,
  };
}

/**
 * Infer intent from a message using deterministic keyword matching.
 * Returns the matched rule or undefined if ambiguous/no match.
 */
export function inferIntentFromMessage(
  appId: string,
  message: string,
): { routeKey: string; intentType: KaiUiIntentType; supportType?: string } | undefined {
  const rules = INTENT_RULES_BY_APP[appId];
  if (!rules) return undefined;

  const lower = message.toLowerCase();

  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return {
          routeKey: rule.routeKey,
          intentType: rule.intentType,
          supportType: rule.supportType,
        };
      }
    }
  }

  return undefined;
}

/**
 * Resolve a request when a specific routeKey is provided.
 */
export function resolveRequestedRouteOrAction(
  appId: string,
  routeKey?: string,
  actionKey?: string,
): { route?: KaiRouteRegistryEntry; action?: KaiActionRegistryEntry } {
  const result: { route?: KaiRouteRegistryEntry; action?: KaiActionRegistryEntry } = {};
  if (routeKey) {
    result.route = getRegistryRouteByKey(appId as KaiSupportedAppId, routeKey);
  }
  if (actionKey) {
    result.action = getRegistryActionByKey(appId as KaiSupportedAppId, actionKey);
  }
  return result;
}

/**
 * Map a Navigation Core decision to a UI adapter decision.
 */
export function mapNavigationDecisionToUiResponse(
  navResult: KaiNavigationResult,
): { decision: KaiUiDecision; riskLevel: KaiUiRiskLevel } {
  const riskLevel = navResult.riskLevel as KaiUiRiskLevel;

  switch (navResult.decision) {
    case 'allowed':
      return { decision: 'allowed', riskLevel };
    case 'requires_confirmation':
      return { decision: 'requires_confirmation', riskLevel };
    case 'requires_admin_approval':
      return { decision: 'requires_admin_review', riskLevel };
    case 'blocked':
      return { decision: 'blocked', riskLevel };
    case 'not_found':
      return { decision: 'not_found', riskLevel };
    case 'unsupported':
    default:
      return { decision: 'unsupported', riskLevel };
  }
}

/**
 * Map a support decision to a UI adapter response shape.
 */
export function mapSupportDecisionToUiResponse(
  supportType: string,
  appId: string,
): KaiUiSupportRequestSuggestion {
  return {
    requestType: supportType,
    title: `${supportType.replace(/_/g, ' ')} request`,
    description: `A ${supportType.replace(/_/g, ' ')} has been suggested for ${appId}.`,
    urgency: 'medium',
    requiresAdminReview: false,
    estimatedComplexity: 'moderate',
    suggestedNextStep: 'Review the suggestion and submit via the support form if needed.',
  };
}

/**
 * Create a receipt summary for a UI adapter request/response pair.
 */
export function createUiAdapterReceipt(
  input: KaiUiAdapterRequest,
  response: KaiUiAdapterResponse,
  authContext: UiAdapterAuthContext,
): KaiUiReceiptSummary {
  const receiptType = resolveReceiptType(response.decision);

  return {
    receiptType,
    created: new Date().toISOString(),
    receiptId: `ui_rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    summary: `UI adapter ${response.decision} for ${input.appId}: ${response.message.slice(0, 100)}`,
  };
}

// ── Private Helpers ──

function resolveRouteRequest(
  appId: KaiUiAdapterAppId,
  userRole: KaiUiAdapterRole,
  routeKey: string,
  input: KaiUiAdapterRequest,
  sanitizedMeta?: Record<string, unknown>,
): KaiUiAdapterResponse {
  const navCore = new KaiNavigationCore();

  const context = {
    appId: appId as KaiSupportedAppId,
    userId: 'ui-adapter', // overridden by auth in the router
    userRole: userRole as any,
    currentScreen: input.currentScreen,
    source: 'ui-adapter',
  };

  const intent = { targetRouteKey: routeKey };
  const navResult = navCore.evaluateNavigationRequest(context, intent);
  const { decision, riskLevel } = mapNavigationDecisionToUiResponse(navResult);

  const commands: KaiUiCommand[] = [];
  let confirmation: KaiUiConfirmation | undefined;
  let adminReview: KaiUiAdminReview | undefined;

  if (decision === 'allowed' || decision === 'recommended') {
    if (navResult.routePath) {
      commands.push(buildNavigationCommand({
        routeKey: navResult.routeKey || routeKey,
        routeLabel: navResult.routeLabel || routeKey,
        routePath: navResult.routePath,
      }));
    } else {
      commands.push(buildMessageCommand(navResult.message));
    }
  } else if (decision === 'requires_confirmation') {
    confirmation = {
      required: true,
      reason: navResult.message,
      confirmationLabel: `Confirm navigation to ${navResult.routeLabel || routeKey}`,
      riskLevel,
    };
    commands.push(buildConfirmationCommand(confirmation));
    // Also include the navigation command so frontend knows where to go after confirmation
    if (navResult.routePath) {
      commands.push(buildNavigationCommand({
        routeKey: navResult.routeKey || routeKey,
        routeLabel: navResult.routeLabel || routeKey,
        routePath: navResult.routePath,
      }));
    }
  } else if (decision === 'requires_admin_review') {
    adminReview = {
      required: true,
      reason: navResult.message,
      reviewType: 'navigation_access',
      suggestedQueue: `${appId}_admin_review`,
    };
    commands.push(buildAdminReviewCommand(adminReview));
  } else if (decision === 'blocked') {
    commands.push(buildBlockedCommand(navResult.message));
  } else if (decision === 'not_found') {
    commands.push(buildUnsupportedCommand(navResult.message));
  }

  const response: KaiUiAdapterResponse = {
    appId,
    decision,
    riskLevel,
    message: navResult.message,
    commands,
    routeKey: navResult.routeKey || routeKey,
    confirmation,
    adminReview,
    clientRequestId: input.clientRequestId,
  };

  // Attach receipt
  const receipt = createUiAdapterReceipt(input, response, { userId: '', appId, userRole });
  response.receiptSummary = receipt;

  return response;
}

function resolveActionRequest(
  appId: KaiUiAdapterAppId,
  userRole: KaiUiAdapterRole,
  actionKey: string,
  input: KaiUiAdapterRequest,
  sanitizedMeta?: Record<string, unknown>,
): KaiUiAdapterResponse {
  const navCore = new KaiNavigationCore();

  const context = {
    appId: appId as KaiSupportedAppId,
    userId: 'ui-adapter',
    userRole: userRole as any,
    currentScreen: input.currentScreen,
    source: 'ui-adapter',
  };

  const intent = { targetActionKey: actionKey };
  const navResult = navCore.evaluateNavigationRequest(context, intent);
  const { decision, riskLevel } = mapNavigationDecisionToUiResponse(navResult);

  const commands: KaiUiCommand[] = [];
  let confirmation: KaiUiConfirmation | undefined;
  let adminReview: KaiUiAdminReview | undefined;

  if (decision === 'allowed') {
    commands.push(buildMessageCommand(navResult.message));
  } else if (decision === 'requires_confirmation') {
    confirmation = {
      required: true,
      reason: navResult.message,
      confirmationLabel: `Confirm action: ${actionKey}`,
      riskLevel,
    };
    commands.push(buildConfirmationCommand(confirmation));
  } else if (decision === 'requires_admin_review') {
    adminReview = {
      required: true,
      reason: navResult.message,
      reviewType: 'action_approval',
      suggestedQueue: `${appId}_admin_review`,
    };
    commands.push(buildAdminReviewCommand(adminReview));
  } else if (decision === 'blocked') {
    commands.push(buildBlockedCommand(navResult.message));
  } else {
    commands.push(buildUnsupportedCommand(navResult.message));
  }

  const response: KaiUiAdapterResponse = {
    appId,
    decision,
    riskLevel,
    message: navResult.message,
    commands,
    actionKey: navResult.actionKey || actionKey,
    confirmation,
    adminReview,
    clientRequestId: input.clientRequestId,
  };

  const receipt = createUiAdapterReceipt(input, response, { userId: '', appId, userRole });
  response.receiptSummary = receipt;

  return response;
}

function resolveSupportRequest(
  appId: KaiUiAdapterAppId,
  userRole: KaiUiAdapterRole,
  supportType: string,
  input: KaiUiAdapterRequest,
  sanitizedMeta?: Record<string, unknown>,
): KaiUiAdapterResponse {
  // Build a support suggestion — does NOT auto-create unless
  // the endpoint explicitly handles creation
  const suggestion = mapSupportDecisionToUiResponse(supportType, appId);
  const commands: KaiUiCommand[] = [buildSupportFormCommand(suggestion)];

  const response: KaiUiAdapterResponse = {
    appId,
    decision: 'recommended',
    riskLevel: 'low',
    message: `A support request suggestion has been prepared. Please review and submit via the support form.`,
    commands,
    supportRequestSuggestion: suggestion,
    clientRequestId: input.clientRequestId,
  };

  const receipt = createUiAdapterReceipt(input, response, { userId: '', appId, userRole });
  response.receiptSummary = receipt;

  return response;
}

function inferAndResolveFromMessage(
  appId: KaiUiAdapterAppId,
  userRole: KaiUiAdapterRole,
  message: string,
  input: KaiUiAdapterRequest,
  sanitizedMeta?: Record<string, unknown>,
): KaiUiAdapterResponse {
  const inferred = inferIntentFromMessage(appId, message);

  if (!inferred) {
    // Ambiguous — do not guess high-risk actions
    const response: KaiUiAdapterResponse = {
      appId,
      decision: 'not_found',
      riskLevel: 'low',
      message: `I wasn't able to determine what you need from "${message.slice(0, 100)}". Could you be more specific? Try mentioning a feature name or asking about a specific screen.`,
      commands: [buildMessageCommand('Could you be more specific about what you need?')],
      clientRequestId: input.clientRequestId,
    };

    const receipt = createUiAdapterReceipt(input, response, { userId: '', appId, userRole });
    response.receiptSummary = receipt;

    return response;
  }

  // If it's a support/report issue type
  if (inferred.intentType === 'report_issue' && inferred.supportType) {
    return resolveSupportRequest(appId, userRole, inferred.supportType, input, sanitizedMeta);
  }

  // Otherwise resolve as a route
  return resolveRouteRequest(appId, userRole, inferred.routeKey, input, sanitizedMeta);
}

function makeFailedResponse(
  input: Partial<KaiUiAdapterRequest>,
  errors: string[],
): KaiUiAdapterResponse {
  return {
    appId: (input.appId || 'kai') as KaiUiAdapterAppId,
    decision: 'failed',
    riskLevel: 'low',
    message: `Request validation failed: ${errors.join(' ')}`,
    commands: [],
    errors,
    clientRequestId: input.clientRequestId,
  };
}

function resolveReceiptType(decision: KaiUiDecision): string {
  switch (decision) {
    case 'allowed':
    case 'recommended':
    case 'requires_confirmation':
    case 'requires_admin_review':
      return 'kai_ui_adapter_navigation_response';
    case 'blocked':
      return 'kai_ui_adapter_blocked';
    case 'unsupported':
    case 'not_found':
      return 'kai_ui_adapter_unsupported';
    case 'failed':
    default:
      return 'kai_ui_adapter_request_received';
  }
}
