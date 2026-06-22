"use client";
import { useState, useEffect } from "react";
import { History, AlertTriangle, ChevronDown, X, RefreshCw, Loader2, Volume2 } from "lucide-react";

interface VoiceInteraction {
  id: string;
  session_id: string;
  app_id: string;
  user_id: string;
  user_role: string;
  transcript: string;
  kai_response: string;
  risk_level: string;
  requires_confirmation: boolean;
  suggested_actions_json: string | null;
  action_taken: string | null;
  stt_provider: string;
  tts_provider: string;
  error_message: string | null;
  created_at: string;
}

interface KaiVoiceHistoryProps {
  gatewayUrl: string;
  authToken?: string;
}

export default function KaiVoiceHistory({ gatewayUrl, authToken }: KaiVoiceHistoryProps) {
  const [open, setOpen] = useState(false);
  const [interactions, setInteractions] = useState<VoiceInteraction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterApp, setFilterApp] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");

  const loadHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const params = new URLSearchParams();
      if (filterApp !== "all") params.set("appId", filterApp);
      if (filterRisk !== "all") params.set("riskLevel", filterRisk);
      params.set("limit", "50");

      const res = await fetch(`${gatewayUrl}/history?${params}`, { headers });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied — admin only");
        throw new Error(`Failed: ${res.status}`);
      }
      const data = (await res.json()) as { interactions?: VoiceInteraction[] };
      setInteractions(data.interactions || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open, filterApp, filterRisk]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-20 z-50 bg-white rounded-full shadow-lg border border-gray-200 w-10 h-10 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
        title="Voice History"
      >
        <History className="w-4 h-4" />
      </button>
    );
  }

  const riskColor = (risk: string) => {
    if (risk === "blocked") return "bg-red-100 text-red-700";
    if (risk === "caution") return "bg-amber-100 text-amber-700";
    return "bg-green-100 text-green-700";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[80vh] overflow-hidden m-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Kai Voice History</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{interactions.length} interactions</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 bg-gray-50/50">
          <select value={filterApp} onChange={e => setFilterApp(e.target.value)} className="input-field text-xs w-auto">
            <option value="all">All Apps</option>
            <option value="jon-command-center">Jon Command Center</option>
            <option value="carehia">Carehia</option>
            <option value="viliniu">Viliniu</option>
            <option value="volau">Volau</option>
          </select>
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="input-field text-xs w-auto">
            <option value="all">All Risk Levels</option>
            <option value="safe">Safe</option>
            <option value="caution">Caution</option>
            <option value="blocked">Blocked</option>
          </select>
          <button onClick={loadHistory} disabled={loading} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-8rem)]">
          {error && (
            <div className="m-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && interactions.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          )}

          {!loading && interactions.length === 0 && !error && (
            <div className="text-center py-12 text-gray-400">
              <Volume2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No voice interactions yet</p>
            </div>
          )}

          {interactions.map((item) => (
            <div key={item.id} className="px-6 py-4 border-b border-gray-50 hover:bg-gray-50/50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                    {item.app_id}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {item.user_role}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(item.risk_level)}`}>
                    {item.risk_level}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span>STT: {item.stt_provider || "—"}</span>
                  <span>·</span>
                  <span>TTS: {item.tts_provider || "—"}</span>
                </div>
              </div>

              {/* Transcript */}
              <div className="mb-2">
                <p className="text-xs text-gray-400 mb-0.5">User:</p>
                <p className="text-sm text-gray-700">{item.transcript || "—"}</p>
              </div>

              {/* Response */}
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Kai:</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">{item.kai_response || "—"}</p>
              </div>

              {/* Error */}
              {item.error_message && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                  <AlertTriangle className="w-3 h-3" />
                  {item.error_message}
                </div>
              )}

              {/* Suggested actions */}
              {item.suggested_actions_json && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {JSON.parse(item.suggested_actions_json).map((a: string, i: number) => (
                    <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
