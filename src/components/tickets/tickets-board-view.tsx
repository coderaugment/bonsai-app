"use client";

import type { Ticket, TicketState } from "@/types";

const COLUMNS: { state: TicketState; label: string; color: string }[] = [
  { state: "planning", label: "Planning", color: "#f59e0b" },
  { state: "building", label: "Building", color: "#22c55e" },
  { state: "preview", label: "Preview", color: "#3b82f6" },
  { state: "shipped", label: "Shipped", color: "#10b981" },
];

const TYPE_COLORS: Record<string, string> = {
  feature: "#3b82f6",
  bug: "#ef4444",
  chore: "#8b5cf6",
};

interface TicketsBoardViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export function TicketsBoardView({ tickets, onSelectTicket }: TicketsBoardViewProps) {
  return (
    <div className="flex gap-4 flex-1 overflow-x-auto px-6 py-4">
      {COLUMNS.map(({ state, label, color }) => {
        const columnTickets = tickets.filter((t) => t.state === state);
        return (
          <div
            key={state}
            className="flex flex-col min-w-[280px] w-[280px] flex-shrink-0"
          >
            <div className="flex items-center gap-2 px-3 py-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {label}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-secondary)" }}
              >
                {columnTickets.length}
              </span>
            </div>

            <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
              {columnTickets.map((ticket) => (
                <BoardCard
                  key={ticket.id}
                  ticket={ticket}
                  stateColor={color}
                  onClick={() => onSelectTicket(ticket)}
                />
              ))}

              {columnTickets.length === 0 && (
                <div
                  className="rounded-lg px-4 py-6 flex items-center justify-center text-xs"
                  style={{
                    border: "1px dashed var(--border-medium)",
                    color: "var(--text-muted)",
                  }}
                >
                  No tickets
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({
  ticket,
  stateColor,
  onClick,
}: {
  ticket: Ticket;
  stateColor: string;
  onClick: () => void;
}) {
  const typeColor = TYPE_COLORS[ticket.type] || "#6b7280";

  return (
    <div
      onClick={onClick}
      className="rounded-lg p-3 cursor-pointer transition-colors"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderLeft: `3px solid ${stateColor}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-medium)";
        e.currentTarget.style.borderLeftColor = stateColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.borderLeftColor = stateColor;
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: `color-mix(in srgb, ${typeColor} 12%, transparent)`,
            color: typeColor,
          }}
        >
          {ticket.type}
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
          {ticket.id}
        </span>
      </div>

      <div
        className="text-sm font-medium leading-tight mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {ticket.title}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center -space-x-1.5">
          {ticket.participants?.slice(0, 3).map((p) => (
            <div
              key={p.id}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2"
              style={{
                backgroundColor: p.color,
                borderColor: "var(--bg-card)",
              }}
              title={p.name}
            >
              {p.avatar ? (
                <img src={p.avatar} alt={p.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                p.name[0]
              )}
            </div>
          ))}
        </div>

        {ticket.commentCount > 0 && (
          <span
            className="flex items-center gap-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            {ticket.commentCount}
          </span>
        )}
      </div>
    </div>
  );
}
