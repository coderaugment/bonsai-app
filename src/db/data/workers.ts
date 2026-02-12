import { db, asAsync } from "./_driver";
import { personas, tickets, comments, ticketDocuments } from "../schema";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";

export function getWorkerActivity(projectId?: number) {
  const allPersonas = projectId
    ? db
        .select()
        .from(personas)
        .where(
          and(
            eq(personas.projectId, Number(projectId)),
            isNull(personas.deletedAt)
          )
        )
        .all()
    : db
        .select()
        .from(personas)
        .where(isNull(personas.deletedAt))
        .all();

  const personaMap = new Map(allPersonas.map((p) => [p.id, p]));
  const now = new Date();
  const thirtyMinAgo = new Date(
    now.getTime() - 30 * 60 * 1000
  ).toISOString();

  const workers = allPersonas.map((p) => {
    const assignedTickets = db
      .select()
      .from(tickets)
      .where(eq(tickets.assigneeId, p.id))
      .all();

    const isActive = assignedTickets.some(
      (t) => t.lastAgentActivity && t.lastAgentActivity > thirtyMinAgo
    );

    const ticketIds = assignedTickets.map((t) => t.id);
    const allTicketComments =
      ticketIds.length > 0
        ? db
            .select()
            .from(comments)
            .where(inArray(comments.ticketId, ticketIds))
            .orderBy(desc(comments.createdAt))
            .limit(50)
            .all()
        : [];

    const allDocs =
      ticketIds.length > 0
        ? db
            .select()
            .from(ticketDocuments)
            .where(inArray(ticketDocuments.ticketId, ticketIds))
            .orderBy(desc(ticketDocuments.createdAt))
            .all()
        : [];

    const ticketTitleMap = new Map(
      assignedTickets.map((t) => [t.id, t.title])
    );

    const activityFeed = [
      ...allTicketComments.map((c) => {
        const author = c.personaId ? personaMap.get(c.personaId) : null;
        return {
          kind: "comment" as const,
          id: `c-${c.id}`,
          ticketId: c.ticketId,
          ticketTitle: ticketTitleMap.get(c.ticketId) || c.ticketId,
          authorType: c.authorType as "human" | "agent",
          authorName:
            author?.name ||
            (c.authorType === "human" ? "You" : "Agent"),
          authorRole: author?.role || null,
          authorColor: author?.color || null,
          authorAvatar: author?.avatar || null,
          isSelf: c.personaId === p.id,
          content: c.content,
          createdAt: c.createdAt || "",
        };
      }),
      ...allDocs.map((d) => ({
        kind: "document" as const,
        id: `d-${d.id}`,
        ticketId: d.ticketId,
        ticketTitle: ticketTitleMap.get(d.ticketId) || d.ticketId,
        authorType: "agent" as const,
        authorName: p.name,
        authorRole: p.role,
        authorColor: p.color,
        authorAvatar: p.avatar,
        isSelf: true,
        content: d.content.slice(0, 2000),
        docType: d.type,
        version: d.version,
        createdAt: d.createdAt || "",
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      color: p.color,
      avatar: p.avatar ?? null,
      role: p.role || "developer",
      isActive,
      stats: {
        assignedTickets: assignedTickets.length,
        activeTickets: assignedTickets.filter((t) => t.state !== "ship")
          .length,
        doneTickets: assignedTickets.filter((t) => t.state === "ship")
          .length,
        totalComments: allTicketComments.filter(
          (c) => c.personaId === p.id
        ).length,
      },
      tickets: assignedTickets.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        type: t.type,
        lastAgentActivity: t.lastAgentActivity,
      })),
      activityFeed,
    };
  });

  workers.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return asAsync(workers);
}
