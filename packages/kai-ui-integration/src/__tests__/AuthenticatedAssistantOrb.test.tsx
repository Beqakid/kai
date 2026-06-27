import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AuthenticatedAssistantOrb } from '../components/AuthenticatedAssistantOrb';
import type { AssistantProfile } from '../types';

const mockProfile: AssistantProfile = {
  displayName: 'Vili',
  assistantKey: 'vili',
  appId: 'viliniu',
  welcomeMessage: 'Bula!',
  tone: 'friendly',
};

describe('AuthenticatedAssistantOrb', () => {
  it('renders with correct aria-label when closed', () => {
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={() => {}}
      />,
    );
    const orb = getByTestId('assistant-orb');
    expect(orb.getAttribute('aria-label')).toBe('Open Vili assistant');
  });

  it('shows first letter of displayName', () => {
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={() => {}}
      />,
    );
    expect(getByTestId('assistant-orb').textContent).toBe('V');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={handleClick}
      />,
    );
    fireEvent.click(getByTestId('assistant-orb'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={handleClick}
        disabled
      />,
    );
    fireEvent.click(getByTestId('assistant-orb'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('has data-testid="assistant-orb"', () => {
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={() => {}}
      />,
    );
    expect(getByTestId('assistant-orb')).toBeTruthy();
  });

  it('has aria-expanded matching isOpen', () => {
    const { getByTestId, rerender } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={() => {}}
      />,
    );
    expect(getByTestId('assistant-orb').getAttribute('aria-expanded')).toBe('false');

    rerender(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={true}
        onClick={() => {}}
      />,
    );
    expect(getByTestId('assistant-orb').getAttribute('aria-expanded')).toBe('true');
  });

  it('has correct data-assistant-key', () => {
    const { getByTestId } = render(
      <AuthenticatedAssistantOrb
        assistantProfile={mockProfile}
        isOpen={false}
        onClick={() => {}}
      />,
    );
    expect(getByTestId('assistant-orb').getAttribute('data-assistant-key')).toBe('vili');
  });
});
