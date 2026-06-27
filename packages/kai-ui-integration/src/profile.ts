// ── Assistant Profile Factory ──
// Creates branded assistant profiles for host apps.
// Default profile is Viliniu's "Vili" assistant.

import type { AssistantProfile, AssistantProfileOverrides } from './types';
import type { KaiAppId } from '@kai/ui-sdk';

// ── Preset Profiles ──

const VILINIU_PROFILE: AssistantProfile = {
  displayName: 'Vili',
  assistantKey: 'vili',
  appId: 'viliniu',
  welcomeMessage: 'Bula! 👋 How can I help you today?',
  tone: 'friendly-fiji-business',
};

const CAREHIA_PROFILE: AssistantProfile = {
  displayName: 'Kai',
  assistantKey: 'kai-carehia',
  appId: 'carehia',
  welcomeMessage: 'Hi there! How can I assist you?',
  tone: 'warm-professional',
};

const VOLAU_PROFILE: AssistantProfile = {
  displayName: 'Kai',
  assistantKey: 'kai-volau',
  appId: 'volau',
  welcomeMessage: 'Hello! How can I help?',
  tone: 'professional',
};

const JCC_PROFILE: AssistantProfile = {
  displayName: 'Kai',
  assistantKey: 'kai-jcc',
  appId: 'jon-command-center',
  welcomeMessage: 'Welcome. What would you like to do?',
  tone: 'direct-professional',
};

const KAI_PROFILE: AssistantProfile = {
  displayName: 'Kai',
  assistantKey: 'kai',
  appId: 'kai',
  welcomeMessage: 'Hi! I\'m Kai. How can I help?',
  tone: 'helpful-direct',
};

/** Map of app IDs to their default profiles */
const PROFILE_PRESETS: Record<KaiAppId, AssistantProfile> = {
  viliniu: VILINIU_PROFILE,
  carehia: CAREHIA_PROFILE,
  volau: VOLAU_PROFILE,
  'jon-command-center': JCC_PROFILE,
  kai: KAI_PROFILE,
};

/**
 * Get the default assistant profile for an app.
 * Optionally override any fields.
 *
 * @example
 * // Default Viliniu profile
 * const profile = getAssistantProfile('viliniu');
 * // profile.displayName === 'Vili'
 *
 * @example
 * // Override welcome message
 * const profile = getAssistantProfile('viliniu', { welcomeMessage: 'Yo!' });
 */
export function getAssistantProfile(
  appId: KaiAppId,
  overrides?: AssistantProfileOverrides,
): AssistantProfile {
  const preset = PROFILE_PRESETS[appId];
  if (!preset) {
    throw new Error(`[kai-integration] Unknown appId: ${appId}`);
  }
  if (!overrides) return { ...preset };

  // Never let overrides change the appId from the function argument
  const { appId: _ignoredAppId, ...safeOverrides } = overrides;

  return {
    ...preset,
    ...safeOverrides,
    appId, // Always use the argument appId
  };
}

/**
 * Get all available profile presets.
 */
export function getAvailableProfiles(): Record<KaiAppId, AssistantProfile> {
  // Return copies to prevent mutation
  const result: Record<string, AssistantProfile> = {};
  for (const [key, value] of Object.entries(PROFILE_PRESETS)) {
    result[key] = { ...value };
  }
  return result as Record<KaiAppId, AssistantProfile>;
}

/**
 * Validate an assistant profile has all required fields.
 */
export function isValidProfile(profile: unknown): profile is AssistantProfile {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Record<string, unknown>;
  return (
    typeof p.displayName === 'string' &&
    p.displayName.length > 0 &&
    typeof p.assistantKey === 'string' &&
    p.assistantKey.length > 0 &&
    typeof p.appId === 'string' &&
    p.appId.length > 0 &&
    typeof p.welcomeMessage === 'string' &&
    typeof p.tone === 'string'
  );
}
