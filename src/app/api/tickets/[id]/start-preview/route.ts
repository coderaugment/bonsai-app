import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getProjectById } from "@/db/data/projects";
import { spawn, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";

const BONSAI_DIR = path.join(process.env.HOME || "~", ".bonsai");

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

// POST /api/tickets/[id]/start-preview — start dev server in ticket's worktree
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = await getProjectById(ticket.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Construct worktree path (format: worktrees/tkt_ID)
  const worktreePath = path.join(project.localPath, "worktrees", `tkt_${ticket.id}`);

  if (!fs.existsSync(worktreePath)) {
    return NextResponse.json({
      error: "Worktree not found",
      details: `No worktree at ${worktreePath}. Agent may not have started work yet.`
    }, { status: 404 });
  }

  // Use ticket ID for port allocation (4000-4999 range)
  const port = 4000 + (ticketId % 1000);

  const host = "localhost";

  // Check if dev server is already running on this port
  const inUse = await isPortInUse(port);
  if (inUse) {
    return NextResponse.json({ url: `http://${host}:${port}`, alreadyRunning: true, port });
  }

  // Ensure package.json exists in worktree
  const pkgPath = path.join(worktreePath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return NextResponse.json({
      error: "No package.json in worktree",
      details: `Worktree exists but has no package.json at ${worktreePath}`
    }, { status: 400 });
  }

  // Spawn dev server in worktree
  const logFile = path.join(BONSAI_DIR, "sessions", `preview-ticket-${ticketId}.log`);
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const envVars = { ...process.env, PORT: String(port) };

  // Run build command if specified (synchronously)
  if (project.buildCommand) {
    console.log(`[ticket-preview] Running build command for ticket ${ticketId}: ${project.buildCommand}`);
    try {
      execSync(project.buildCommand, {
        cwd: worktreePath,
        timeout: 120_000,
        env: envVars,
        stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
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

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  // Parse run command or fall back to default
  let cmd: string;
  let args: string[];
  if (project.runCommand) {
    const expanded = project.runCommand.replace(/\{\{PORT\}\}/g, String(port));
    const parts = expanded.split(/\s+/);
    cmd = parts[0];
    args = parts.slice(1).concat(["--port", String(port)]);
  } else {
    cmd = "npm";
    args = ["run", "dev", "--", "--port", String(port)];
  }

  const child = spawn(cmd, args, {
    cwd: worktreePath,
    detached: true,
    stdio: ["ignore", out, err],
    env: envVars,
  });
  child.unref();

  console.log(`[ticket-preview] Started dev server for ticket ${ticketId} in worktree on port ${port} (pid ${child.pid})`);

  return NextResponse.json({
    url: `http://${host}:${port}`,
    pid: child.pid,
    port,
    worktreePath
  });
}
