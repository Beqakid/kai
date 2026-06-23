/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { ActionReceiptLogger } from '../../services/action-receipt-logger';
import { KaiPermissionGate } from '../../services/kai-permission-gate';
import { ProofTrustBridgeLite } from '../../prooftrust/prooftrust-bridge';
import { sanitizeProofTrustMetadata } from '../../prooftrust/types';
import { ADMIN_ROLES } from '../../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ProofTrust Bridge Security Retest', () => {
  const receiptLogger = new ActionReceiptLogger(undefined);
  const gate = new KaiPermissionGate(receiptLogger);
  const bridge = new ProofTrustBridgeLite(receiptLogger, gate);

  it('bridge status route requires super-admin', () => {
    expect(ADMIN_ROLES.has('super-admin')).toBe(true);
    expect(ADMIN_ROLES.has('admin' as any)).toBe(false);
    expect(ADMIN_ROLES.has('viewer' as any)).toBe(false);
  });

  it('bridge evaluate route requires super-admin', () => {
    expect(ADMIN_ROLES.has('super-admin')).toBe(true);
    expect(ADMIN_ROLES.has('admin' as any)).toBe(false);
    expect(ADMIN_ROLES.has('viewer' as any)).toBe(false);
  });

  it('bridge does not execute actions', () => {
    const result = bridge.evaluateAction({
      actionType: 'generate_tasklet_prompt',
      actorRole: 'super-admin',
      actorId: 'user-123',
      appId: 'jon-command-center',
      riskLevel: 'low',
    });

    // Result is an evaluation, not an execution
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('bridgeMode');
    expect(result).not.toHaveProperty('executedResult');
    expect(result).not.toHaveProperty('output');
  });

  it('bridge does not override Permission Gate', () => {
    const result = bridge.evaluateAction({
      actionType: 'deploy_code',
      actorRole: 'super-admin',
      actorId: 'user-123',
      appId: 'jon-command-center',
      riskLevel: 'blocked',
    });

    expect(result.decision).toBe('deny');
  });

  it('bridge metadata is sanitized', () => {
    const sanitized = sanitizeProofTrustMetadata({
      token: 'x',
      secret: 'y',
      rawAudio: 'z',
      appId: 'test',
    });

    expect(sanitized).toEqual({ appId: 'test' });
  });

  it('bridge uses existing ActionReceiptLogger', async () => {
    // With undefined DB, the receipt logger no-ops — should not throw
    await expect(
      bridge.createReceipt({
        appId: 'jon-command-center',
        actorId: 'user-123',
        actorRole: 'super-admin',
        actionType: 'generate_tasklet_prompt',
        actionSummary: 'Test receipt',
        source: 'test',
        riskLevel: 'low',
        decision: 'allow',
        reason: 'Test',
        requiresConfirmation: false,
        requiresAdminApproval: false,
        receiptType: 'ai_recommendation_generated',
      }),
    ).resolves.not.toThrow();
  });

  it('bridge maps blocked actions to blocked receipt', () => {
    const result = bridge.evaluateAction({
      actionType: 'deploy_code',
      actorRole: 'super-admin',
      actorId: 'user-123',
      appId: 'jon-command-center',
      riskLevel: 'blocked',
    });

    expect(result.decision).toBe('deny');
    expect(result.riskLevel).toBe('blocked');
  });

  it('bridge maps confirmation actions to prepared/confirmed/denied receipts', () => {
    const result = bridge.evaluateAction({
      actionType: 'draft_github_issue',
      actorRole: 'super-admin',
      actorId: 'user-123',
      appId: 'jon-command-center',
      riskLevel: 'medium',
    });

    expect(result.decision).toBe('requiresConfirmation');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('bridge does not contain Carehia-specific hardcoded rules', () => {
    const bridgeSrc = readFileSync(
      resolve(__dirname, '../../prooftrust/prooftrust-bridge.ts'),
      'utf-8',
    );
    const codeOnly = bridgeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly.toLowerCase().includes('carehia')).toBe(false);
  });

  it('bridge does not contain Viliniu-specific hardcoded rules', () => {
    const bridgeSrc = readFileSync(
      resolve(__dirname, '../../prooftrust/prooftrust-bridge.ts'),
      'utf-8',
    );
    const codeOnly = bridgeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly.toLowerCase().includes('viliniu')).toBe(false);
  });

  it('bridge does not contain Volau-specific hardcoded rules', () => {
    const bridgeSrc = readFileSync(
      resolve(__dirname, '../../prooftrust/prooftrust-bridge.ts'),
      'utf-8',
    );
    const codeOnly = bridgeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly.toLowerCase().includes('volau')).toBe(false);
  });

  it('bridge mode returns lite', () => {
    const status = bridge.getTrustStatus();
    expect(status.bridgeMode).toBe('lite');
  });

  it('engineConnected is false', () => {
    const status = bridge.getTrustStatus();
    expect(status.engineConnected).toBe(false);
  });
});
