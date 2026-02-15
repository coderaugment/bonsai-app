import { db, asAsync } from "./_driver";
import { agentRuns } from "../schema";
import { eq, and, desc, sql } from "drizzle-orm";

const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function insertAgentRun(params: {
  ticketId: number;
  personaId: string;
  phase: string;
  tools?: string[];
  sessionDir?: string;
  dispatchSource?: string;
}): Promise<number> {
  // Abandon any existing running runs for same persona (orphan cleanup)
  db.update(agentRuns)
    .set({
      status: "abandoned",
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(agentRuns.personaId, params.personaId),
        eq(agentRuns.status, "running")
      )
    )
    .run();

  const result = db
    .insert(agentRuns)
    .values({
      ticketId: params.ticketId,
      personaId: params.personaId,
      phase: params.phase,
      status: "running",
      tools: params.tools ? JSON.stringify(params.tools) : null,
      sessionDir: params.sessionDir || null,
      dispatchSource: params.dispatchSource || null,
      startedAt: new Date().toISOString(),
    })
    .run();

  return Promise.resolve(Number(result.lastInsertRowid));
}

export function completeAgentRun(
  ticketId: number,
  personaId: string,
  status: "completed" | "failed" | "timeout",
  errorMessage?: string
): Promise<void> {
  // Stateless lookup: find the most recent running run for this ticket+persona
  const run = db
    .select({ id: agentRuns.id, startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.ticketId, ticketId),
        eq(agentRuns.personaId, personaId),
        eq(agentRuns.status, "running")
      )
    )
    .orderBy(desc(agentRuns.startedAt))
    .limit(1)
    .all();

  if (run.length === 0) return Promise.resolve();

  const r = run[0];
  const durationMs = r.startedAt
    ? Date.now() - new Date(r.startedAt).getTime()
    : null;

  db.update(agentRuns)
    .set({
      status,
      completedAt: new Date().toISOString(),
      durationMs,
      errorMessage: errorMessage || null,
    })
    .where(eq(agentRuns.id, r.id))
    .run();

  return Promise.resolve();
}

export function touchAgentRunReport(
  ticketId: number,
  personaId: string
): Promise<void> {
  // Update lastReportAt on the active run
  const run = db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.ticketId, ticketId),
        eq(agentRuns.personaId, personaId),
        eq(agentRuns.status, "running")
      )
    )
    .orderBy(desc(agentRuns.startedAt))
    .limit(1)
    .all();

  if (run.length > 0) {
    db.update(agentRuns)
      .set({ lastReportAt: new Date().toISOString() })
      .where(eq(agentRuns.id, run[0].id))
      .run();
  }

  return Promise.resolve();
}

interface AgentRunWithContext {
  id: number;
  ticketId: number;
  ticketTitle: string | null;
  personaId: string;
  personaName: string | null;
  personaColor: string | null;
  personaAvatar: string | null;
  personaRole: string | null;
  phase: string;
  status: string;
  tools: string | null;
  dispatchSource: string | null;
  startedAt: string | null;
  lastReportAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export function getAgentRuns(limit: number = 50, projectId?: number): Promise<AgentRunWithContext[]> {
  // First, mark stale runs (>30 min) as timeout
  const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();
  db.update(agentRuns)
    .set({
      status: "timeout",
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(agentRuns.status, "running"),
        sql`${agentRuns.startedAt} < ${cutoff}`
      )
    )
    .run();

  const projectFilter = projectId ? sql`AND t.project_id = ${projectId}` : sql``;

  // Return runs joined with persona + ticket info
  const rows = db.all(sql`
    SELECT
      ar.id,
      ar.ticket_id as ticketId,
      t.title as ticketTitle,
      ar.persona_id as personaId,
      p.name as personaName,
      p.color as personaColor,
      p.avatar as personaAvatar,
      p.role as personaRole,
      ar.phase,
      ar.status,
      ar.tools,
      ar.dispatch_source as dispatchSource,
      ar.started_at as startedAt,
      ar.last_report_at as lastReportAt,
      ar.completed_at as completedAt,
      ar.duration_ms as durationMs,
      ar.error_message as errorMessage
    FROM agent_runs ar
    LEFT JOIN personas p ON p.id = ar.persona_id
    LEFT JOIN tickets t ON t.id = ar.ticket_id
    WHERE 1=1 ${projectFilter}
    ORDER BY ar.started_at DESC
    LIMIT ${limit}
  `) as AgentRunWithContext[];

  return asAsync(rows);
}
