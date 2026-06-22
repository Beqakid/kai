"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Square, Volume2, Loader2, AlertTriangle, X } from "lucide-react";

// ── Types ──

type OrbState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
type RiskLevel = "safe" | "caution" | "blocked";

interface VoiceResponse {
  sessionId: string;
  transcript: string;
  responseText: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  suggestedActions: string[];
  audioBase64?: string;
  audioFormat?: string;
}

interface KaiVoiceOrbProps {
  gatewayUrl: string;
  appId?: string;
  userId?: string;
  userRole?: string;
  currentScreen?: string;
  authToken?: string;
  allowedActions?: string[];
}

// ── Constants ──
const MAX_RECORDING_MS = 120_000; // 2 min max
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Component ──

export default function KaiVoiceOrb({
  gatewayUrl,
  appId = "jon-command-center",
  userId = "jon",
  userRole = "super_admin",
  currentScreen = "dashboard",
  authToken,
  allowedActions = ["read_project_status", "summarize_blockers", "generate_tasklet_prompt", "explain_phase_status"],
}: KaiVoiceOrbProps) {
  // State
  const [state, setState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("safe");
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [ttsError, setTtsError] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Check mic permission on mount ──
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
        setMicPermission(result.state as any);
        result.onchange = () => setMicPermission(result.state as any);
      }).catch(() => setMicPermission("unknown"));
    }
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── Create session ──
  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`${gatewayUrl}/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ appId, userId, userRole, currentScreen, allowedActions }),
      });
      if (!res.ok) throw new Error(`Session failed: ${res.status}`);
      const data = (await res.json()) as { sessionId: string };
      setSessionId(data.sessionId);
      return data.sessionId;
    } catch (e: any) {
      throw new Error(`Failed to create session: ${e.message}`);
    }
  }, [sessionId, gatewayUrl, appId, userId, userRole, currentScreen, authToken, allowedActions]);

  // ── Start recording ──
  const startRecording = async () => {
    setErrorMsg("");
    setTranscript("");
    setResponse("");
    setRiskLevel("safe");
    setSuggestedActions([]);
    setRequiresConfirmation(false);
    setTtsError(false);
    setRecordingTime(0);
    audioChunksRef.current = [];

    // Stop any playing audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission("granted");

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size > MAX_FILE_SIZE) {
          setState("error");
          setErrorMsg("Recording too large (max 10 MB)");
          return;
        }
        processAudio(blob);
      };

      mediaRecorder.start(250);
      setState("listening");
      setExpanded(true);

      // Recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_MS / 1000) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      // Auto-stop at max duration
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
        }
      }, MAX_RECORDING_MS);

    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        setMicPermission("denied");
        setState("error");
        setErrorMsg("Microphone access denied. Please allow mic access in your browser settings.");
      } else {
        setState("error");
        setErrorMsg(`Mic error: ${e.message}`);
      }
    }
  };

  // ── Stop recording ──
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // ── Process audio: transcribe + get Kai response ──
  const processAudio = async (blob: Blob) => {
    setState("transcribing");
    const headers: Record<string, string> = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    try {
      const sid = await ensureSession();

      // Transcribe
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("sessionId", sid);

      const transcribeRes = await fetch(`${gatewayUrl}/transcribe`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!transcribeRes.ok) {
        const err = (await transcribeRes.json().catch(() => ({}))) as Record<string, string>;
        throw new Error(err.error || `Transcribe failed: ${transcribeRes.status}`);
      }
      const transcribeData = (await transcribeRes.json()) as { transcript?: string };
      const text = transcribeData.transcript || "";
      setTranscript(text);

      if (!text.trim()) {
        setState("idle");
        setErrorMsg("Could not hear anything. Please try again.");
        return;
      }

      // Get Kai response
      setState("thinking");
      const respondRes = await fetch(`${gatewayUrl}/respond`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          transcript: text,
          appId,
          userId,
          userRole,
          currentScreen,
          allowedActions,
        }),
      });
      if (!respondRes.ok) {
        const err = (await respondRes.json().catch(() => ({}))) as Record<string, string>;
        throw new Error(err.error || `Respond failed: ${respondRes.status}`);
      }
      const kaiResult = (await respondRes.json()) as VoiceResponse;

      setResponse(kaiResult.responseText || "");
      setRiskLevel(kaiResult.riskLevel || "safe");
      setSuggestedActions(kaiResult.suggestedActions || []);
      setRequiresConfirmation(kaiResult.requiresConfirmation || false);

      // Play TTS audio
      if (kaiResult.audioBase64) {
        try {
          setState("speaking");
          await playTTSAudio(kaiResult.audioBase64, kaiResult.audioFormat || "audio/wav");
          setState("idle");
        } catch {
          setTtsError(true);
          setState("idle");
        }
      } else {
        // No audio — just show text
        setState("idle");
      }

    } catch (e: any) {
      setState("error");
      setErrorMsg(e.message || "Something went wrong");
    }
  };

  // ── Play TTS Audio ──
  const playTTSAudio = (base64: string, format: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const byteChars = atob(base64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: format });
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          reject(new Error("Audio playback failed"));
        };

        audio.play().catch((e) => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          reject(e);
        });
      } catch (e) {
        reject(e);
      }
    });
  };

  // ── Cancel / Stop ──
  const handleCancel = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setState("idle");
    setErrorMsg("");
  };

  // ── Orb click ──
  const handleOrbClick = () => {
    if (state === "idle" || state === "error") {
      startRecording();
    } else if (state === "listening") {
      stopRecording();
    } else if (state === "speaking") {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setState("idle");
    }
  };

  // ── Orb styling ──
  const orbColor = {
    idle: "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200",
    listening: "bg-red-500 shadow-lg shadow-red-200 animate-kai-pulse",
    transcribing: "bg-amber-500 shadow-lg shadow-amber-200",
    thinking: "bg-purple-600 shadow-lg shadow-purple-200",
    speaking: "bg-indigo-600 shadow-lg shadow-indigo-200 animate-kai-speak",
    error: "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200",
  }[state];

  const orbIcon = {
    idle: <Mic className="w-5 h-5 text-white" />,
    listening: <Square className="w-4 h-4 text-white" />,
    transcribing: <Loader2 className="w-5 h-5 text-white animate-spin" />,
    thinking: <Loader2 className="w-5 h-5 text-white animate-spin" />,
    speaking: <Volume2 className="w-5 h-5 text-white" />,
    error: <MicOff className="w-5 h-5 text-white" />,
  }[state];

  const stateLabel = {
    idle: "Ask Kai",
    listening: `Recording... ${recordingTime}s`,
    transcribing: "Transcribing...",
    thinking: "Kai is thinking...",
    speaking: "Kai is speaking",
    error: "Try again",
  }[state];

  const riskBadge = riskLevel !== "safe" ? (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      riskLevel === "blocked" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
    }`}>
      {riskLevel === "blocked" ? "Blocked" : "Caution"}
    </span>
  ) : null;

  // ── Mic denied state ──
  if (micPermission === "denied") {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-72">
          <div className="flex items-center gap-2 mb-2">
            <MicOff className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-gray-900">Microphone Blocked</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Allow microphone access in your browser settings, then reload.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary text-xs w-full">
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Expanded panel */}
      {expanded && (transcript || response || errorMsg) && (
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-80 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">Kai Voice</span>
              {riskBadge}
            </div>
            <button onClick={() => { setExpanded(false); handleCancel(); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
            {/* Error */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-700">{errorMsg}</p>
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div>
                <p className="text-xs text-gray-400 mb-1">You said:</p>
                <p className="text-sm text-gray-700">{transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Kai:</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{response}</p>
              </div>
            )}

            {/* TTS error fallback */}
            {ttsError && response && (
              <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span className="text-xs">Voice playback unavailable — text shown above</span>
              </div>
            )}

            {/* Confirmation warning */}
            {requiresConfirmation && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-700 font-medium">⚠ This action requires confirmation before proceeding.</p>
              </div>
            )}

            {/* Suggested actions */}
            {suggestedActions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestedActions.map((action, i) => (
                  <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                    {action}
                  </span>
                ))}
              </div>
            )}

            {/* Speaking hint */}
            {state === "speaking" && (
              <p className="text-xs text-gray-400 text-center">Tap the orb to stop</p>
            )}
          </div>
        </div>
      )}

      {/* The orb */}
      <div className="flex items-center gap-2">
        {state !== "idle" && state !== "error" && (
          <span className="text-xs text-gray-500 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm border border-gray-100">
            {stateLabel}
          </span>
        )}
        <button
          onClick={handleOrbClick}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${orbColor}`}
          title={stateLabel}
        >
          {orbIcon}
        </button>
      </div>
    </div>
  );
}
