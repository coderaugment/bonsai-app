"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Ticket, TicketState } from "@/types";
import { Column } from "./column";
import { TicketDetailModal } from "./ticket-detail-modal";

const columnOrder: TicketState[] = [
  "research",
  "plan",
  "build",
  "test",
  "ship",
];

interface BoardViewProps {
  tickets: Ticket[];
  projectId: string;
}

export function BoardView({ tickets: initialTickets, projectId }: BoardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState(initialTickets);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [initialDocType, setInitialDocType] = useState<"research" | "implementation_plan" | undefined>();

  // User-overridden collapse state — null means "use default"
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});

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

  // Auto-open ticket from URL query param (e.g. after creating a new ticket)
  const openTicketParam = searchParams.get("openTicket");
  useEffect(() => {
    if (!openTicketParam) return;
    const match = tickets.find((t) => t.id === openTicketParam);
    if (match) {
      setSelectedTicket(match);
      // Clean the query param from the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("openTicket");
      router.replace(url.pathname, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketParam, tickets]);

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

    // Persist — ship endpoint handles merge + worktree cleanup
    if (targetState === "ship") {
      await fetch(`/api/tickets/${draggingId}/ship`, { method: "POST" });
    } else {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: draggingId, state: targetState }),
      });
    }
    router.refresh();
  }

  return (
    <div className="flex gap-6 overflow-x-auto px-6 py-5 flex-1 h-full">
      {columnOrder.map((state) => {
        const defaultCollapsed = state === "ship" || (state !== "research" && grouped[state].length === 0);
        const collapsed = state in collapseOverrides ? collapseOverrides[state] : defaultCollapsed;
        return (
          <Column
            key={state}
            state={state}
            tickets={grouped[state]}
            collapsed={collapsed}
            onToggleCollapse={(val) => setCollapseOverrides((prev) => ({ ...prev, [state]: val }))}
            draggingId={draggingId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onEdit={(ticket) => { setInitialDocType(undefined); setSelectedTicket(ticket); }}
            onViewDocument={(ticket, docType) => { setInitialDocType(docType); setSelectedTicket(ticket); }}
          />
        );
      })}

      <TicketDetailModal
        ticket={selectedTicket}
        initialDocType={initialDocType}
        projectId={projectId}
        onClose={() => { setSelectedTicket(null); setInitialDocType(undefined); }}
        onDelete={(ticketId) => {
          setTickets((prev) => prev.filter((t) => t.id !== ticketId));
          setSelectedTicket(null);
          setInitialDocType(undefined);
        }}
      />
    </div>
  );
}
