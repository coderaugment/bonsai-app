"use client";

import { useState } from "react";
import type { Ticket, TicketState } from "@/types";
import { TicketCard } from "./ticket-card";


const columnConfig: Record<
  TicketState,
  { label: string; color: string }
> = {
  research: { label: "Research", color: "var(--column-research)" },
  plan: { label: "Plan", color: "var(--column-plan)" },
  build: { label: "Build", color: "var(--column-build)" },
  test: { label: "Test", color: "var(--column-test)" },
  ship: { label: "Ship", color: "var(--column-ship)" },
};

interface ColumnProps {
  state: TicketState;
  tickets: Ticket[];
  collapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  draggingId: string | null;
  onDragStart: (ticketId: string) => void;
  onDragEnd: () => void;
  onDrop: (targetState: TicketState) => void;
  onEdit?: (ticket: Ticket) => void;
  onViewDocument?: (ticket: Ticket, docType: "research" | "implementation_plan") => void;
}

export function Column({
  state,
  tickets,
  collapsed,
  onToggleCollapse,
  draggingId,
  onDragStart,
  onDragEnd,
  onDrop,
  onEdit,
  onViewDocument,
}: ColumnProps) {
  const config = columnConfig[state];
  const [dragOver, setDragOver] = useState(false);

  const isDragging = draggingId !== null;
  const isDropTarget = isDragging && dragOver;

  if (collapsed) {
    return (
      <button
        onClick={() => onToggleCollapse(false)}
        className="flex flex-col items-center gap-3 py-3 px-2 rounded-xl flex-shrink-0 cursor-pointer transition-colors hover:bg-white/5 h-fit"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <span
          className="text-xs font-medium whitespace-nowrap"
          style={{
            color: "var(--text-secondary)",
            writingMode: "vertical-lr",
          }}
        >
          {config.label}
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {tickets.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex flex-col min-w-[280px] flex-1 rounded-xl transition-colors"
      style={{
        backgroundColor: isDropTarget ? "rgba(91, 141, 249, 0.04)" : "transparent",
        border: isDropTarget ? "1px dashed rgba(91, 141, 249, 0.3)" : "1px solid transparent",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDrop(state);
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 pb-3">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {config.label}
        </span>
        <span
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ({tickets.length})
        </span>

        {/* Collapse button */}
        <button
          onClick={() => onToggleCollapse(true)}
          className="ml-auto w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: "var(--text-muted)" }}
          title="Collapse column"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Ticket list */}
      <div className="flex flex-col gap-4 overflow-y-auto px-1 pb-4 flex-1">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onEdit={onEdit}
            onViewDocument={onViewDocument}
          />
        ))}

        {tickets.length === 0 && (
          <div
            className="rounded-xl p-6 flex items-center justify-center text-sm"
            style={{
              border: "1px dashed var(--border-medium)",
              color: "var(--text-muted)",
              minHeight: 80,
            }}
          >
            {isDropTarget ? "Drop here" : "No tickets"}
          </div>
        )}
      </div>
    </div>
  );
}
