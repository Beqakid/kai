import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AssistantPanelContainer } from '../components/AssistantPanelContainer';
import type { AssistantProfile } from '../types';

const mockProfile: AssistantProfile = {
  displayName: 'Vili',
  assistantKey: 'vili',
  appId: 'viliniu',
  welcomeMessage: 'Bula! 👋 How can I help you today?',
  tone: 'friendly',
};

const defaultProps = {
  assistantProfile: mockProfile,
  onClose: vi.fn(),
  onSubmitIntent: vi.fn(),
  handlers: {},
};

describe('AssistantPanelContainer', () => {
  it('returns null when isOpen=false', () => {
    const { container } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when isOpen=true', () => {
    const { getByRole } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} />,
    );
    expect(getByRole('dialog')).toBeTruthy();
  });

  it('shows assistant displayName in header', () => {
    const { getByText } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} />,
    );
    expect(getByText('Vili')).toBeTruthy();
  });

  it('shows welcome message when no response', () => {
    const { getByText } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} />,
    );
    expect(getByText('Bula! 👋 How can I help you today?')).toBeTruthy();
  });

  it('shows error message when error provided', () => {
    const { getByRole } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} error="Something went wrong" />,
    );
    expect(getByRole('alert').textContent).toBe('Something went wrong');
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(getByTestId('panel-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText('Close Vili'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onSubmitIntent when form submitted', () => {
    const onSubmitIntent = vi.fn();
    const { getByLabelText, getByText } = render(
      <AssistantPanelContainer
        {...defaultProps}
        isOpen={true}
        onSubmitIntent={onSubmitIntent}
      />,
    );
    const input = getByLabelText('Ask Vili');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(getByText('Send'));
    expect(onSubmitIntent).toHaveBeenCalledWith('Hello');
  });

  it('has correct data-layout attribute', () => {
    const { getByTestId } = render(
      <AssistantPanelContainer
        {...defaultProps}
        isOpen={true}
        layout="desktop-float"
      />,
    );
    expect(getByTestId('assistant-panel').getAttribute('data-layout')).toBe('desktop-float');
  });

  it('input placeholder includes displayName', () => {
    const { getByPlaceholderText } = render(
      <AssistantPanelContainer {...defaultProps} isOpen={true} />,
    );
    expect(getByPlaceholderText('Ask Vili anything…')).toBeTruthy();
  });
});
