// ── Kai Task Orchestrator — Priority Scoring Engine ──

import { PriorityWeights, TaskPriority } from './types';

/** Weight multipliers for each scoring dimension */
const DIMENSION_WEIGHTS = {
  userBlocking: 1.5,
  launchBlocking: 1.4,
  securityRisk: 1.6,
  revenueImpact: 1.3,
  affectedUsers: 1.1,
  dependencyImportance: 1.2,
  founderUrgency: 1.4,
  estimatedEffort: 0.8, // Quick wins get a boost
};

const DEFAULT_WEIGHTS: PriorityWeights = {
  userBlocking: 5,
  launchBlocking: 5,
  securityRisk: 3,
  revenueImpact: 3,
  affectedUsers: 5,
  dependencyImportance: 4,
  founderUrgency: 5,
  estimatedEffort: 5,
};

/**
 * Calculate a priority score from 0-100 based on weighted dimensions.
 */
export function calculatePriorityScore(weights: Partial<PriorityWeights>): number {
  const w: PriorityWeights = { ...DEFAULT_WEIGHTS, ...weights };

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [key, multiplier] of Object.entries(DIMENSION_WEIGHTS)) {
    const value = w[key as keyof PriorityWeights] ?? 5;
    const clamped = Math.max(0, Math.min(10, value));
    totalWeightedScore += clamped * multiplier;
    totalWeight += 10 * multiplier;
  }

  return Math.round((totalWeightedScore / totalWeight) * 100);
}

/**
 * Determine priority tier from score.
 */
export function scoreToPriority(score: number): TaskPriority {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

/**
 * Generate a human explanation for why a task is ranked high.
 */
export function explainPriority(weights: Partial<PriorityWeights>, score: number): string {
  const w: PriorityWeights = { ...DEFAULT_WEIGHTS, ...weights };
  const reasons: string[] = [];

  if (w.userBlocking >= 8) reasons.push('directly blocks end users');
  if (w.launchBlocking >= 8) reasons.push('blocks launch');
  if (w.securityRisk >= 8) reasons.push('security/compliance risk');
  if (w.revenueImpact >= 8) reasons.push('significant revenue impact');
  if (w.affectedUsers >= 8) reasons.push('affects many users');
  if (w.dependencyImportance >= 8) reasons.push('other tasks depend on it');
  if (w.founderUrgency >= 8) reasons.push('flagged as founder-urgent');
  if (w.estimatedEffort >= 8) reasons.push("it's a quick win");

  if (reasons.length === 0) {
    if (score >= 60) reasons.push('multiple medium-high impact factors');
    else reasons.push('standard priority based on overall assessment');
  }

  return `Score ${score}/100 — ${reasons.join(', ')}.`;
}
