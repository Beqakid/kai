"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import KaiVoiceOrb from "./KaiVoiceOrb";
import KaiVoiceHistory from "./KaiVoiceHistory";
import { Menu } from "lucide-react";

// Voice gateway URL — set via env var or default to localhost for dev
const VOICE_GATEWAY_URL = process.env.NEXT_PUBLIC_KAI_VOICE_GATEWAY_URL || "https://kai-voice-gateway.your-domain.workers.dev";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Map pathname to a human-readable screen name for Kai context
  const currentScreen = pathname === "/" ? "dashboard"
    : pathname.startsWith("/projects") ? "projects"
    : pathname.startsWith("/tasks") ? "tasks"
    : pathname.startsWith("/blockers") ? "blockers"
    : pathname.startsWith("/decisions") ? "decisions"
    : pathname.startsWith("/kai") ? "kai"
    : pathname.startsWith("/dispatch") ? "dispatch"
    : pathname.startsWith("/revenue") ? "revenue"
    : pathname.startsWith("/notes") ? "notes"
    : pathname.startsWith("/prompts") ? "prompts"
    : pathname.startsWith("/settings") ? "settings"
    : "unknown";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 lg:ml-0">
        <header className="lg:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"><Menu className="w-5 h-5" /></button>
          <span className="font-semibold text-gray-900 text-sm">Jon Command Center</span>
        </header>
        <main className="p-4 lg:p-8 max-w-6xl">{children}</main>
      </div>

      {/* Kai Voice — floating orb + history button (Super Admin only) */}
      <KaiVoiceOrb
        gatewayUrl={VOICE_GATEWAY_URL}
        appId="jon-command-center"
        userId="jon"
        userRole="super_admin"
        currentScreen={currentScreen}
        allowedActions={[
          "read_project_status",
          "summarize_blockers",
          "generate_tasklet_prompt",
          "explain_phase_status",
        ]}
      />
      <KaiVoiceHistory
        gatewayUrl={VOICE_GATEWAY_URL}
      />
    </div>
  );
}
