import { NextResponse } from "next/server";
import { formatTicketSlug } from "@/types";
import { getTicketById, getProjectById } from "@/db/data";
import { spawn, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";

const BONSAI_DIR = path.join(process.env.HOME || "~", ".bonsai");
const PROJECTS_DIR = path.join(process.env.HOME || "~", "development", "bonsai", "projects");
const WORKTREES_DIR = path.join(BONSAI_DIR, "worktrees");

function resolveWorkspace(
  project: { githubRepo: string | null; slug: string; localPath: string | null },
  ticketId: number
): string {
  // Check for existing worktree first
  const slug = project.slug || project.githubRepo || "unknown";
  const ticketSlug = formatTicketSlug(ticketId);
  const worktreePath = path.join(WORKTREES_DIR, slug, ticketSlug);
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
  const { id } = await params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId ? await getProjectById(ticket.projectId) : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const workspace = resolveWorkspace(project, ticketId);
  if (!fs.existsSync(workspace)) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Derive a stable port from project ID (3100–3199 range)
  const port = 3100 + (project.id % 100);

  // Use the requesting host so URLs work from LAN devices (phone, etc.)
  const reqHost = new URL(req.url).hostname;
  const host = reqHost === "0.0.0.0" ? "localhost" : reqHost;

  // Check if dev server is already running on this port
  const inUse = await isPortInUse(port);
  if (inUse) {
    return NextResponse.json({ url: `http://${host}:${port}`, alreadyRunning: true });
  }

  // Detect project type and start dev server
  const pkgPath = path.join(workspace, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return NextResponse.json({ error: "No package.json found in workspace" }, { status: 400 });
  }

  // Spawn dev server in background
  const ticketSlug = formatTicketSlug(ticketId);
  const logFile = path.join(BONSAI_DIR, "sessions", `preview-${ticketSlug}.log`);
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  // Copy env files from main repo into worktree so builds have DB credentials, etc.
  const mainRepo = project.localPath || path.join(PROJECTS_DIR, project.githubRepo || project.slug);
  if (workspace !== mainRepo && fs.existsSync(mainRepo)) {
    for (const envFile of [".env", ".env.local", ".env.development", ".env.development.local"]) {
      const src = path.join(mainRepo, envFile);
      const dst = path.join(workspace, envFile);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }
  }

  // Load workspace env files into envVars so build commands (drizzle-kit, etc.) see them
  const envVars: Record<string, string> = { ...process.env, PORT: String(port) } as Record<string, string>;
  for (const envFile of [".env", ".env.local"]) {
    const envPath = path.join(workspace, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          envVars[key] = val;
        }
      }
    }
  }

  // Run build command synchronously before starting the dev server
  if (project.buildCommand) {
    console.log(`[preview] Running build command for ${ticketId}: ${project.buildCommand}`);
    try {
      execSync(project.buildCommand, {
        cwd: workspace,
        timeout: 120_000,
        env: envVars as NodeJS.ProcessEnv,
        stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
      });
    } catch (buildErr) {
      console.error(`[preview] Build command failed for ${ticketId}:`, buildErr);
      return NextResponse.json({ error: "Build command failed" }, { status: 500 });
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
    args = parts.slice(1);
  } else {
    cmd = "npm";
    args = ["run", "dev", "--", "--port", String(port), "--hostname", "0.0.0.0"];
  }

  const child = spawn(cmd, args, {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, err],
    env: envVars as NodeJS.ProcessEnv,
  });
  child.unref();

  console.log(`[preview] Started dev server for ${ticketId} on port ${port} (pid ${child.pid})`);

  return NextResponse.json({ url: `http://${host}:${port}`, pid: child.pid, port });
}
