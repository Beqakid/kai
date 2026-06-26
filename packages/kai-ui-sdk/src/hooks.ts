// ── @kai/ui-sdk — React Hooks ──
// Optional React hooks for Kai SDK. React is a peer dependency.
// Import from '@kai/ui-sdk/react' or '@kai/ui-sdk' (hooks are re-exported).
//
// Hooks never store auth tokens, never auto-execute commands without handlers.

import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  KaiClientConfig,
  KaiUiAdapterResponse,
  KaiUserRole,
  KaiCommandHandlerMap,
  KaiUiCommand,
} from './types';
import { createKaiClient, type KaiClient } from './client';
import { handleKaiCommands } from './commands';

/**
 * Create and memoize a Kai client instance.
 * The client reference is stable across re-renders (config is captured at creation).
 */
export function useKaiClient(config: KaiClientConfig): KaiClient {
  const clientRef = useRef<KaiClient | null>(null);
  const configRef = useRef(config);

  // Only recreate if baseUrl or appId changes
  if (
    !clientRef.current ||
    configRef.current.baseUrl !== config.baseUrl ||
    configRef.current.appId !== config.appId
  ) {
    configRef.current = config;
    clientRef.current = createKaiClient(config);
  }

  return clientRef.current;
}

interface KaiIntentState {
  loading: boolean;
  error: Error | null;
  lastResponse: KaiUiAdapterResponse | null;
  evaluateIntent: (message: string, opts?: {
    role?: KaiUserRole;
    metadata?: Record<string, unknown>;
  }) => Promise<KaiUiAdapterResponse | null>;
  evaluateNavigation: (routeKey: string, metadata?: Record<string, unknown>) => Promise<KaiUiAdapterResponse | null>;
  evaluateAction: (actionKey: string, metadata?: Record<string, unknown>) => Promise<KaiUiAdapterResponse | null>;
  clearResponse: () => void;
}

/**
 * Hook for evaluating intents, navigation, and actions.
 * Manages loading/error/lastResponse state.
 */
export function useKaiIntent(client: KaiClient): KaiIntentState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResponse, setLastResponse] = useState<KaiUiAdapterResponse | null>(null);

  const evaluateIntent = useCallback(
    async (
      message: string,
      opts?: { role?: KaiUserRole; metadata?: Record<string, unknown> }
    ): Promise<KaiUiAdapterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.evaluateIntent({
          message,
          role: opts?.role,
          metadata: opts?.metadata,
        });
        setLastResponse(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const evaluateNavigation = useCallback(
    async (
      routeKey: string,
      metadata?: Record<string, unknown>
    ): Promise<KaiUiAdapterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.evaluateNavigation(routeKey, metadata);
        setLastResponse(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const evaluateAction = useCallback(
    async (
      actionKey: string,
      metadata?: Record<string, unknown>
    ): Promise<KaiUiAdapterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.evaluateAction(actionKey, metadata);
        setLastResponse(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const clearResponse = useCallback(() => {
    setLastResponse(null);
    setError(null);
    client.clearLastResponse();
  }, [client]);

  return {
    loading,
    error,
    lastResponse,
    evaluateIntent,
    evaluateNavigation,
    evaluateAction,
    clearResponse,
  };
}

interface KaiNavigationState {
  loading: boolean;
  error: Error | null;
  lastResponse: KaiUiAdapterResponse | null;
  evaluateNavigation: (routeKey: string, metadata?: Record<string, unknown>) => Promise<KaiUiAdapterResponse | null>;
}

/**
 * Convenience hook specifically for navigation evaluation.
 */
export function useKaiNavigation(client: KaiClient): KaiNavigationState {
  const { loading, error, lastResponse, evaluateNavigation } = useKaiIntent(client);
  return { loading, error, lastResponse, evaluateNavigation };
}

interface KaiSupportState {
  loading: boolean;
  error: Error | null;
  lastResponse: KaiUiAdapterResponse | null;
  requestHelp: (message: string, metadata?: Record<string, unknown>) => Promise<KaiUiAdapterResponse | null>;
  reportIssue: (message: string, metadata?: Record<string, unknown>) => Promise<KaiUiAdapterResponse | null>;
}

/**
 * Convenience hook for support-related requests.
 */
export function useKaiSupport(client: KaiClient): KaiSupportState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResponse, setLastResponse] = useState<KaiUiAdapterResponse | null>(null);

  const requestHelp = useCallback(
    async (
      message: string,
      metadata?: Record<string, unknown>
    ): Promise<KaiUiAdapterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.requestHelp(message, metadata);
        setLastResponse(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const reportIssue = useCallback(
    async (
      message: string,
      metadata?: Record<string, unknown>
    ): Promise<KaiUiAdapterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.reportIssue(message, metadata);
        setLastResponse(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { loading, error, lastResponse, requestHelp, reportIssue };
}

/**
 * Hook that creates a command dispatch function from handlers.
 * Never auto-executes — only dispatches when the returned function is called.
 */
export function useKaiCommandHandler(
  handlers: KaiCommandHandlerMap
): {
  handleCommands: (commands: KaiUiCommand[]) => Promise<void>;
  handleResponse: (response: KaiUiAdapterResponse) => Promise<void>;
} {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleCommands = useCallback(
    async (commands: KaiUiCommand[]) => {
      await handleKaiCommands(commands, handlersRef.current);
    },
    []
  );

  const handleResponse = useCallback(
    async (response: KaiUiAdapterResponse) => {
      await handleKaiCommands(response.commands, handlersRef.current);
    },
    []
  );

  return { handleCommands, handleResponse };
}
