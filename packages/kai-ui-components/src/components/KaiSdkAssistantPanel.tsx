// ── KaiSdkAssistantPanel ──
// Convenience component that combines @kai/ui-sdk client with KaiAssistantPanel.
// Calls kaiClient.evaluateIntent on submit. Still does NOT auto-execute commands.
// Still requires host app handlers. No token handling in this component.

import React, { useState, useCallback } from 'react';
import type { KaiSdkAssistantPanelProps, KaiUiAdapterResponse } from '../types';
import { KaiAssistantPanel } from './KaiAssistantPanel';

export function KaiSdkAssistantPanel({
  kaiClient,
  appId,
  role,
  currentScreen,
  handlers,
  theme,
}: KaiSdkAssistantPanelProps): React.ReactElement {
  const [response, setResponse] = useState<KaiUiAdapterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitIntent = useCallback(
    async (message: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await kaiClient.evaluateIntent({ message, role });
        setResponse(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setResponse(null);
      } finally {
        setLoading(false);
      }
    },
    [kaiClient, role],
  );

  return React.createElement(KaiAssistantPanel, {
    appId,
    role,
    currentScreen,
    onSubmitIntent: handleSubmitIntent,
    response,
    handlers,
    loading,
    error,
    theme,
  });
}
