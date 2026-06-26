// ── Kai UI Adapter — Example Adapters ──
//
// Phase 11 Phase 3: Example request/response pairs for each app.
// These are used in tests and documentation to demonstrate the
// UI adapter contract behavior.
//
// Safety: All examples show recommendation-only responses.
// No external app data is modified.

import type { KaiUiAdapterRequest, KaiUiAdapterResponse } from './types';
import { processUiAdapterRequest, UiAdapterAuthContext } from './adapter-service';

// ── Example Definitions ──

export interface UiAdapterExample {
  name: string;
  description: string;
  request: KaiUiAdapterRequest;
  authContext: UiAdapterAuthContext;
  /** Expected decision (for documentation/testing) */
  expectedDecision: string;
  /** Expected primary command type (for documentation/testing) */
  expectedCommandType: string;
}

// ── Carehia: Caregiver asking about CPR certificate ──

export const CAREHIA_CPR_EXAMPLE: UiAdapterExample = {
  name: 'Carehia — Caregiver CPR Upload',
  description: 'A caregiver asks where to upload their CPR certificate.',
  request: {
    appId: 'carehia',
    userRole: 'caregiver',
    message: 'Where do I upload my CPR certificate?',
    currentScreen: '/today',
    clientRequestId: 'example-carehia-cpr-001',
  },
  authContext: {
    userId: 'caregiver-001',
    appId: 'carehia',
    userRole: 'caregiver',
  },
  expectedDecision: 'requires_admin_review',
  expectedCommandType: 'request_admin_review',
};

// ── Viliniu: Vendor payout details ──

export const VILINIU_PAYOUT_EXAMPLE: UiAdapterExample = {
  name: 'Viliniu — Vendor Payout Change',
  description: 'A vendor wants to change their payout details.',
  request: {
    appId: 'viliniu',
    userRole: 'vendor',
    message: 'I need to change my payout details',
    currentScreen: '/dashboard',
    clientRequestId: 'example-viliniu-payout-001',
  },
  authContext: {
    userId: 'vendor-001',
    appId: 'viliniu',
    userRole: 'vendor',
  },
  expectedDecision: 'requires_admin_review',
  expectedCommandType: 'request_admin_review',
};

// ── Volau: Public user reports wrong info ──

export const VOLAU_WRONG_INFO_EXAMPLE: UiAdapterExample = {
  name: 'Volau — Report Wrong Information',
  description: 'A public user reports incorrect plant information.',
  request: {
    appId: 'volau',
    userRole: 'public-user',
    message: 'This plant information is wrong',
    currentScreen: '/species/orchid-001',
    clientRequestId: 'example-volau-report-001',
  },
  authContext: {
    userId: 'public-user-001',
    appId: 'volau',
    userRole: 'public-user',
  },
  expectedDecision: 'recommended',
  expectedCommandType: 'open_support_form',
};

// ── JCC: Super-admin views Carehia blockers ──

export const JCC_BLOCKERS_EXAMPLE: UiAdapterExample = {
  name: 'JCC — Carehia Blockers',
  description: 'A super-admin asks to see Carehia blockers.',
  request: {
    appId: 'jon-command-center',
    userRole: 'super-admin',
    message: 'Show me Carehia blockers',
    currentScreen: '/dashboard',
    clientRequestId: 'example-jcc-blockers-001',
  },
  authContext: {
    userId: 'admin-001',
    appId: 'jon-command-center',
    userRole: 'super-admin',
  },
  expectedDecision: 'allowed',
  expectedCommandType: 'navigate_to_route',
};

// ── All examples ──

export const ALL_EXAMPLES: UiAdapterExample[] = [
  CAREHIA_CPR_EXAMPLE,
  VILINIU_PAYOUT_EXAMPLE,
  VOLAU_WRONG_INFO_EXAMPLE,
  JCC_BLOCKERS_EXAMPLE,
];

/**
 * Run an example through the adapter service and return the response.
 * Useful for testing and documentation generation.
 */
export function runExample(example: UiAdapterExample): KaiUiAdapterResponse {
  return processUiAdapterRequest(example.request, example.authContext);
}
