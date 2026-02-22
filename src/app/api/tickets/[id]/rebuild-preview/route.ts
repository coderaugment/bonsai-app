import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getProjectById } from "@/db/data/projects";
import { getWorktreePath } from "@/lib/worktree-paths";
import { spawn, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

// POST /api/tickets/[id]/rebuild-preview — rebuild and restart dev server
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (!ticket.projectId) {
    return NextResponse.json({ error: "Ticket has no project" }, { status: 400 });
  }

  const project = await getProjectById(ticket.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const worktreePath = getWorktreePath(project.localPath, ticket.id);

  if (!fs.existsSync(worktreePath)) {
    return NextResponse.json({ error: "Worktree not found" }, { status: 404 });
  }

  // Use ticket ID for port allocation (4000-4999 range)
  const port = 4000 + (ticketId % 1000);

  // Kill any existing process on this port
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // No process running on this port, that's fine
  }

  // Wait a moment for the port to be released
  await new Promise(resolve => setTimeout(resolve, 500));

  // Clean build cache
  const nextDir = path.join(worktreePath, ".next");
  if (fs.existsSync(nextDir)) {
    console.log(`[rebuild-preview] Cleaning .next folder for ticket ${ticketId}`);
    fs.rmSync(nextDir, { recursive: true, force: true });
  }

  const logDir = path.join(project.localPath, ".bonsai-logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `preview-ticket-${ticketId}.log`);

  const envVars = { ...process.env, PORT: String(port) };

  // Run build command if specified (synchronously)
  if (project.buildCommand) {
    console.log(`[rebuild-preview] Running build command for ticket ${ticketId}: ${project.buildCommand}`);
    try {
      execSync(project.buildCommand, {
        cwd: worktreePath,
        timeout: 120_000,
        env: envVars,
        stdio: [null, fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
      });
    } catch {
      let details = "";
      try {
        const lines = fs.readFileSync(logFile, "utf-8").trim().split("\n");
        details = lines.slice(-10).join("\n");
      } catch {}
      return NextResponse.json({ error: "Build failed", details }, { status: 500 });
    }
  }

  // Run command must be set in project settings
  if (!project.runCommand) {
    return NextResponse.json({
      error: "No run command configured",
      details: "Project must have runCommand set in database settings"
    }, { status: 400 });
  }

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  // Use project's run command with PORT substitution
  const expanded = project.runCommand.replace(/\{\{PORT\}\}/g, String(port));
  const parts = expanded.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const child = spawn(cmd, args, {
    cwd: worktreePath,
    detached: true,
    stdio: ["ignore", out, err],
    env: envVars,
  });
  child.unref();

  console.log(`[rebuild-preview] Rebuilt and restarted dev server for ticket ${ticketId} on port ${port} (pid ${child.pid})`);

  return NextResponse.json({
    success: true,
    url: `http://localhost:${port}`,
    pid: child.pid,
    port
  });
}
