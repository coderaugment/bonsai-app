"use client";

import { useState, useEffect } from "react";

interface WorkerTicket {
  id: string;
  title: string;
  state: string;
  type: string;
  lastAgentActivity: string | null;
}

interface ActivityItem {
  kind: "comment" | "document";
  id: string;
  ticketId: string;
  ticketTitle: string;
  authorType: "human" | "agent";
  authorName: string;
  authorRole: string | null;
  authorColor: string | null;
  authorAvatar: string | null;
  isSelf: boolean;
  content: string;
  docType?: string;
  version?: number;
  createdAt: string;
}

interface Worker {
  id: string;
  name: string;
  slug: string;
  color: string;
  avatar: string | null;
  role: string;
  isActive: boolean;
  stats: {
    assignedTickets: number;
    activeTickets: number;
    doneTickets: number;
    totalComments: number;
  };
  tickets: WorkerTicket[];
  activityFeed: ActivityItem[];
}

const stateColors: Record<string, string> = {
  backlog: "var(--text-muted)",
  in_progress: "var(--accent-blue)",
  verification: "var(--accent-amber)",
  done: "var(--accent-green)",
};

const stateLabels: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  verification: "Verification",
  done: "Done",
};

interface WorkersViewProps {
  projectId?: number;
}

export function WorkersView({ projectId: propProjectId }: WorkersViewProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [resolvedProjectId, setResolvedProjectId] = useState<number | null>(propProjectId ?? null);

  // If no projectId prop, resolve from active project setting
  useEffect(() => {
    if (propProjectId) {
      setResolvedProjectId(propProjectId);
      return;
    }
    fetch("/api/settings/project")
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setResolvedProjectId(Number(data.id));
      })
      .catch(() => {});
  }, [propProjectId]);

  function buildUrl() {
    return resolvedProjectId
      ? `/api/workers?projectId=${resolvedProjectId}`
      : "/api/workers";
  }

  useEffect(() => {
    if (resolvedProjectId === null && !propProjectId) return;
    fetch(buildUrl())
      .then((r) => r.json())
      .then((data) => {
        setWorkers(data.workers ?? []);
        const first = data.workers?.[0];
        if (first) setSelected(first.id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [resolvedProjectId]);

  useEffect(() => {
    if (resolvedProjectId === null && !propProjectId) return;
    const interval = setInterval(() => {
      fetch(buildUrl())
        .then((r) => r.json())
        .then((data) => setWorkers(data.workers ?? []))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(interval);
  }, [resolvedProjectId]);

  const selectedWorker = workers.find((w) => w.id === selected);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading workers...</span>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No workers yet. Generate your team in Company settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Avatar row */}
      <div
        className="px-6 py-3 border-b shrink-0 flex items-center gap-1"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {workers.map((w) => {
          const isSel = selected === w.id;
          return (
            <button
              key={w.id}
              onClick={() => setSelected(w.id)}
              className="relative shrink-0 rounded-full transition-all"
              style={{
                opacity: w.isActive ? 1 : 0.4,
                outline: isSel ? `2px solid ${w.color}` : "2px solid transparent",
                outlineOffset: "2px",
              }}
              title={`${w.name} — ${w.role}${w.isActive ? " (active)" : ""}`}
            >
              {w.avatar ? (
                <img
                  src={w.avatar}
                  alt={w.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: w.color }}
                >
                  {w.name[0]}
                </div>
              )}
              {w.isActive && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ backgroundColor: "#22c55e", borderColor: "var(--bg-primary)" }}
                />
              )}
            </button>
          );
        })}
        <div className="ml-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {workers.filter((w) => w.isActive).length} active / {workers.length}
        </div>
      </div>

      {/* Full-page worker view */}
      {selectedWorker ? (
        <WorkerDetail worker={selectedWorker} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Select a worker above</p>
        </div>
      )}
    </div>
  );
}

function WorkerDetail({ worker }: { worker: Worker }) {
  const [filter, setFilter] = useState<"all" | "self" | "critic" | "documents">("all");

  const filtered = worker.activityFeed.filter((item) => {
    if (filter === "all") return true;
    if (filter === "self") return item.isSelf && item.kind === "comment";
    if (filter === "critic") return !item.isSelf && item.authorRole === "critic" && item.kind === "comment";
    if (filter === "documents") return item.kind === "document";
    return true;
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: worker identity + tickets */}
      <div
        className="w-64 shrink-0 border-r flex flex-col overflow-hidden"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {/* Identity */}
        <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-3">
            {worker.avatar ? (
              <img
                src={worker.avatar}
                alt={worker.name}
                className="w-10 h-10 rounded-full object-cover"
                style={{ border: `2px solid ${worker.color}` }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                style={{ backgroundColor: worker.color }}
              >
                {worker.name[0]}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {worker.name}
              </div>
              <div className="text-xs" style={{ color: worker.color }}>
                {worker.role}
                {worker.isActive && <span style={{ color: "#22c55e" }}> — active</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <StatBadge label="Active" value={worker.stats.activeTickets} color="var(--accent-blue)" />
            <StatBadge label="Done" value={worker.stats.doneTickets} color="var(--accent-green)" />
            <StatBadge label="Msgs" value={worker.stats.totalComments} color="var(--accent-purple)" />
          </div>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <h3
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Assigned tickets
          </h3>
          {worker.tickets.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>None</p>
          ) : (
            <div className="space-y-1">
              {worker.tickets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-lg"
                  style={{ backgroundColor: "var(--bg-input)" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: stateColors[t.state] || "var(--text-muted)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {t.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
                        {t.id}
                      </span>
                      <span className="text-[9px]" style={{ color: stateColors[t.state] }}>
                        {stateLabels[t.state] || t.state}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: activity feed */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filter bar */}
        <div
          className="px-6 py-2.5 border-b shrink-0 flex items-center gap-2"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h3
            className="text-[10px] font-semibold uppercase tracking-wider mr-3"
            style={{ color: "var(--text-muted)" }}
          >
            Activity
          </h3>
          {(["all", "self", "critic", "documents"] as const).map((f) => {
            const labels = { all: "All", self: "Own thoughts", critic: "Critic", documents: "Artifacts" };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: filter === f ? "rgba(91,141,249,0.15)" : "transparent",
                  color: filter === f ? "var(--accent-blue)" : "var(--text-muted)",
                }}
              >
                {labels[f]}
              </button>
            );
          })}
          <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
            {filtered.length} items
          </span>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>No activity yet</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((item, i) => {
                const showDate =
                  i === 0 || dayKey(item.createdAt) !== dayKey(filtered[i - 1].createdAt);
                const showTicketHeader =
                  i === 0 || item.ticketId !== filtered[i - 1].ticketId;

                return (
                  <div key={item.id}>
                    {showDate && (
                      <div
                        className="text-[10px] font-semibold uppercase tracking-wider pt-4 pb-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {formatDay(item.createdAt)}
                      </div>
                    )}
                    {showTicketHeader && (
                      <div
                        className="flex items-center gap-2 mt-3 mb-1 px-2 py-1 rounded"
                        style={{ backgroundColor: "var(--bg-input)" }}
                      >
                        <span className="text-[10px] font-mono font-medium" style={{ color: "var(--accent-blue)" }}>
                          {item.ticketId}
                        </span>
                        <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                          {item.ticketTitle}
                        </span>
                      </div>
                    )}
                    <FeedItem item={item} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedItem({ item }: { item: ActivityItem }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.content.length > 300;
  const displayContent = expanded || !isLong ? item.content : item.content.slice(0, 300) + "...";

  const dotColor = item.isSelf
    ? item.authorColor || "var(--accent-blue)"
    : item.authorRole === "critic"
      ? "var(--accent-amber)"
      : item.authorType === "human"
        ? "var(--accent-green)"
        : "var(--accent-purple)";

  const nameColor = item.isSelf
    ? item.authorColor || "var(--text-primary)"
    : item.authorRole === "critic"
      ? "var(--accent-amber)"
      : item.authorType === "human"
        ? "var(--accent-green)"
        : item.authorColor || "var(--accent-purple)";

  return (
    <div className="flex gap-2.5 py-1.5 group">
      <div className="shrink-0 w-14 text-right flex items-start justify-end gap-1.5 pt-0.5">
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {formatTime(item.createdAt)}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full mt-1 shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {item.authorAvatar ? (
            <img src={item.authorAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
          ) : (
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: item.authorColor || "var(--accent-blue)" }}
            >
              {item.authorName[0]}
            </div>
          )}
          <span className="text-[11px] font-semibold" style={{ color: nameColor }}>
            {item.authorName}
          </span>
          {item.authorRole && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${nameColor} 12%, transparent)`,
                color: nameColor,
              }}
            >
              {item.authorRole}
            </span>
          )}
          {item.kind === "document" && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: "rgba(139, 92, 246, 0.12)",
                color: "var(--accent-purple)",
              }}
            >
              {item.docType === "research" ? "Research" : "Plan"} v{item.version}
            </span>
          )}
          {item.isSelf && (
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              (self)
            </span>
          )}
        </div>
        <p
          className="text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-primary)" }}
        >
          {displayContent}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] mt-0.5 hover:underline"
            style={{ color: "var(--accent-blue)" }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 rounded-lg px-2 py-1 text-center" style={{ backgroundColor: "var(--bg-input)" }}>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function dayKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
