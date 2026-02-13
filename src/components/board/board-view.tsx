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

const AGENT_ACTIVE_MS = 30 * 60 * 1000;

// Sort tickets within a column: "needs your attention" first, "agent working" last
function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => scoreTicket(b) - scoreTicket(a));
}

function scoreTicket(t: Ticket): number {
  const now = Date.now();
  const agentActive = t.lastAgentActivity && (now - new Date(t.lastAgentActivity).getTime()) < AGENT_ACTIVE_MS;

  // Agent actively working = sink to bottom (nothing for human to do)
  if (agentActive) return -1000;

  let score = 0;

  // Progress through the pipeline — further along = closer to needing human action
  if (t.researchCompletedAt) score += 100;
  if (t.researchApprovedAt) score += 100;
  if (t.planCompletedAt) score += 100;
  if (t.planApprovedAt) score += 100;

  // Completed but not approved = needs human review NOW (highest priority)
  if (t.researchCompletedAt && !t.researchApprovedAt) score += 200;
  if (t.planCompletedAt && !t.planApprovedAt) score += 200;

  // Returned from verification = needs attention
  if (t.returnedFromVerification) score += 150;

  // Bugs above features above chores
  if (t.type === "bug") score += 50;
  else if (t.type === "chore") score -= 10;

  // Recent human comment = human is engaged with this ticket
  if (t.lastHumanCommentAt) {
    const humanAge = now - new Date(t.lastHumanCommentAt).getTime();
    if (humanAge < 3600_000) score += 80; // commented in last hour
    else if (humanAge < 86400_000) score += 30; // commented today
  }

  // Ship column: recently merged first
  if (t.mergedAt) {
    score += 50;
    const mergeAge = now - new Date(t.mergedAt).getTime();
    if (mergeAge < 86400_000) score += 50; // merged today
  }

  return score;
}

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
      acc[state] = sortTickets(tickets.filter((t) => t.state === state));
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
        const defaultCollapsed = state === "ship";
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
