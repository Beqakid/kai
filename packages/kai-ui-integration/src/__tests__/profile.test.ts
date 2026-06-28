import { describe, it, expect } from 'vitest';
import { getAssistantProfile, getAvailableProfiles, isValidProfile } from '../profile';

describe('getAssistantProfile', () => {
  it('returns Vili defaults for viliniu', () => {
    const profile = getAssistantProfile('viliniu');
    expect(profile.displayName).toBe('Vili');
    expect(profile.assistantKey).toBe('vili');
    expect(profile.appId).toBe('viliniu');
    expect(profile.welcomeMessage).toBe('Bula! 👋 How can I help you today?');
    expect(profile.tone).toBe('friendly-fiji-business');
  });

  it('returns Carehia defaults', () => {
    const profile = getAssistantProfile('carehia');
    expect(profile.displayName).toBe('Kai');
    expect(profile.assistantKey).toBe('kai-carehia');
    expect(profile.appId).toBe('carehia');
    expect(profile.welcomeMessage).toBe('Hi there! How can I assist you?');
    expect(profile.tone).toBe('warm-professional');
  });

  it('merges overrides correctly', () => {
    const profile = getAssistantProfile('viliniu', {
      welcomeMessage: 'Custom welcome!',
      tone: 'custom-tone',
    });
    expect(profile.displayName).toBe('Vili');
    expect(profile.welcomeMessage).toBe('Custom welcome!');
    expect(profile.tone).toBe('custom-tone');
    expect(profile.appId).toBe('viliniu');
  });

  it('overrides cannot change appId', () => {
    const profile = getAssistantProfile('viliniu', {
      appId: 'carehia',
      displayName: 'Custom',
    });
    expect(profile.appId).toBe('viliniu');
    expect(profile.displayName).toBe('Custom');
  });

  it('throws for unknown appId', () => {
    expect(() => getAssistantProfile('unknown-app' as any)).toThrow(
      '[kai-integration] Unknown appId: unknown-app',
    );
  });
});

describe('getAvailableProfiles', () => {
  it('returns all 5 app profiles', () => {
    const profiles = getAvailableProfiles();
    const keys = Object.keys(profiles);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('viliniu');
    expect(keys).toContain('carehia');
    expect(keys).toContain('volau');
    expect(keys).toContain('jon-command-center');
    expect(keys).toContain('kai');
  });
});

describe('isValidProfile', () => {
  it('returns true for valid profiles', () => {
    const profile = getAssistantProfile('viliniu');
    expect(isValidProfile(profile)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidProfile(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidProfile(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isValidProfile({})).toBe(false);
  });

  it('returns false for missing displayName', () => {
    expect(
      isValidProfile({
        assistantKey: 'test',
        appId: 'test',
        welcomeMessage: 'hi',
        tone: 'nice',
      }),
    ).toBe(false);
  });

  it('returns false for empty displayName', () => {
    expect(
      isValidProfile({
        displayName: '',
        assistantKey: 'test',
        appId: 'test',
        welcomeMessage: 'hi',
        tone: 'nice',
      }),
    ).toBe(false);
  });

  it('returns false for missing assistantKey', () => {
    expect(
      isValidProfile({
        displayName: 'Test',
        appId: 'test',
        welcomeMessage: 'hi',
        tone: 'nice',
      }),
    ).toBe(false);
  });
});
