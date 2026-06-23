"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

// ══════════════════════════════════════════════════════════════════════
// Types  (mirrors gateway orchestrator/types.ts for UI consumption)
// ══════════════════════════════════════════════════════════════════════

type TaskPriority = "critical" | "high" | "medium" | "low";
type TaskRiskLevel = "low" | "medium" | "high" | "blocked";
type TaskStatus = "open" | "in_progress" | "waiting_approval" | "done" | "skipped";

interface KaiTask {
  id: string;
  appId: string;
  project: string | null;
  title: string;
  description: string | null;
  source: string;
  priority: TaskPriority;
  severity: string;
  status: TaskStatus;
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

interface GateDecisionSummary {
  riskLevel: string;
  requiresConfirmation: boolean;
  requiresAdminApproval: boolean;
  reason: string;
  recommendedFallback: string;
}

interface OrchestratorResponse {
  message: string;
  task?: KaiTask;
  action?: KaiTaskAction;
  tasks?: KaiTask[];
  explanation?: string;
  nextRecommendation?: string;
  requiresConfirmation?: boolean;
  gateDecision?: GateDecisionSummary;
  pendingActionId?: string;
  pendingActionStatus?: string;
  expiresAt?: string;
}

interface PendingAction {
  id: string;
  taskId: string | null;
  appId: string;
  userId: string;
  actionType: string;
  riskLevel: string;
  preparedOutputJson: string | null;
  gateDecisionJson: string | null;
  status: string;
  expiresAt: string;
  confirmedAt: string | null;
  deniedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

interface ActionReceipt {
  id: string;
  receiptType: string;
  appId: string;
  userId: string;
  userRole: string;
  actionType: string;
  taskId: string | null;
  riskLevel: string;
  gateAllowed: number;
  gateReason: string | null;
  approvalStatus: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

// ══════════════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════════════

const GATEWAY_URL =
  (typeof window !== "undefined" && (window as any).__KAI_GATEWAY_URL__) ||
  "https://kai-voice-gateway.jjioji.workers.dev";

const AUTH_TOKEN =
  (typeof window !== "undefined" && (window as any).__KAI_AUTH_TOKEN__) ||
  "demo-token";

// ══════════════════════════════════════════════════════════════════════
// API helpers — typed, with friendly error handling
// ══════════════════════════════════════════════════════════════════════

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "Invalid or missing auth token.";
  if (status === 403) return "Permission denied.";
  if (status === 404) return "Route not found.";
  if (status === 410) return "Pending action has expired.";
  if (status === 429) return "Too many requests — slow down.";
  if (status >= 500) return "Gateway error — try again later.";
  return fallback;
}

async function kaiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || friendlyError(res.status, `API ${res.status}`));
  }
  return res.json();
}

async function kaiPost<T = any>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || friendlyError(res.status, `API ${res.status}`));
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════
// Visual constants
// ══════════════════════════════════════════════════════════════════════

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

const RISK_LABELS: Record<string, { label: string; color: string; description: string }> = {
  low: { label: "Low", color: "risk-low", description: "Safe to execute" },
  medium: { label: "Medium", color: "risk-medium", description: "Confirmation required" },
  high: { label: "High", color: "risk-high", description: "Admin approval required" },
  blocked: { label: "Blocked", color: "risk-blocked", description: "Not allowed" },
};

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  kai_recommendation_generated: "Recommendation",
  kai_action_prepared: "Action Prepared",
  kai_action_executed: "Action Executed",
  kai_action_blocked: "Action Blocked",
  kai_escalated_to_admin: "Escalated",
  kai_risk_warning: "Risk Warning",
  kai_explanation_generated: "Explanation",
  kai_task_status_changed: "Status Changed",
  kai_tasklet_prompt_generated: "Tasklet Prompt",
  kai_blocker_summary_generated: "Blocker Summary",
  kai_action_confirmed: "Confirmed",
  kai_action_denied: "Denied",
  kai_action_expired: "Expired",
};

// ══════════════════════════════════════════════════════════════════════
// Micro-components
// ══════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
      {badge.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const r = RISK_LABELS[riskLevel] || RISK_LABELS.low;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${r.color}`}
      title={r.description}
    >
      {r.label} Risk
    </span>
  );
}

function ConfirmationTag({ requiresConfirmation }: { requiresConfirmation: boolean }) {
  if (!requiresConfirmation) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      ⚠ Confirmation Required
    </span>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="text-center py-8 kai-section-enter">
      <span className="text-3xl mb-2 block">{icon}</span>
      <p className="text-gray-500 text-sm font-medium">{title}</p>
      <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full" />
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-enter flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm ${
            t.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : t.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-60 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 1: Kai Command Header
// ══════════════════════════════════════════════════════════════════════

function KaiCommandHeader({
  connectionOk,
  currentApp,
  currentRole,
}: {
  connectionOk: boolean;
  currentApp: string;
  currentRole: string;
}) {
  return (
    <div className="px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500" data-testid="kai-command-header">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/70">{currentApp}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">{currentRole}</span>
          <span
            className={`w-2 h-2 rounded-full ${connectionOk ? "bg-green-400" : "bg-red-400"}`}
            title={connectionOk ? "Gateway connected" : "Gateway disconnected"}
          />
        </div>
      </div>
      <p className="text-white/60 text-xs mt-2 leading-relaxed">
        Kai can guide, prioritize, draft, and prepare safe actions. Medium-risk actions require confirmation. High-risk and blocked actions do not execute.
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 2: Top Priority Card
// ══════════════════════════════════════════════════════════════════════

function TopPriorityCard({
  task,
  gateDecision,
  onAction,
  busy,
}: {
  task: KaiTask;
  gateDecision?: GateDecisionSummary;
  onAction: (taskId: string, action: string) => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-purple-50/70 border-b border-purple-100 kai-section-enter" data-testid="top-priority-card">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">🎯 Top Priority</span>
        <PriorityBadge priority={task.priority} />
        <RiskBadge riskLevel={task.riskLevel} />
        <ConfirmationTag requiresConfirmation={task.requiresConfirmation} />
      </div>
      <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
        <span>{task.project || task.appId}</span>
        <span>Score: {task.score}</span>
        {task.suggestedAction && <span className="text-purple-600">→ {task.suggestedAction}</span>}
      </div>
      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}

      {/* Gate decision */}
      {gateDecision && (
        <div className="mt-2 text-xs text-gray-500 bg-white/60 rounded px-2 py-1 border border-gray-200">
          <span className="font-medium">Gate:</span> {gateDecision.reason}
          {gateDecision.requiresConfirmation && <span className="ml-1 text-amber-600">(confirmation required)</span>}
          {gateDecision.requiresAdminApproval && <span className="ml-1 text-red-600">(admin approval required)</span>}
        </div>
      )}

      {/* Action buttons */}
      {task.status !== "done" && task.status !== "skipped" && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "help_me_out")}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition disabled:opacity-50"
          >
            Help Me Out
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "generate_tasklet_prompt")}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition disabled:opacity-50"
          >
            Generate Tasklet Prompt
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "summarize_blockers")}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition disabled:opacity-50"
          >
            Summarize Blockers
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "skip")}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
          >
            Skip
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "done")}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition disabled:opacity-50"
          >
            Mark Done
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 3: Task Priority Groups
// ══════════════════════════════════════════════════════════════════════

function TaskCard({
  task,
  onAction,
  isActive,
  busy,
}: {
  task: KaiTask;
  onAction: (taskId: string, action: string) => void;
  isActive: boolean;
  busy: boolean;
}) {
  return (
    <div
      data-testid="task-card"
      className={`border rounded-lg p-3 mb-2 transition-all ${
        isActive ? "border-purple-400 bg-purple-50/50 shadow-sm" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            <RiskBadge riskLevel={task.riskLevel} />
            {task.requiresConfirmation && (
              <span className="text-xs text-amber-600">⚠ Confirm</span>
            )}
            <span className="text-xs text-gray-400">#{task.score}</span>
          </div>
          <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
          {task.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>{task.project || task.appId}</span>
            <span>·</span>
            <span>{task.source}</span>
            {task.suggestedAction && (
              <>
                <span>·</span>
                <span className="text-purple-500">→ {task.suggestedAction}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {task.status !== "done" && task.status !== "skipped" && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "generate_tasklet_prompt")}
            className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition disabled:opacity-50"
          >
            Tasklet Prompt
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "done")}
            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition disabled:opacity-50"
          >
            Done
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(task.id, "skip")}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

function TaskPriorityGroups({
  tasks,
  activeTaskId,
  onAction,
  filter,
  busy,
}: {
  tasks: KaiTask[];
  activeTaskId: string | null;
  onAction: (taskId: string, action: string) => void;
  filter: string;
  busy: boolean;
}) {
  const grouped = {
    critical: tasks.filter((t) => t.priority === "critical" && t.status !== "done" && t.status !== "skipped"),
    high: tasks.filter((t) => t.priority === "high" && t.status !== "done" && t.status !== "skipped"),
    medium: tasks.filter((t) => t.priority === "medium" && t.status !== "done" && t.status !== "skipped"),
    low: tasks.filter((t) => t.priority === "low" && t.status !== "done" && t.status !== "skipped"),
  };

  const priorities = filter === "all" ? (["critical", "high", "medium", "low"] as const) : [filter as TaskPriority];

  const anyVisible = priorities.some((p) => (grouped[p]?.length || 0) > 0);
  if (!anyVisible) {
    return <EmptyState icon="📋" title="No tasks found" subtitle="Create tasks or let Kai recommend them" />;
  }

  return (
    <div data-testid="task-priority-groups">
      {priorities.map((priority) => {
        const group = grouped[priority] || [];
        if (group.length === 0) return null;
        return (
          <div key={priority} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[priority]?.dot || "bg-gray-400"}`} />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {priority} ({group.length})
              </span>
            </div>
            {group.map((task) => (
              <TaskCard key={task.id} task={task} onAction={onAction} isActive={activeTaskId === task.id} busy={busy} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 4: Pending Confirmations Panel
// ══════════════════════════════════════════════════════════════════════

function PendingConfirmationsPanel({
  pendingActions,
  loading,
  onConfirm,
  onDeny,
  onRefresh,
  busy,
}: {
  pendingActions: PendingAction[];
  loading: boolean;
  onConfirm: (id: string) => void;
  onDeny: (id: string) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  if (loading) return <Spinner />;

  return (
    <div data-testid="pending-confirmations-panel" className="kai-section-enter">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Pending Confirmations ({pendingActions.length})
        </h4>
        <button onClick={onRefresh} className="text-xs text-purple-600 hover:text-purple-800">↻ Refresh</button>
      </div>

      {pendingActions.length === 0 ? (
        <EmptyState icon="✅" title="No pending confirmations" subtitle="All clear — nothing waiting for approval" />
      ) : (
        <div className="space-y-2">
          {pendingActions.map((pa) => {
            const expiry = new Date(pa.expiresAt);
            const now = new Date();
            const minutesLeft = Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 60_000));
            const isExpiringSoon = minutesLeft <= 3;
            let gateDecision: GateDecisionSummary | null = null;
            try {
              gateDecision = pa.gateDecisionJson ? JSON.parse(pa.gateDecisionJson) : null;
            } catch {}
            let preparedPreview = "";
            try {
              const parsed = pa.preparedOutputJson ? JSON.parse(pa.preparedOutputJson) : null;
              preparedPreview = parsed ? (typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)).slice(0, 200) : "";
            } catch {}

            return (
              <div
                key={pa.id}
                data-testid="pending-action-card"
                className={`border rounded-lg p-3 bg-white ${isExpiringSoon ? "pending-expiring border-amber-400" : "border-gray-200"}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <RiskBadge riskLevel={pa.riskLevel} />
                  <span className="text-xs text-gray-500">{pa.actionType}</span>
                  <span className={`text-xs ${isExpiringSoon ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                    {minutesLeft}m left
                  </span>
                  <span className="text-xs text-gray-400">ID: {pa.id.slice(0, 8)}…</span>
                </div>
                {pa.taskId && <p className="text-xs text-gray-500">Task: {pa.taskId.slice(0, 8)}…</p>}
                {preparedPreview && (
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-1.5 mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap font-mono border border-gray-100">
                    {preparedPreview}
                  </pre>
                )}
                {gateDecision && (
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-medium">Gate:</span> {gateDecision.reason}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    disabled={busy}
                    onClick={() => onConfirm(pa.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    ✓ Confirm
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onDeny(pa.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50"
                  >
                    ✕ Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 5: Recent Kai Action Receipts Panel
// ══════════════════════════════════════════════════════════════════════

function RecentReceiptsPanel({
  receipts,
  loading,
  onRefresh,
  receiptFilter,
  setReceiptFilter,
  riskFilter,
  setRiskFilter,
  taskIdFilter,
  setTaskIdFilter,
}: {
  receipts: ActionReceipt[];
  loading: boolean;
  onRefresh: () => void;
  receiptFilter: string;
  setReceiptFilter: (v: string) => void;
  riskFilter: string;
  setRiskFilter: (v: string) => void;
  taskIdFilter: string;
  setTaskIdFilter: (v: string) => void;
}) {
  return (
    <div data-testid="recent-receipts-panel" className="kai-section-enter">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Recent Action Receipts ({receipts.length})
        </h4>
        <button onClick={onRefresh} className="text-xs text-purple-600 hover:text-purple-800">↻ Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select
          value={receiptFilter}
          onChange={(e) => setReceiptFilter(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-200 rounded"
          data-testid="receipt-type-filter"
        >
          <option value="">All Types</option>
          {Object.entries(RECEIPT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-200 rounded"
          data-testid="risk-level-filter"
        >
          <option value="">All Risk</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="blocked">Blocked</option>
        </select>
        <input
          type="text"
          value={taskIdFilter}
          onChange={(e) => setTaskIdFilter(e.target.value)}
          placeholder="Task ID"
          className="text-xs px-2 py-1 border border-gray-200 rounded w-24"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : receipts.length === 0 ? (
        <EmptyState icon="📜" title="No recent receipts" subtitle="Action receipts appear after Kai performs work" />
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {receipts.map((r) => (
            <div key={r.id} className="border border-gray-100 rounded p-2 bg-white text-xs" data-testid="receipt-card">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="font-medium text-gray-700">
                  {RECEIPT_TYPE_LABELS[r.receiptType] || r.receiptType}
                </span>
                <RiskBadge riskLevel={r.riskLevel} />
                <span className={`px-1.5 py-0.5 rounded-full ${r.gateAllowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  Gate: {r.gateAllowed ? "Yes" : "No"}
                </span>
                {r.approvalStatus && (
                  <span className="text-gray-500">{r.approvalStatus}</span>
                )}
              </div>
              <div className="text-gray-500">
                {r.actionType} · {r.appId}
                {r.taskId && <> · Task: {r.taskId.slice(0, 8)}…</>}
                {r.userId && <> · {r.userId}</>}
              </div>
              {r.gateReason && <p className="text-gray-400 mt-0.5">Reason: {r.gateReason}</p>}
              <p className="text-gray-300 mt-0.5">{new Date(r.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 6: Help Me Out Panel
// ══════════════════════════════════════════════════════════════════════

function HelpMeOutPanel({
  result,
  onDismiss,
}: {
  result: OrchestratorResponse;
  onDismiss: () => void;
}) {
  return (
    <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 kai-section-enter" data-testid="help-me-out-panel">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">💡 Help Me Out</span>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <p className="text-sm text-purple-900 whitespace-pre-line">{result.message}</p>
      {result.explanation && <p className="text-xs text-purple-600 mt-1 italic">{result.explanation}</p>}
      {result.nextRecommendation && (
        <p className="text-xs text-purple-700 mt-1">
          <span className="font-medium">Next:</span> {result.nextRecommendation}
        </p>
      )}
      {result.gateDecision && (
        <div className="mt-1 text-xs text-gray-600">
          <span className="font-medium">Gate:</span> {result.gateDecision.reason}
          {result.requiresConfirmation && <span className="ml-1 text-amber-600">(confirmation required)</span>}
        </div>
      )}
      {result.task && (
        <p className="text-xs text-gray-500 mt-1">
          Selected: <span className="font-medium text-gray-700">{result.task.title}</span>
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Section 7: Next Command Box
// ══════════════════════════════════════════════════════════════════════

function NextCommandBox({
  commandInput,
  setCommandInput,
  onSend,
  busy,
}: {
  commandInput: string;
  setCommandInput: (v: string) => void;
  onSend: (cmd: string) => void;
  busy: boolean;
}) {
  const suggestions = [
    "go ahead",
    "skip this",
    "mark done",
    "summarize blockers",
    "generate tasklet prompt",
    "what is blocking launch?",
    "what should I work on?",
  ];

  return (
    <div className="px-4 py-2 border-b border-gray-100" data-testid="next-command-box">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend(commandInput)}
          placeholder='Try "what should I work on?" or "summarize blockers"...'
          className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
          disabled={busy}
        />
        <button
          disabled={busy || !commandInput.trim()}
          onClick={() => onSend(commandInput)}
          className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            disabled={busy}
            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-purple-100 hover:text-purple-700 transition disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Main Panel — orchestrates all sections
// ══════════════════════════════════════════════════════════════════════

export default function KaiTasksPanel() {
  // ── State ──
  const [tasks, setTasks] = useState<KaiTask[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [receipts, setReceipts] = useState<ActionReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionOk, setConnectionOk] = useState(true);
  const [busy, setBusy] = useState(false);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [commandInput, setCommandInput] = useState("");

  const [helpResult, setHelpResult] = useState<OrchestratorResponse | null>(null);
  const [commandResult, setCommandResult] = useState<OrchestratorResponse | null>(null);

  // Receipt filters
  const [receiptFilter, setReceiptFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [taskIdFilter, setTaskIdFilter] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState<"tasks" | "pending" | "receipts">("tasks");

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  function addToast(type: Toast["type"], message: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Data loaders ──

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = filter !== "all" ? `?priority=${filter}` : "";
      const result = await kaiGet<OrchestratorResponse>(`/api/kai/tasks${params}`);
      setTasks(result.tasks || []);
      setConnectionOk(true);
    } catch (err: any) {
      setError(err.message);
      setConnectionOk(false);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadPending = useCallback(async () => {
    try {
      setPendingLoading(true);
      const result = await kaiGet<{ pendingActions: PendingAction[] }>("/api/kai/actions/pending");
      setPendingActions(result.pendingActions || []);
    } catch {
      // Silent — pending panel will show empty
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      setReceiptsLoading(true);
      const params = new URLSearchParams();
      if (receiptFilter) params.set("receiptType", receiptFilter);
      if (riskFilter) params.set("riskLevel", riskFilter);
      if (taskIdFilter) params.set("taskId", taskIdFilter);
      params.set("pageSize", "30");
      const result = await kaiGet<{ receipts: ActionReceipt[] }>(`/api/kai/action-receipts?${params}`);
      setReceipts(result.receipts || []);
    } catch {
      // Silent
    } finally {
      setReceiptsLoading(false);
    }
  }, [receiptFilter, riskFilter, taskIdFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const refreshAll = () => {
    loadTasks();
    loadPending();
    loadReceipts();
  };

  // ── Actions ──

  const handleHelpMeOut = async () => {
    try {
      setBusy(true);
      setCommandResult(null);
      const result = await kaiPost<OrchestratorResponse>("/api/kai/orchestrator/help-me-out", {
        userId: "super-admin",
      });
      setHelpResult(result);
      if (result.task) setActiveTaskId(result.task.id);
      addToast("info", "Kai recommendation ready");
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCommand = async (command: string) => {
    if (!command.trim()) return;
    try {
      setBusy(true);
      setHelpResult(null);
      const result = await kaiPost<OrchestratorResponse>("/api/kai/orchestrator/next", {
        userId: "super-admin",
        command,
      });
      setCommandResult(result);
      if (result.task) setActiveTaskId(result.task.id);
      setCommandInput("");
      addToast("info", result.message?.slice(0, 80) || "Command processed");
      await loadTasks();
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTaskAction = async (taskId: string, action: string) => {
    try {
      setBusy(true);
      if (action === "help_me_out") {
        await handleHelpMeOut();
        return;
      }
      if (action === "skip") {
        await handleCommand("skip this");
        return;
      }
      if (action === "done") {
        const result = await kaiPost<OrchestratorResponse>(`/api/kai/tasks/${taskId}/action`, {
          actionType: "update_status",
          userId: "super-admin",
        });
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "done" as const } : t)));
        addToast("success", result.message || "Task marked done");
        loadReceipts();
        return;
      }
      const result = await kaiPost<OrchestratorResponse>(`/api/kai/tasks/${taskId}/action`, {
        actionType: action,
        userId: "super-admin",
      });
      // If a pending action was created, switch to pending tab
      if (result.pendingActionId) {
        addToast("info", "Action requires confirmation — see Pending tab");
        loadPending();
        setActiveTab("pending");
      } else {
        addToast("success", result.message || "Action completed");
      }
      if (result.explanation) setCommandResult(result);
      setActiveTaskId(taskId);
      loadReceipts();
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (pendingActionId: string) => {
    try {
      setBusy(true);
      const result = await kaiPost<OrchestratorResponse>(`/api/kai/actions/${pendingActionId}/confirm`);
      addToast("success", result.message || "Action confirmed and executed");
      loadPending();
      loadTasks();
      loadReceipts();
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeny = async (pendingActionId: string) => {
    try {
      setBusy(true);
      const result = await kaiPost<OrchestratorResponse>(`/api/kai/actions/${pendingActionId}/deny`);
      addToast("info", result.message || "Action denied");
      loadPending();
      loadReceipts();
    } catch (err: any) {
      addToast("error", err.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Derived data ──
  const activeTasks = tasks.filter((t) => t.status !== "done" && t.status !== "skipped");
  const topTask = activeTasks[0] || null;

  // ── Render ──
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* 1. Command Header */}
      <KaiCommandHeader
        connectionOk={connectionOk}
        currentApp="jon-command-center"
        currentRole="super_admin"
      />

      {/* 6. Help Me Out result */}
      {helpResult && (
        <HelpMeOutPanel result={helpResult} onDismiss={() => setHelpResult(null)} />
      )}

      {/* Command result */}
      {commandResult && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 kai-section-enter">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Kai Response</span>
            <button onClick={() => setCommandResult(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-line">{commandResult.message}</p>
          {commandResult.explanation && (
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white p-2 rounded border border-gray-200 max-h-40 overflow-y-auto mt-1">
              {commandResult.explanation}
            </pre>
          )}
          {commandResult.gateDecision && (
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-medium">Gate:</span> {commandResult.gateDecision.reason}
            </p>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* 2. Top Priority Card */}
      {topTask && !loading && (
        <TopPriorityCard task={topTask} onAction={handleTaskAction} busy={busy} />
      )}

      {/* 7. Next Command Box */}
      <NextCommandBox commandInput={commandInput} setCommandInput={setCommandInput} onSend={handleCommand} busy={busy} />

      {/* Tab navigation */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1">
        {(["tasks", "pending", "receipts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${
              activeTab === tab ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab === "tasks" && `Tasks (${activeTasks.length})`}
            {tab === "pending" && `Pending (${pendingActions.length})`}
            {tab === "receipts" && `Receipts (${receipts.length})`}
          </button>
        ))}

        {/* Priority filter (tasks tab only) */}
        {activeTab === "tasks" && (
          <div className="flex items-center gap-1 ml-auto">
            {["all", "critical", "high", "medium", "low"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded-full transition ${
                  filter === f ? "bg-purple-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleHelpMeOut}
            disabled={busy}
            className="text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition disabled:opacity-50"
          >
            Help me out
          </button>
          <button
            onClick={refreshAll}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
            title="Refresh all"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 py-3 max-h-[480px] overflow-y-auto">
        {activeTab === "tasks" && (
          loading ? (
            <Spinner />
          ) : (
            <TaskPriorityGroups
              tasks={tasks}
              activeTaskId={activeTaskId}
              onAction={handleTaskAction}
              filter={filter}
              busy={busy}
            />
          )
        )}
        {activeTab === "pending" && (
          <PendingConfirmationsPanel
            pendingActions={pendingActions}
            loading={pendingLoading}
            onConfirm={handleConfirm}
            onDeny={handleDeny}
            onRefresh={loadPending}
            busy={busy}
          />
        )}
        {activeTab === "receipts" && (
          <RecentReceiptsPanel
            receipts={receipts}
            loading={receiptsLoading}
            onRefresh={loadReceipts}
            receiptFilter={receiptFilter}
            setReceiptFilter={setReceiptFilter}
            riskFilter={riskFilter}
            setRiskFilter={setRiskFilter}
            taskIdFilter={taskIdFilter}
            setTaskIdFilter={setTaskIdFilter}
          />
        )}
      </div>

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
