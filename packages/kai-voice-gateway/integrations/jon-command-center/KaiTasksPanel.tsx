"use client";

import React, { useState, useEffect, useCallback } from "react";

// ── Types ──

interface KaiTask {
  id: string;
  appId: string;
  project: string | null;
  title: string;
  description: string | null;
  source: string;
  priority: "critical" | "high" | "medium" | "low";
  severity: string;
  status: "open" | "in_progress" | "waiting_approval" | "done" | "skipped";
  suggestedAction: string | null;
  riskLevel: string;
  requiresConfirmation: boolean;
  score: number;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KaiTaskAction {
  id: string;
  taskId: string;
  userId: string;
  actionType: string;
  actionSummary: string | null;
  approvalStatus: string;
  result: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface OrchestratorResponse {
  message: string;
  task?: KaiTask;
  action?: KaiTaskAction;
  tasks?: KaiTask[];
  explanation?: string;
  nextRecommendation?: string;
  requiresConfirmation?: boolean;
}

// ── Config ──

const GATEWAY_URL =
  (typeof window !== "undefined" && (window as any).__KAI_GATEWAY_URL__) ||
  "https://kai-voice-gateway.jjioji.workers.dev";

const AUTH_TOKEN =
  (typeof window !== "undefined" && (window as any).__KAI_AUTH_TOKEN__) ||
  "demo-token";

// ── API helpers ──

async function kaiGet(path: string): Promise<OrchestratorResponse> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function kaiPost(
  path: string,
  body: Record<string, unknown>
): Promise<OrchestratorResponse> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Priority colors ──

const PRIORITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  high: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" },
  low: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-purple-100 text-purple-700" },
  waiting_approval: { label: "Waiting", color: "bg-amber-100 text-amber-700" },
  done: { label: "Done", color: "bg-green-100 text-green-700" },
  skipped: { label: "Skipped", color: "bg-gray-100 text-gray-500" },
};

// ── Components ──

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
      {badge.label}
    </span>
  );
}

function PriorityIndicator({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function TaskCard({
  task,
  onAction,
  isActive,
}: {
  task: KaiTask;
  onAction: (taskId: string, action: string) => void;
  isActive: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-3 mb-2 transition-all ${
        isActive ? "border-purple-400 bg-purple-50/50 shadow-sm" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PriorityIndicator priority={task.priority} />
            <StatusBadge status={task.status} />
            <span className="text-xs text-gray-400">#{task.score}</span>
          </div>
          <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
            <span>{task.project || task.appId}</span>
            <span>·</span>
            <span>{task.source}</span>
          </div>
        </div>
      </div>

      {task.status !== "done" && task.status !== "skipped" && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => onAction(task.id, "generate_tasklet_prompt")}
            className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition"
          >
            Tasklet Prompt
          </button>
          <button
            onClick={() => onAction(task.id, "done")}
            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition"
          >
            Done
          </button>
          <button
            onClick={() => onAction(task.id, "skip")}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──

export default function KaiTasksPanel() {
  const [tasks, setTasks] = useState<KaiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kaiMessage, setKaiMessage] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [actionOutput, setActionOutput] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [commandInput, setCommandInput] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filter !== "all" ? `?priority=${filter}` : "";
      const result = await kaiGet(`/api/kai/tasks${params}`);
      setTasks(result.tasks || []);
      setKaiMessage(result.message);
      setExplanation(result.explanation || "");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleHelpMeOut = async () => {
    try {
      setActionOutput(null);
      const result = await kaiPost("/api/kai/orchestrator/help-me-out", {
        userId: "super-admin",
      });
      setKaiMessage(result.message);
      setExplanation(result.explanation || "");
      if (result.task) setActiveTaskId(result.task.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCommand = async (command: string) => {
    if (!command.trim()) return;
    try {
      setActionOutput(null);
      const result = await kaiPost("/api/kai/orchestrator/next", {
        userId: "super-admin",
        command,
      });
      setKaiMessage(result.message);
      if (result.explanation) setActionOutput(result.explanation);
      if (result.task) setActiveTaskId(result.task.id);
      setCommandInput("");
      await loadTasks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTaskAction = async (taskId: string, action: string) => {
    try {
      setActionOutput(null);

      if (action === "done") {
        const result = await kaiPost(`/api/kai/tasks/${taskId}/action`, {
          actionType: "update_status",
          userId: "super-admin",
        });
        setKaiMessage(result.message);
        // Also update locally
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "done" as const } : t))
        );
        return;
      }

      if (action === "skip") {
        await handleCommand("skip this");
        return;
      }

      const result = await kaiPost(`/api/kai/tasks/${taskId}/action`, {
        actionType: action,
        userId: "super-admin",
      });
      setKaiMessage(result.message);
      if (result.explanation) setActionOutput(result.explanation);
      setActiveTaskId(taskId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Group tasks by priority
  const grouped = {
    critical: tasks.filter((t) => t.priority === "critical" && t.status !== "done" && t.status !== "skipped"),
    high: tasks.filter((t) => t.priority === "high" && t.status !== "done" && t.status !== "skipped"),
    medium: tasks.filter((t) => t.priority === "medium" && t.status !== "done" && t.status !== "skipped"),
    low: tasks.filter((t) => t.priority === "low" && t.status !== "done" && t.status !== "skipped"),
  };

  const topThree = tasks.filter((t) => t.status !== "done" && t.status !== "skipped").slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-sm">🤖</span>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Kai Task Orchestrator</h3>
              <p className="text-white/70 text-xs">Proactive task management</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleHelpMeOut}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition"
            >
              Help me out
            </button>
            <button
              onClick={() => handleCommand("do the next one")}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition"
            >
              Do next
            </button>
            <button
              onClick={loadTasks}
              className="px-2 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg transition"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* Kai Message */}
      {kaiMessage && (
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
          <p className="text-sm text-purple-900 whitespace-pre-line">{kaiMessage}</p>
          {explanation && (
            <p className="text-xs text-purple-600 mt-1 italic">{explanation}</p>
          )}
        </div>
      )}

      {/* Action Output */}
      {actionOutput && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Kai Output</span>
            <button
              onClick={() => setActionOutput(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white p-2 rounded border border-gray-200 max-h-40 overflow-y-auto">
            {actionOutput}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Command Input */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCommand(commandInput)}
            placeholder='Say "help me out", "skip this", "what should I work on?"...'
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
          />
          <button
            onClick={() => handleCommand(commandInput)}
            className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Send
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
        {["all", "critical", "high", "medium", "low"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded-full transition ${
              filter === f
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && grouped[f as keyof typeof grouped] && (
              <span className="ml-1 opacity-70">
                ({grouped[f as keyof typeof grouped].length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Top 3 Next Actions */}
      {topThree.length > 0 && filter === "all" && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Top 3 Next Actions</p>
          {topThree.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 text-xs py-0.5">
              <span className="text-gray-400 font-mono w-4">{i + 1}.</span>
              <PriorityIndicator priority={t.priority} />
              <span className="text-gray-700 truncate flex-1">{t.title}</span>
              <span className="text-gray-400">{t.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Task List */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No tasks yet</p>
            <p className="text-gray-300 text-xs mt-1">Create tasks or let Kai recommend them</p>
          </div>
        ) : (
          <>
            {(filter === "all" ? ["critical", "high", "medium", "low"] : [filter]).map(
              (priority) => {
                const group = grouped[priority as keyof typeof grouped] || [];
                if (group.length === 0) return null;
                return (
                  <div key={priority} className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          PRIORITY_COLORS[priority]?.dot || "bg-gray-400"
                        }`}
                      />
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        {priority} ({group.length})
                      </span>
                    </div>
                    {group.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onAction={handleTaskAction}
                        isActive={activeTaskId === task.id}
                      />
                    ))}
                  </div>
                );
              }
            )}
          </>
        )}
      </div>

      {/* Footer — action history toggle */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-gray-500 hover:text-purple-600 transition"
        >
          {showHistory ? "Hide" : "Show"} Action History
        </button>
      </div>
    </div>
  );
}
