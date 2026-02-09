import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";

const BONSAI_DIR = path.join(process.env.HOME || "~", ".bonsai");
const PROJECTS_DIR = path.join(process.env.HOME || "~", "development", "bonsai", "projects");
const WORKTREES_DIR = path.join(BONSAI_DIR, "worktrees");

function resolveWorkspace(
  project: { githubRepo: string | null; slug: string; localPath: string | null },
  ticketId: string
): string {
  // Check for existing worktree first
  const slug = project.slug || project.githubRepo || "unknown";
  const worktreePath = path.join(WORKTREES_DIR, slug, ticketId);
  if (fs.existsSync(worktreePath)) return worktreePath;

  // Fall back to main repo
  if (project.localPath) return project.localPath;
  return path.join(PROJECTS_DIR, project.githubRepo || project.slug);
}

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

// POST /api/tickets/[id]/preview — start dev server and return URL
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId
    ? db.select().from(projects).where(eq(projects.id, ticket.projectId)).get()
    : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const workspace = resolveWorkspace(project, ticketId);
  if (!fs.existsSync(workspace)) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Derive a stable port from project ID (3100–3199 range)
  const port = 3100 + (project.id % 100);

  // Check if dev server is already running on this port
  const inUse = await isPortInUse(port);
  if (inUse) {
    return NextResponse.json({ url: `http://localhost:${port}`, alreadyRunning: true });
  }

  // Detect project type and start dev server
  const pkgPath = path.join(workspace, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return NextResponse.json({ error: "No package.json found in workspace" }, { status: 400 });
  }

  // Spawn dev server in background
  const logFile = path.join(BONSAI_DIR, "sessions", `preview-${ticketId}.log`);
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, err],
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();

  console.log(`[preview] Started dev server for ${ticketId} on port ${port} (pid ${child.pid})`);

  return NextResponse.json({ url: `http://localhost:${port}`, pid: child.pid, port });
}
