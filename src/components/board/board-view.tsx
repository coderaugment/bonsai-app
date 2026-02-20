"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Ticket, TicketState, Persona, Project } from "@/types";
import { Column } from "./column";
import { TicketDetailModal } from "./ticket-detail-modal";
import { ProjectInfoPanel } from "./project-info-panel";
import { ProjectChatPanel } from "./project-chat-panel";

const columnOrder: TicketState[] = [
  "planning",
  "building",
  "review",
  "shipped",
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

  // Epics near top of columns
  if (t.isEpic) score += 30;

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
  personas?: Persona[];
  project?: Project;
  ticketStats?: { planning: number; building: number; review: number; shipped: number };
  awakePersonaIds?: string[];
}

export function BoardView({
  tickets: initialTickets,
  projectId,
  personas = [],
  project,
  ticketStats,
  awakePersonaIds: awakePersonaIdsList = [],
}: BoardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState(initialTickets);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [initialDocType, setInitialDocType] = useState<"research" | "implementation_plan" | undefined>();

  // Chat panel state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMentionPersonaId, setChatMentionPersonaId] = useState<string | null>(null);

  const awakePersonaIds = useMemo(() => new Set(awakePersonaIdsList), [awakePersonaIdsList]);

  // User-overridden collapse state — persisted per project in localStorage
  const storageKey = `bonsai-col-collapse-${projectId}`;
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCollapseOverrides(JSON.parse(saved));
    } catch {}
    setMounted(true);
  }, [storageKey]);

  // Persist collapse overrides when they change (only after mount)
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(storageKey, JSON.stringify(collapseOverrides)); } catch {}
  }, [storageKey, collapseOverrides, mounted]);

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

  // Auto-open ticket from URL query param (e.g. after creating a new ticket or sharing a link)
  const openTicketParam = searchParams.get("openTicket") || searchParams.get("ticket");
  const openDocParam = searchParams.get("doc");
  useEffect(() => {
    if (!openTicketParam) return;
    const match = tickets.find((t) => t.id === Number(openTicketParam));
    if (match) {
      // Set doc type if specified in URL
      if (openDocParam === "research") setInitialDocType("research");
      else if (openDocParam === "plan") setInitialDocType("implementation_plan");
      setSelectedTicket(match);
      // Clean the openTicket param from the URL (but keep ticket= for sharing)
      if (searchParams.get("openTicket")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("openTicket");
        router.replace(url.pathname + url.search, { scroll: false });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketParam, openDocParam, tickets]);

  const grouped = columnOrder.reduce(
    (acc, state) => {
      acc[state] = sortTickets(tickets.filter((t) => t.state === state && !t.isEpic));
      return acc;
    },
    {} as Record<TicketState, Ticket[]>
  );

  function handleOpenEpic(epicId: number) {
    const epic = tickets.find((t) => t.id === epicId);
    if (epic) {
      setInitialDocType(undefined);
      setSelectedTicket(epic);
      // Update URL to include ticket ID
      const url = new URL(window.location.href);
      url.searchParams.set("ticket", String(epicId));
      url.searchParams.delete("doc");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }

  function handleDragStart(ticketId: number) {
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
    if (targetState === "shipped") {
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

  function handlePersonaClick(personaId: string) {
    setChatMentionPersonaId(personaId);
    setChatOpen(true);
  }

  return (
    <>
      {/* Project info panel with clickable avatars */}
      {project && ticketStats && (
        <ProjectInfoPanel
          project={project}
          personas={personas}
          ticketStats={ticketStats}
          awakePersonaIds={awakePersonaIds}
          onPersonaClick={handlePersonaClick}
          onChatOpen={() => { setChatMentionPersonaId(null); setChatOpen(true); }}
        />
      )}

      {/* Main content area: columns + chat sidebar */}
      <div className="flex flex-1 h-full overflow-hidden">
        {/* Board columns */}
        <div className="flex gap-6 overflow-x-auto px-6 py-5 flex-1">
          {columnOrder.map((state) => {
            const defaultCollapsed = state === "shipped";
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
                onEdit={(ticket) => {
                  setInitialDocType(undefined);
                  setSelectedTicket(ticket);
                  const url = new URL(window.location.href);
                  url.searchParams.set("ticket", String(ticket.id));
                  url.searchParams.delete("doc");
                  router.replace(url.pathname + url.search, { scroll: false });
                }}
                onViewDocument={(ticket, docType) => {
                  setInitialDocType(docType);
                  setSelectedTicket(ticket);
                  const url = new URL(window.location.href);
                  url.searchParams.set("ticket", String(ticket.id));
                  url.searchParams.set("doc", docType === "research" ? "research" : "plan");
                  router.replace(url.pathname + url.search, { scroll: false });
                }}
                onOpenEpic={handleOpenEpic}
              />
            );
          })}

          <TicketDetailModal
            ticket={selectedTicket}
            initialDocType={initialDocType}
            projectId={projectId}
            onClose={() => {
              setSelectedTicket(null);
              setInitialDocType(undefined);
              // Remove ticket and doc params from URL
              const url = new URL(window.location.href);
              url.searchParams.delete("ticket");
              url.searchParams.delete("doc");
              router.replace(url.pathname + url.search, { scroll: false });
            }}
            onDelete={(ticketId) => {
              setTickets((prev) => prev.filter((t) => t.id !== ticketId));
              setSelectedTicket(null);
              setInitialDocType(undefined);
              // Remove ticket and doc params from URL
              const url = new URL(window.location.href);
              url.searchParams.delete("ticket");
              url.searchParams.delete("doc");
              router.replace(url.pathname + url.search, { scroll: false });
            }}
          />
        </div>

        {/* Project Chat Sidebar */}
        <ProjectChatPanel
          projectId={projectId}
          personas={personas}
          open={chatOpen}
          onClose={() => { setChatOpen(false); setChatMentionPersonaId(null); }}
          initialMentionPersonaId={chatMentionPersonaId}
        />
      </div>
    </>
  );
}
