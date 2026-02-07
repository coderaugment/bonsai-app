"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, TicketState } from "@/types";
import { Column } from "./column";
import { TicketDetailModal } from "./ticket-detail-modal";

const columnOrder: TicketState[] = [
  "backlog",
  "in_progress",
  "verification",
  "done",
];

interface BoardViewProps {
  tickets: Ticket[];
  projectId: string;
}

export function BoardView({ tickets: initialTickets, projectId }: BoardViewProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Poll for ticket updates every 15 seconds (+ immediate first fetch)
  const refreshTickets = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets?projectId=${projectId}`);
      if (res.ok) {
        const fresh: Ticket[] = await res.json();
        setTickets(fresh);
        // Keep selected ticket in sync with fresh data
        setSelectedTicket((prev) => {
          if (!prev) return null;
          return fresh.find((t) => t.id === prev.id) ?? prev;
        });
      }
    } catch { /* network error — skip this cycle */ }
  }, [projectId]);

  useEffect(() => {
    // Immediate fetch on mount to pick up changes since SSR
    refreshTickets();
    const poll = setInterval(refreshTickets, 15_000);
    return () => clearInterval(poll);
  }, [refreshTickets]);

  // Sync when server-side props change (navigation)
  useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  const grouped = columnOrder.reduce(
    (acc, state) => {
      acc[state] = tickets.filter((t) => t.state === state);
      return acc;
    },
    {} as Record<TicketState, Ticket[]>
  );

  function handleDragStart(ticketId: string) {
    setDraggingId(ticketId);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  async function handleDrop(targetState: TicketState) {
    if (!draggingId) return;
    const ticket = tickets.find((t) => t.id === draggingId);
    if (!ticket || ticket.state === targetState) {
      setDraggingId(null);
      return;
    }

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) => (t.id === draggingId ? { ...t, state: targetState } : t))
    );
    setDraggingId(null);

    // Persist
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: draggingId, state: targetState }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-6 overflow-x-auto px-6 py-5 flex-1 h-full">
      {columnOrder.map((state) => (
        <Column
          key={state}
          state={state}
          tickets={grouped[state]}
          defaultCollapsed={state === "done"}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          onEdit={setSelectedTicket}
        />
      ))}

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onDelete={(ticketId) => {
          setTickets((prev) => prev.filter((t) => t.id !== ticketId));
          setSelectedTicket(null);
        }}
      />
    </div>
  );
}
