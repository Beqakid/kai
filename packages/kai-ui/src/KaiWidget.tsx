"use client";

import { useEffect, useMemo, useState } from "react";
import { getKaiGreeting, supportedKaiLanguages, type SupportedKaiLanguage } from "@kai/language";
import { disabledKaiVoiceRuntime } from "@kai/voice";

interface KaiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface KaiWidgetProps {
  apiBaseUrl?: string;
  app?: string;
  assistantName?: string;
  userId?: string;
  userRole?: string;
  initialLanguage?: SupportedKaiLanguage;
}

export function KaiWidget({
  apiBaseUrl = "",
  app = "viliniu",
  assistantName = "Kai",
  userId,
  userRole,
  initialLanguage = "en",
}: KaiWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<SupportedKaiLanguage>(initialLanguage);
  const [sessionId, setSessionId] = useState<string>();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<KaiMessage[]>([
    { id: "greeting", role: "assistant", content: getKaiGreeting(initialLanguage) },
  ]);

  const endpoint = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);

  useEffect(() => {
    const stored = window.localStorage.getItem("kai.preferredLanguage") as SupportedKaiLanguage | null;
    if (stored === "en" || stored === "es" || stored === "fj") {
      setLanguage(stored);
      setMessages([{ id: "greeting", role: "assistant", content: getKaiGreeting(stored) }]);
    }
  }, []);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const response = await fetch(`${endpoint}/api/kai/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app, userId, userRole, language }),
    });
    const data = (await response.json()) as { sessionId: string };
    setSessionId(data.sessionId);
    return data.sessionId;
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setIsLoading(true);

    try {
      const currentSessionId = await ensureSession();
      const response = await fetch(`${endpoint}/api/kai/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app,
          assistantName,
          sessionId: currentSessionId,
          userId,
          userRole,
          language,
          message: trimmed,
        }),
      });
      const data = (await response.json()) as { content?: string };
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.content ?? "I could not answer that yet.",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Kai is not available right now. Please try again soon.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function updateLanguage(nextLanguage: SupportedKaiLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem("kai.preferredLanguage", nextLanguage);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: getKaiGreeting(nextLanguage) },
    ]);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans">
      {isOpen ? (
        <section
          aria-label="Kai AI coach"
          className="flex h-[min(640px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{assistantName}</h2>
              <p className="text-xs text-slate-500">Guide mode</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Kai language"
                value={language}
                onChange={(event) => updateLanguage(event.target.value as SupportedKaiLanguage)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                {supportedKaiLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Minimize Kai"
                onClick={() => setIsOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                -
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-teal-700 px-3 py-2 text-sm text-white"
                    : "mr-auto max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                }
              >
                {message.content}
              </div>
            ))}
            {isLoading ? (
              <div className="mr-auto max-w-[85%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                Kai is thinking...
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-slate-200 bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!disabledKaiVoiceRuntime.pushToTalkEnabled}
                aria-label="Voice support is not enabled yet"
                title="Voice support is not enabled yet"
                className="h-10 w-10 shrink-0 rounded-md border border-slate-200 text-xs text-slate-400 disabled:cursor-not-allowed"
              >
                Mic
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                aria-label="Message Kai"
                placeholder="Ask Kai for guidance..."
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              />
              <button
                type="submit"
                disabled={isLoading || input.trim().length === 0}
                className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          aria-label="Open Kai"
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-teal-700 text-sm font-semibold text-white shadow-lg hover:bg-teal-800"
        >
          Kai
        </button>
      )}
    </div>
  );
}
