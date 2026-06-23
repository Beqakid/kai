// ── ProofTrust Bridge — Interface & Lite Implementation ──
//
// Phase 7: Creates a clean bridge layer so Kai's safety decisions, receipts,
// approvals, blocked actions, and risk evaluations can later be routed through
// a reusable ProofTrust Engine without hardcoding app-specific trust logic.
//
// ProofTrustBridgeLite:
// - Uses existing Kai Action Receipts.
// - Does not connect to an external service.
// - Does not create new production trust tables.
// - Does not execute actions.
// - Does not override the Permission Gate.
// - Converts Kai events into ProofTrust-shaped receipt records.
// - Returns simple allow/deny/requiresConfirmation/requiresAdminApproval
//   results based on existing gate decisions.
//
// Safety invariants:
// - Sensitive actions remain blocked.
// - Bridge never bypasses the Permission Gate.
// - Bridge never bypasses the Pending Confirmation Workflow.
// - No app-specific (Carehia/Viliniu/Volau/JCC) logic is hardcoded.
// - No tokens, secrets, raw audio, or private documents in metadata.

import { VALID_APP_IDS } from '../types';
import { ActionReceiptLogger } from '../services/action-receipt-logger';
import {
  KaiPermissionGate,
  GateDecision,
  GateRiskLevel,
} from '../services/kai-permission-gate';
import {
  ProofTrustReceiptInput,
  ProofTrustActionInput,
  ProofTrustApprovalRequest,
  ProofTrustEvaluationResult,
  ProofTrustTrustStatus,
  ProofTrustReceiptType,
  ProofTrustRiskLevel,
  ProofTrustDecision,
  PROOFTRUST_RECEIPT_TYPES,
  PROOFTRUST_RISK_LEVELS,
  KAI_TO_PROOFTRUST_RECEIPT_MAP,
  mapKaiRiskToProofTrust,
  mapKaiGateDecisionToProofTrust,
  sanitizeProofTrustMetadata,
} from './types';

// ── Bridge Version ──

export const PROOFTRUST_BRIDGE_VERSION = '0.1.0';

// ── Interface ──

/**
 * ProofTrustBridge — the reusable interface that future ProofTrust Engine
 * implementations will satisfy. For now, ProofTrustBridgeLite provides
 * a lightweight version backed by existing Kai infrastructure.
 */
export interface ProofTrustBridge {
  /** Create a ProofTrust-shaped receipt through the existing receipt system. */
  createReceipt(input: ProofTrustReceiptInput): Promise<void>;

  /** Evaluate an action — mirrors/enriches the existing gate decision. */
  evaluateAction(input: ProofTrustActionInput): ProofTrustEvaluationResult;

  /** Request approval for a medium-risk action. */
  requireApproval(input: ProofTrustApprovalRequest): ProofTrustEvaluationResult;

  /** Record a blocked action event. */
  recordBlockedAction(input: ProofTrustActionInput): Promise<void>;

  /** Record an AI recommendation event. */
  recordAiRecommendation(input: ProofTrustActionInput): Promise<void>;

  /** Record a prepared action event. */
  recordPreparedAction(input: ProofTrustActionInput): Promise<void>;

  /** Record a confirmed action event. */
  recordConfirmedAction(input: ProofTrustActionInput): Promise<void>;

  /** Record a denied action event. */
  recordDeniedAction(input: ProofTrustActionInput): Promise<void>;

  /** Record an expired action event. */
  recordExpiredAction(input: ProofTrustActionInput): Promise<void>;

  /** Record an executed action event. */
  recordExecutedAction(input: ProofTrustActionInput): Promise<void>;

  /** Get the current trust system status. */
  getTrustStatus(input?: { appId?: string }): ProofTrustTrustStatus;
}

// ── Lite Implementation ──

/**
 * ProofTrustBridgeLite — lightweight bridge backed by existing Kai systems.
 *
 * This implementation:
 * - Routes receipts through ActionReceiptLogger (existing D1 table).
 * - Mirrors gate decisions from KaiPermissionGate.
 * - Enriches receipt metadata with ProofTrust-shaped fields.
 * - Never executes actions or overrides the gate.
 */
export class ProofTrustBridgeLite implements ProofTrustBridge {
  private readonly receiptLogger: ActionReceiptLogger;
  private readonly gate: KaiPermissionGate;

  constructor(receiptLogger: ActionReceiptLogger, gate: KaiPermissionGate) {
    this.receiptLogger = receiptLogger;
    this.gate = gate;
  }

  // ── createReceipt ──

  async createReceipt(input: ProofTrustReceiptInput): Promise<void> {
    const sanitizedMeta = sanitizeProofTrustMetadata(input.metadata);

    // Map ProofTrust receipt type back to Kai receipt type for storage
    const kaiReceiptType = this.mapToKaiReceiptType(input.receiptType);

    // Write through ActionReceiptLogger with ProofTrust enrichment
    await this.receiptLogger.logProofTrustReceipt({
      appId: input.appId,
      userId: input.actorId,
      userRole: input.actorRole,
      project: input.project,
      sessionId: input.sessionId,
      source: input.source,
      requestId: input.requestId,
      taskId: input.taskId,
      receiptType: kaiReceiptType,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      riskLevel: input.riskLevel,
      requiresConfirmation: input.requiresConfirmation,
      metadata: {
        ...sanitizedMeta,
        proofTrustBridgeVersion: PROOFTRUST_BRIDGE_VERSION,
        proofTrustDecision: input.decision,
        proofTrustReceiptType: input.receiptType,
        targetType: input.targetType,
        targetId: input.targetId,
        tenantId: input.tenantId,
      },
    });
  }

  // ── evaluateAction ──

  evaluateAction(input: ProofTrustActionInput): ProofTrustEvaluationResult {
    // Run through the existing gate — gate remains authoritative
    const gateDecision = this.gate.evaluate({
      appId: input.appId,
      userId: input.actorId,
      userRole: input.actorRole,
      actionType: input.actionType,
      requestedAction: input.actionSummary || `ProofTrust evaluate: ${input.actionType}`,
      taskId: input.taskId,
      sessionId: input.sessionId,
      source: input.source || 'prooftrust-bridge',
      metadata: sanitizeProofTrustMetadata(input.metadata),
    });

    return this.gateToEvaluationResult(gateDecision);
  }

  // ── requireApproval ──

  requireApproval(input: ProofTrustApprovalRequest): ProofTrustEvaluationResult {
    // Evaluate through gate first
    const gateDecision = this.gate.evaluate({
      appId: input.appId,
      userId: input.actorId,
      userRole: input.actorRole,
      actionType: input.actionType,
      requestedAction: input.actionSummary,
      taskId: input.taskId,
      sessionId: input.sessionId,
      source: 'prooftrust-bridge',
    });

    const result = this.gateToEvaluationResult(gateDecision);

    // If the gate allows it but the bridge explicitly requests confirmation,
    // upgrade to requiresConfirmation (bridge can tighten but never loosen).
    if (result.decision === 'allow') {
      return {
        ...result,
        decision: 'requiresConfirmation',
        requiresConfirmation: true,
        reason: input.reason || result.reason,
      };
    }

    return result;
  }

  // ── Lifecycle Event Recorders ──

  async recordBlockedAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_blocked', 'deny');
  }

  async recordAiRecommendation(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_recommendation_generated', 'allow');
  }

  async recordPreparedAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_prepared', 'requiresConfirmation');
  }

  async recordConfirmedAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_confirmed', 'allow');
  }

  async recordDeniedAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_denied', 'deny');
  }

  async recordExpiredAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_expired', 'deny');
  }

  async recordExecutedAction(input: ProofTrustActionInput): Promise<void> {
    await this.recordEvent(input, 'ai_action_executed', 'allow');
  }

  // ── getTrustStatus ──

  getTrustStatus(_input?: { appId?: string }): ProofTrustTrustStatus {
    return {
      bridgeMode: 'lite',
      engineConnected: false,
      receiptBackend: 'kai_action_receipts',
      supportedApps: [...VALID_APP_IDS],
      supportedReceiptTypes: PROOFTRUST_RECEIPT_TYPES,
      supportedRiskLevels: PROOFTRUST_RISK_LEVELS,
      proofTrustBridgeVersion: PROOFTRUST_BRIDGE_VERSION,
      note: 'ProofTrustBridgeLite is active. Full ProofTrust Engine is not connected yet.',
    };
  }

  // ── Private Helpers ──

  /**
   * Record a lifecycle event as a ProofTrust receipt.
   * Fire-and-forget — never throws.
   */
  private async recordEvent(
    input: ProofTrustActionInput,
    receiptType: ProofTrustReceiptType,
    decision: ProofTrustDecision,
  ): Promise<void> {
    try {
      await this.createReceipt({
        appId: input.appId,
        tenantId: input.tenantId,
        project: input.project,
        actorId: input.actorId,
        actorRole: input.actorRole,
        actorWorkspace: input.actorWorkspace,
        actionType: input.actionType,
        actionSummary: input.actionSummary || `${receiptType}: ${input.actionType}`,
        targetType: input.targetType,
        targetId: input.targetId,
        source: input.source || 'prooftrust-bridge',
        riskLevel: input.riskLevel,
        decision,
        reason: `Event recorded: ${receiptType}`,
        requiresConfirmation: decision === 'requiresConfirmation',
        requiresAdminApproval: decision === 'requiresAdminApproval',
        receiptType,
        sessionId: input.sessionId,
        taskId: input.taskId,
        requestId: input.requestId,
        metadata: input.metadata,
      });
    } catch (err) {
      // Never throw — bridge failures must not block user operations
      console.warn(
        '[ProofTrustBridgeLite] Failed to record event:',
        receiptType,
        (err as Error).message,
      );
    }
  }

  /** Convert a gate decision to a ProofTrust evaluation result. */
  private gateToEvaluationResult(gate: GateDecision): ProofTrustEvaluationResult {
    return {
      decision: mapKaiGateDecisionToProofTrust(gate),
      riskLevel: mapKaiRiskToProofTrust(gate.riskLevel),
      requiresConfirmation: gate.requiresConfirmation,
      requiresAdminApproval: gate.requiresAdminApproval,
      reason: gate.reason,
      bridgeMode: 'lite',
    };
  }

  /** Map a ProofTrust receipt type back to a Kai receipt type for storage. */
  private mapToKaiReceiptType(ptType: ProofTrustReceiptType): string {
    // Reverse lookup
    for (const [kaiType, ptMapped] of Object.entries(KAI_TO_PROOFTRUST_RECEIPT_MAP)) {
      if (ptMapped === ptType) return kaiType;
    }
    // Fallback: prefix with kai_ and convert
    return `kai_${ptType}`;
  }
}
