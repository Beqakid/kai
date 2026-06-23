"use client";
export const runtime = "edge";
import { useState, useEffect } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import {
  LayoutDashboard, FolderKanban, CheckSquare, AlertTriangle,
  Scale, FileText, Sparkles, Activity, Brain, Lightbulb,
  TrendingUp, TrendingDown, Minus, AlertCircle, Clock,
  ArrowRight, Send, Plus, DollarSign, Target
} from "lucide-react";
import { getSourceLabel, getSourceBadgeColor } from "@/lib/dispatch/format";
import KaiTasksPanel from "@/components/kai/KaiTasksPanel";

interface DashboardStats { projects: number; activeProjects: number; tasks: number; inProgressTasks: number; activeBlockers: number; pendingDecisions: number; notes: number; prompts: number; }

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [activeBlockers, setActiveBlockers] = useState<any[]>([]);
  const [pendingDecisions, setPendingDecisions] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [momentum, setMomentum] = useState<any[]>([]);
  const [staleProjects, setStaleProjects] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [recs, setRecs] = useState<any[]>([]);
  const [recentDispatches, setRecentDispatches] = useState<any[]>([]);
  const [revenueStats, setRevenueStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, actRes, momRes, recRes, dispRes, revRes] = await Promise.all([
          fetch("/api/dashboard").then(r => r.json() as any).catch(() => ({})),
          fetch("/api/activity?limit=8").then(r => r.json() as any).catch(() => ({})),
          fetch("/api/kai/momentum").then(r => r.json() as any).catch(() => ({})),
          fetch("/api/kai/recommendations?status=proposed").then(r => r.json() as any).catch(() => ({})),
          fetch("/api/dispatch").then(r => r.json() as any).catch(() => ({})),
          fetch("/api/revenue?stats=true").then(r => r.json() as any).catch(() => null),
        ]);
        setStats(dashRes.stats);
        setRecentTasks(dashRes.recentTasks || []);
        setActiveBlockers(dashRes.activeBlockers || []);
        setPendingDecisions(dashRes.pendingDecisions || []);
        setRecentActivity(actRes.activity || []);
        setMomentum(momRes.momentum || []);
        setStaleProjects(momRes.staleProjects || []);
        setPatterns(momRes.patterns || []);
        setRecentDispatches(Array.isArray(dispRes?.dispatches) ? dispRes.dispatches.slice(0, 5) : []);
        setRecs(recRes.recommendations || []);
        setRevenueStats(revRes);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const momentumIcon = (label: string) => {
    if (label === "Rising") return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (label === "Stalled") return <TrendingDown className="w-4 h-4 text-orange-500" />;
    if (label === "Blocked") return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };
  const momentumColor = (label: string) => {
    if (label === "Rising") return "text-green-700 bg-green-50";
    if (label === "Stalled") return "text-orange-700 bg-orange-50";
    if (label === "Blocked") return "text-red-700 bg-red-50";
    return "text-gray-600 bg-gray-50";
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Jon Command Center" subtitle="Calm founder control room" />
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Projects", value: stats?.projects, icon: FolderKanban, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Active", value: stats?.activeProjects, icon: Activity, color: "text-green-600", bg: "bg-green-50" },
          { label: "Tasks", value: stats?.tasks, icon: CheckSquare, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "In Progress", value: stats?.inProgressTasks, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Blockers", value: stats?.activeBlockers, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Decisions", value: stats?.pendingDecisions, icon: Scale, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Notes", value: stats?.notes, icon: FileText, color: "text-teal-600", bg: "bg-teal-50" },
          { label: "Prompts", value: stats?.prompts, icon: Sparkles, color: "text-pink-600", bg: "bg-pink-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-2 mb-1"><div className={`${s.bg} ${s.color} p-1.5 rounded-lg`}><s.icon className="w-3.5 h-3.5" /></div><span className="text-xs text-gray-500">{s.label}</span></div>
            <p className="text-xl font-bold text-gray-900">{s.value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Project Momentum */}
        {momentum.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" /> Project Momentum</h3>
            <div className="space-y-2">{momentum.slice(0, 6).map((m: any) => (
              <div key={m.projectId} className="flex items-center justify-between text-sm">
                <Link href={`/projects/${m.slug}`} className="text-gray-700 hover:text-indigo-600 truncate flex-1">{m.projectName}</Link>
                <div className="flex items-center gap-2">
                  {momentumIcon(m.label)}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${momentumColor(m.label)}`}>{m.label}</span>
                </div>
              </div>
            ))}</div>
          </div>
        )}

        {/* Stale Projects */}
        {staleProjects.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-500" /> Stale Projects</h3>
            <div className="space-y-2">{staleProjects.slice(0, 5).map((s: any) => (
              <div key={s.project.id} className="text-sm">
                <Link href={`/projects/${s.project.slug}`} className="text-gray-700 hover:text-indigo-600 font-medium">{s.project.name}</Link>
                <div className="text-xs text-gray-400 mt-0.5">{(s.reasons || []).slice(0, 2).join(" · ")}</div>
              </div>
            ))}</div>
          </div>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> Recent Activity</h3>
            <div className="space-y-2">{recentActivity.slice(0, 6).map((a: any) => (
              <div key={a.id} className="text-sm">
                <p className="text-gray-700 truncate">{a.title}</p>
                <p className="text-xs text-gray-400">{a.project_name || "Global"} &middot; {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
            ))}</div>
          </div>
        )}

        {/* Repeated Blocker Patterns */}
        {patterns.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Repeated Blocker Themes</h3>
            <div className="space-y-2">{patterns.slice(0, 5).map((p: any) => (
              <div key={p.theme} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 capitalize">{p.theme}</span>
                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{p.count} blockers</span>
              </div>
            ))}</div>
          </div>
        )}

        {/* Kai Recommendations */}
        {recs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Kai Recommendations</h3>
              <Link href="/kai/recommendations" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></Link>
            </div>
            <div className="space-y-2">{recs.slice(0, 4).map((r: any) => (
              <div key={r.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium flex-shrink-0">{r.recommendation_type}</span>
                <div className="min-w-0"><p className="text-gray-700 font-medium">{r.title}</p><p className="text-xs text-gray-400 truncate">{r.recommendation}</p></div>
              </div>
            ))}</div>
          </div>
        )}
      </div>



      {/* Kai Task Orchestrator */}
      <div className="md:col-span-2">
        <KaiTasksPanel />
      </div>

      {/* Revenue Intelligence */}
      {revenueStats && (revenueStats.totalOpportunities > 0 || revenueStats.proposalNeeded > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-green-900 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Closest to Revenue</h3>
              <Link href="/revenue" className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></Link>
            </div>
            {revenueStats.closestToMoney?.length > 0 ? (
              <div className="space-y-2">{revenueStats.closestToMoney.slice(0, 3).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0"><p className="text-gray-700 font-medium truncate">{o.title}</p><p className="text-xs text-gray-500">{o.project_name || "No project"}</p></div>
                  <div className="text-right flex-shrink-0 ml-2"><p className="font-bold text-green-700">{"$"}{(o.estimated_value || 0).toLocaleString()}</p><p className="text-xs text-gray-400">{o.probability}%</p></div>
                </div>
              ))}</div>
            ) : <p className="text-sm text-green-400">No active opportunities yet</p>}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-amber-500" /> Revenue Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-400">Opportunities</span><p className="font-bold text-gray-900">{revenueStats.totalOpportunities}</p></div>
              <div><span className="text-gray-400">Potential Value</span><p className="font-bold text-green-700">{"$"}{(revenueStats.totalPotentialValue || 0).toLocaleString()}</p></div>
              <div><span className="text-gray-400">Proposals Needed</span><p className="font-bold text-amber-600">{revenueStats.proposalNeeded}</p></div>
              <div><span className="text-gray-400">Won / Lost</span><p className="font-bold text-gray-900">{revenueStats.wonCount} / {revenueStats.lostCount}</p></div>
            </div>
          </div>
        </div>
      )}

        {/* Recent Dispatches */}
        {recentDispatches.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Send className="w-4 h-4 text-blue-500" /> Recent Dispatches</h3>
              <Link href="/dispatch" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></Link>
            </div>
            <div className="space-y-2">{recentDispatches.map((d: any) => (
              <Link key={d.id} href={`/dispatch/${d.id}`} className="flex items-center justify-between text-sm hover:bg-gray-50 rounded-lg p-2 -mx-1">
                <div className="min-w-0"><p className="text-gray-700 font-medium truncate">{d.title}</p><p className="text-xs text-gray-400">{d.project_name || "No project"}</p></div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  d.status === "draft" ? "bg-gray-100 text-gray-600" :
                  d.status === "ready_for_review" ? "bg-amber-100 text-amber-700" :
                  d.status === "approved" ? "bg-green-100 text-green-700" :
                  "bg-blue-100 text-blue-700"
                }`}>{d.status === "ready_for_review" ? "Ready" : d.status.charAt(0).toUpperCase() + d.status.slice(1)}</span>
              </Link>
            ))}</div>
          </div>
        )}

      {/* Existing cards: Active Blockers, Pending Decisions, Recent Tasks */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Active Blockers</h3>
          {activeBlockers.length === 0 ? <p className="text-sm text-gray-400">No active blockers</p> :
            <div className="space-y-2">{activeBlockers.map((b: any) => (
              <div key={b.id} className="text-sm"><p className="text-gray-700 font-medium truncate">{b.title}</p><p className="text-xs text-gray-400">{b.project_name}</p></div>
            ))}</div>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Scale className="w-4 h-4 text-purple-500" /> Pending Decisions</h3>
          {pendingDecisions.length === 0 ? <p className="text-sm text-gray-400">No pending decisions</p> :
            <div className="space-y-2">{pendingDecisions.map((d: any) => (
              <div key={d.id} className="text-sm"><p className="text-gray-700 font-medium truncate">{d.title}</p><p className="text-xs text-gray-400">{d.project_name}</p></div>
            ))}</div>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><CheckSquare className="w-4 h-4 text-blue-500" /> Recent Tasks</h3>
          {recentTasks.length === 0 ? <p className="text-sm text-gray-400">No recent tasks</p> :
            <div className="space-y-2">{recentTasks.map((t: any) => (
              <div key={t.id} className="text-sm"><p className="text-gray-700 font-medium truncate">{t.title}</p><div className="flex gap-2 text-xs text-gray-400"><span>{t.project_name}</span><Badge type="status" value={t.status} /></div></div>
            ))}</div>}
        </div>
      </div>
    </div>
  );
}
