"use client";

import { useState, useEffect, useCallback } from "react";
import type { AgentRun } from "@/types";

// --- Helpers ---

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- Badges & Avatars ---

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    running: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" },
    completed: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" },
    failed: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
    timeout: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
    abandoned: { bg: "rgba(107, 114, 128, 0.15)", text: "#6b7280" },
  };
  const c = colors[status] || colors.abandoned;
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}
    >
      {phase}
    </span>
  );
}

function PersonaAvatar({ name, color, avatar, size = 28 }: { name: string | null; color: string | null; avatar: string | null; size?: number }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name || "Agent"}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color || "#6366f1", fontSize: size * 0.35 }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

// --- Credit Pause Banner ---

interface CreditPauseStatus {
  paused: boolean;
  resumesAt: string | null;
  remainingMs: number;
  reason: string | null;
}

function CreditPauseBanner({ status, onResume }: { status: CreditPauseStatus; onResume: () => void }) {
  const [remaining, setRemaining] = useState(status.remainingMs);

  useEffect(() => {
    setRemaining(status.remainingMs);
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status.remainingMs]);

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const timeStr = status.resumesAt
    ? new Date(status.resumesAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      className="rounded-lg px-4 py-3 mb-6"
      style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
            Credits Paused
          </span>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {timeStr ? `Resumes at ${timeStr}` : "Paused"}{" "}
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>
              ({mins}m {secs}s)
            </span>
          </span>
        </div>
        <button
          onClick={onResume}
          className="text-xs font-medium py-1.5 px-3 rounded transition-colors"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            color: "#f59e0b",
            border: "1px solid rgba(245, 158, 11, 0.3)",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "rgba(245, 158, 11, 0.25)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "rgba(245, 158, 11, 0.15)"; }}
        >
          Resume Now
        </button>
      </div>
    </div>
  );
}

// --- Stat Card ---

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", border: "1px solid var(--border-subtle)" }}
    >
      <div className="text-2xl font-bold" style={{ color }}>{count}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

// --- Active Agent Card ---

function ActiveAgentCard({ run }: { run: AgentRun }) {
  const [elapsed, setElapsed] = useState(run.startedAt ? formatElapsed(run.startedAt) : "0s");

  useEffect(() => {
    if (!run.startedAt) return;
    const interval = setInterval(() => {
      setElapsed(formatElapsed(run.startedAt!));
    }, 1000);
    return () => clearInterval(interval);
  }, [run.startedAt]);

  return (
    <div
      className="rounded-lg p-4 transition-colors hover:bg-white/[0.02]"
      style={{
        backgroundColor: "var(--bg-card, var(--bg-secondary))",
        border: "1px solid var(--border-subtle)",
        borderLeft: "3px solid #22c55e",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <PersonaAvatar name={run.personaName} color={run.personaColor} avatar={run.personaAvatar} size={40} />
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style={{
              backgroundColor: "#22c55e",
              borderColor: "var(--bg-card, var(--bg-secondary))",
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {run.personaName || "Agent"}
            </span>
            {run.personaRole && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: "rgba(107, 114, 128, 0.15)", color: "#9ca3af" }}
              >
                {run.personaRole}
              </span>
            )}
            <PhaseBadge phase={run.phase} />
          </div>
          <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {run.ticketTitle || run.ticketId}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">{elapsed}</span>
            {run.lastReportAt && (
              <span>Last report: {formatTime(run.lastReportAt)}</span>
            )}
            {run.dispatchSource && (
              <span>via {run.dispatchSource}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Filter Tabs ---

type FilterTab = "all" | "completed" | "failed" | "timeout" | "abandoned";

function FilterTabs({ active, counts, onChange }: { active: FilterTab; counts: Record<FilterTab, number>; onChange: (tab: FilterTab) => void }) {
  const tabs: { key: FilterTab; label: string; color: string }[] = [
    { key: "all", label: "All", color: "var(--text-secondary)" },
    { key: "completed", label: "Completed", color: "#22c55e" },
    { key: "failed", label: "Failed", color: "#ef4444" },
    { key: "timeout", label: "Timeout", color: "#eab308" },
    { key: "abandoned", label: "Abandoned", color: "#6b7280" },
  ];

  return (
    <div className="flex items-center gap-1 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={
            active === tab.key
              ? { backgroundColor: "rgba(255, 255, 255, 0.1)", color: tab.color }
              : { color: "var(--text-muted)" }
          }
          onMouseEnter={(e) => { if (active !== tab.key) (e.target as HTMLElement).style.backgroundColor = "rgba(255, 255, 255, 0.05)"; }}
          onMouseLeave={(e) => { if (active !== tab.key) (e.target as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          {tab.label} ({counts[tab.key]})
        </button>
      ))}
    </div>
  );
}

// --- Main Component ---

interface HeartbeatStatus {
  status: "running" | "idle" | "unknown";
  lastPing: string | null;
  lastCompleted: string | null;
  lastResult: { dispatched: number; completed: number; skipped: number } | null;
  authExpired?: boolean;
}

function HeartbeatBar({ hb, onReauthDone }: { hb: HeartbeatStatus | null; onReauthDone: () => void }) {
  const [, setTick] = useState(0);
  const [reauthState, setReauthState] = useState<"idle" | "triggered">("idle");

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // Auth expired banner — auto-triggered, show status + manual fallback
  if (hb?.authExpired) {
    const handleManualTrigger = async () => {
      setReauthState("triggered");
      try {
        await fetch("/api/auth/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      } catch { /* ignore */ }
    };

    const handleForceResume = async () => {
      await fetch("/api/auth/reauth", { method: "DELETE" });
      onReauthDone();
    };

    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
        <span className="flex-shrink-0" style={{ color: "#f87171" }}>⚠ Auth expired — re-authenticating via Chrome…</span>
        {reauthState === "idle" && (
          <button
            onClick={handleManualTrigger}
            className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity hover:opacity-80 flex-shrink-0"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.25)", color: "#f87171", border: "none", cursor: "pointer" }}
          >
            Retry
          </button>
        )}
        {reauthState === "triggered" && (
          <span className="flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>Chrome opening…</span>
        )}
        <button
          onClick={handleForceResume}
          className="px-2 py-0.5 rounded text-xs transition-opacity hover:opacity-80 flex-shrink-0"
          style={{ backgroundColor: "transparent", color: "rgba(255,255,255,0.3)", border: "none", cursor: "pointer" }}
          title="Clear flag manually if you've already logged in"
        >
          Resume
        </button>
      </div>
    );
  }

  if (!hb || !hb.lastPing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "var(--text-muted)" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
        Heartbeat — no data yet
      </div>
    );
  }

  const sinceMs = hb.lastPing ? Date.now() - new Date(hb.lastPing).getTime() : null;
  const sinceCompleteMs = hb.lastCompleted ? Date.now() - new Date(hb.lastCompleted).getTime() : null;
  const isRunning = hb.status === "running";
  const isStale = sinceMs !== null && sinceMs > 90_000; // >90s since last ping = possibly stuck

  const color = isRunning ? "#818cf8" : isStale ? "#f59e0b" : "#22c55e";
  const label = isRunning
    ? "Scanning now…"
    : sinceCompleteMs !== null
    ? `Last scan ${formatElapsed(hb.lastCompleted!)} ago`
    : "Heartbeat idle";

  const resultStr = hb.lastResult
    ? `${hb.lastResult.dispatched} dispatched · ${hb.lastResult.completed} completed · ${hb.lastResult.skipped} skipped`
    : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: color,
          animation: isRunning ? "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite" : undefined,
        }}
      />
      <span style={{ color }}>{label}</span>
      {resultStr && !isRunning && (
        <span style={{ color: "var(--text-muted)" }}>— {resultStr}</span>
      )}
    </div>
  );
}

export function AgentActivityView({ projectSlug }: { projectSlug: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [creditPause, setCreditPause] = useState<CreditPauseStatus | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [runsRes, pauseRes, hbRes] = await Promise.all([
          fetch(`/api/agent-runs?limit=100&projectSlug=${projectSlug}`),
          fetch("/api/credit-pause"),
          fetch("/api/heartbeat-status"),
        ]);
        if (cancelled) return;
        const runsData = await runsRes.json();
        const pauseData = await pauseRes.json();
        const hbData = await hbRes.json();
        setRuns(Array.isArray(runsData) ? runsData : []);
        setCreditPause(pauseData);
        setHeartbeat(hbData);
      } catch {}
    }
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectSlug]);

  async function handleResume() {
    try {
      await fetch("/api/credit-pause", { method: "DELETE" });
      setCreditPause({ paused: false, resumesAt: null, remainingMs: 0, reason: null });
    } catch {}
  }

  const activeRuns = runs.filter((r) => r.status === "running");
  const finishedRuns = runs.filter((r) => r.status !== "running");

  const counts: Record<FilterTab, number> = {
    all: finishedRuns.length,
    completed: finishedRuns.filter((r) => r.status === "completed").length,
    failed: finishedRuns.filter((r) => r.status === "failed").length,
    timeout: finishedRuns.filter((r) => r.status === "timeout").length,
    abandoned: finishedRuns.filter((r) => r.status === "abandoned").length,
  };

  const filteredRuns = filter === "all" ? finishedRuns : finishedRuns.filter((r) => r.status === filter);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b px-8 py-5" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Agent Activity</h1>
            {activeRuns.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
                <span className="text-xs" style={{ color: "#22c55e" }}>{activeRuns.length} active</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Heart icon — pulses when heartbeat is running, dim when paused */}
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: (() => {
                  if (heartbeat?.authExpired) return "#ef4444"; // auth expired — bright red
                  if (creditPause?.paused) return "rgba(255,255,255,0.12)";
                  if (!heartbeat?.lastPing) return "rgba(255,255,255,0.12)"; // no data
                  const sinceMs = Date.now() - new Date(heartbeat.lastPing).getTime();
                  if (sinceMs > 90_000) return "#6b7280"; // stale — grey
                  if (heartbeat.status === "running") return "#f43f5e"; // active — red
                  return "rgba(255,255,255,0.25)"; // idle — dim
                })(),
                animation: (heartbeat?.authExpired || (heartbeat?.status === "running" && !creditPause?.paused))
                  ? "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                  : undefined,
                transition: "color 0.3s",
              }}
            >
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
            <HeartbeatBar
              hb={heartbeat}
              onReauthDone={() => setHeartbeat(hb => hb ? { ...hb, authExpired: false } : hb)}
            />
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Active Now" count={activeRuns.length} color="#22c55e" />
          <StatCard label="Completed" count={counts.completed} color="#22c55e" />
          <StatCard label="Failed" count={counts.failed} color="#ef4444" />
          <StatCard label="Timeout" count={counts.timeout} color="#eab308" />
          <StatCard label="Abandoned" count={counts.abandoned} color="#6b7280" />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Credit Pause Banner */}
        {creditPause?.paused && (
          <CreditPauseBanner status={creditPause} onResume={handleResume} />
        )}

        {/* Active Agents Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: activeRuns.length > 0 ? "#22c55e" : "var(--text-muted)" }}
            />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Active Agents ({activeRuns.length})
            </h2>
          </div>

          {activeRuns.length === 0 ? (
            <div
              className="rounded-lg px-6 py-8 text-center"
              style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", border: "1px solid var(--border-subtle)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No agents running</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {activeRuns.map((run) => (
                <ActiveAgentCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>

        {/* Run History Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Run History
            </h2>
            {finishedRuns.length > 0 && (
              <button
                onClick={async () => {
                  await fetch(`/api/agent-runs?projectSlug=${projectSlug}`, { method: "DELETE" });
                  setRuns((prev) => prev.filter((r) => r.status === "running"));
                }}
                className="text-xs transition-colors hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            )}
          </div>
          <FilterTabs active={filter} counts={counts} onChange={setFilter} />

          {filteredRuns.length === 0 ? (
            <div
              className="rounded-lg px-6 py-8 text-center"
              style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", border: "1px solid var(--border-subtle)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No runs to show</span>
            </div>
          ) : (
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              {/* Table Header */}
              <div
                className="grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span>Agent</span>
                <span>Ticket</span>
                <span>Phase</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Started</span>
              </div>

              {/* Table Rows */}
              {filteredRuns.map((run) => (
                <div
                  key={run.id}
                  className="grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PersonaAvatar name={run.personaName} color={run.personaColor} avatar={run.personaAvatar} size={28} />
                    <span className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                      {run.personaName || "Agent"}
                    </span>
                  </div>
                  <span className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                    {run.ticketTitle || run.ticketId}
                  </span>
                  <div><PhaseBadge phase={run.phase} /></div>
                  <div><StatusBadge status={run.status} /></div>
                  <span className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                    {run.durationMs != null ? formatDuration(run.durationMs) : "—"}
                  </span>
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {formatTime(run.startedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
