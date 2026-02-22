import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getProjectById } from "@/db/data/projects";
import { getWorktreePath } from "@/lib/worktree-paths";
import { spawn, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";

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

  if (!ticket.projectId) {
    return NextResponse.json({ error: "Ticket has no project" }, { status: 400 });
  }

  const project = await getProjectById(ticket.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Get worktree path from centralized utility
  const worktreePath = getWorktreePath(project.localPath, ticket.id);

  // If worktree doesn't exist, create it now
  if (!fs.existsSync(worktreePath)) {
    const mainRepo = project.localPath;
    const gitDir = path.join(mainRepo, ".git");

    if (!fs.existsSync(gitDir)) {
      return NextResponse.json({
        error: "Not a git repository",
        details: `${mainRepo} is not a git repository. Cannot create worktree.`
      }, { status: 400 });
    }

    try {
      // Create worktrees directory structure
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

      const branchName = `ticket/${ticket.id}`;

      // Check if branch exists, create if not
      try {
        execSync(`git rev-parse --verify ${branchName}`, { cwd: mainRepo, stdio: "ignore" });
      } catch {
        execSync(`git branch ${branchName}`, { cwd: mainRepo });
      }

      // Create worktree
      execSync(`git worktree add "${worktreePath}" ${branchName}`, { cwd: mainRepo });

      // Copy env files from main repo
      for (const envFile of [".env", ".env.local", ".env.development", ".env.development.local"]) {
        const src = path.join(mainRepo, envFile);
        const dst = path.join(worktreePath, envFile);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
        }
      }

      // Copy node_modules from main repo (don't symlink - causes React context issues)
      const mainNodeModules = path.join(mainRepo, "node_modules");
      const worktreeNodeModules = path.join(worktreePath, "node_modules");

      if (fs.existsSync(mainNodeModules) && !fs.existsSync(worktreeNodeModules)) {
        console.log(`[ticket-preview] Copying node_modules for ticket ${ticket.id}...`);
        try {
          execSync(`cp -R "${mainNodeModules}" "${worktreeNodeModules}"`, { stdio: "inherit" });
        } catch (error) {
          console.error(`[ticket-preview] Failed to copy node_modules:`, error);
          return NextResponse.json({
            error: "Failed to copy node_modules",
            details: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }

      // NOTE: We don't symlink the agent directory for dogfooding anymore
      // because Turbopack refuses to follow symlinks outside the project root.
      // The @bonsai/agent package is already available via node_modules symlink.

      console.log(`[ticket-preview] Created worktree for ticket ${ticket.id} at ${worktreePath}`);
    } catch (error) {
      return NextResponse.json({
        error: "Failed to create worktree",
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
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

  // Spawn dev server in worktree - store logs in project .bonsai-logs directory
  const logDir = path.join(project.localPath, ".bonsai-logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `preview-ticket-${ticketId}.log`);

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

  console.log(`[ticket-preview] Started dev server for ticket ${ticketId} in worktree on port ${port} (pid ${child.pid})`);

  return NextResponse.json({
    url: `http://${host}:${port}`,
    pid: child.pid,
    port,
    worktreePath
  });
}
