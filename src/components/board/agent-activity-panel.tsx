"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AgentRun } from "@/types";

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" },
    failed: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
    timeout: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
    abandoned: { bg: "rgba(107, 114, 128, 0.15)", text: "#6b7280" },
  };
  const c = colors[status] || colors.abandoned;
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}
    >
      {phase}
    </span>
  );
}

function PersonaAvatar({ name, color, avatar }: { name: string | null; color: string | null; avatar: string | null }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name || "Agent"}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
      style={{ backgroundColor: color || "#6366f1" }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function ActiveRunRow({ run }: { run: AgentRun }) {
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
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-white/5"
    >
      {/* Pulsing green dot */}
      <div className="relative flex-shrink-0">
        <PersonaAvatar name={run.personaName} color={run.personaColor} avatar={run.personaAvatar} />
        <div
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
          style={{
            backgroundColor: "#22c55e",
            borderColor: "var(--bg-secondary)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {run.personaName || "Agent"}
          </span>
          <PhaseBadge phase={run.phase} />
        </div>
        <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {run.ticketTitle || run.ticketId}
        </div>
      </div>
      <span className="text-[11px] font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {elapsed}
      </span>
    </div>
  );
}

function RecentRunRow({ run }: { run: AgentRun }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-white/5"
    >
      <PersonaAvatar name={run.personaName} color={run.personaColor} avatar={run.personaAvatar} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>
            {run.personaName || "Agent"}
          </span>
          <PhaseBadge phase={run.phase} />
        </div>
        <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {run.ticketTitle || run.ticketId}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {run.durationMs != null && (
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {formatDuration(run.durationMs)}
          </span>
        )}
        <StatusBadge status={run.status} />
      </div>
    </div>
  );
}

export function AgentActivityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchRuns() {
      try {
        const res = await fetch("/api/agent-runs?limit=50");
        if (!cancelled) {
          const data = await res.json();
          setRuns(Array.isArray(data) ? data : []);
        }
      } catch {}
    }

    fetchRuns();
    const interval = setInterval(fetchRuns, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const activeRuns = runs.filter((r) => r.status === "running");
  const recentRuns = runs.filter((r) => r.status !== "running").slice(0, 20);

  const panel = (
    <div
      className="fixed inset-0 z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute top-0 bottom-0 flex flex-col shadow-2xl"
        style={{
          left: 64,
          width: 340,
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-medium)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Agent Activity
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Active section */}
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: activeRuns.length > 0 ? "#22c55e" : "var(--text-muted)" }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Active ({activeRuns.length})
              </span>
            </div>
          </div>

          {activeRuns.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>No agents running</span>
            </div>
          ) : (
            activeRuns.map((run) => <ActiveRunRow key={run.id} run={run} />)
          )}

          {/* Divider */}
          <div className="mx-3 my-2 border-t" style={{ borderColor: "var(--border-subtle)" }} />

          {/* Recent section */}
          <div className="px-3 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Recent ({recentRuns.length})
            </span>
          </div>

          {recentRuns.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>No recent runs</span>
            </div>
          ) : (
            recentRuns.map((run) => <RecentRunRow key={run.id} run={run} />)
          )}
        </div>
      </div>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );

  return createPortal(panel, document.body);
}
