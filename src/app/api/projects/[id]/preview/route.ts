import { NextResponse } from "next/server";
import { getProjectById } from "@/db/data";
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

// POST /api/projects/[id]/preview — start dev server on main branch and return URL
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await getProjectById(Number(id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const workspace = project.localPath;
  if (!workspace || !fs.existsSync(workspace)) {
    return NextResponse.json({ error: "Project local path not found" }, { status: 404 });
  }

  // Derive a stable port from project ID (3100–3199 range)
  const port = 3100 + (project.id % 100);

  // Use the requesting host so URLs work from LAN devices
  const reqHost = new URL(req.url).hostname;
  const host = reqHost === "localhost" || reqHost === "127.0.0.1" ? reqHost : reqHost;

  // Check if dev server is already running on this port
  const inUse = await isPortInUse(port);
  if (inUse) {
    return NextResponse.json({ url: `http://${host}:${port}`, alreadyRunning: true });
  }

  // Ensure package.json exists
  const pkgPath = path.join(workspace, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return NextResponse.json({ error: "No package.json found in workspace" }, { status: 400 });
  }

  // Spawn dev server in background
  const logFile = path.join(BONSAI_DIR, "sessions", `preview-project-${id}.log`);
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const envVars = { ...process.env, PORT: String(port) };

  // Run build command synchronously before starting the dev server
  if (project.buildCommand) {
    console.log(`[preview] Running build command for project ${id}: ${project.buildCommand}`);
    try {
      execSync(project.buildCommand, {
        cwd: workspace,
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
    args = parts.slice(1);
  } else {
    cmd = "npm";
    args = ["run", "dev", "--", "--port", String(port), "--hostname", "0.0.0.0"];
  }

  const child = spawn(cmd, args, {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, err],
    env: envVars,
  });
  child.unref();

  console.log(`[preview] Started dev server for project ${id} on port ${port} (pid ${child.pid})`);

  return NextResponse.json({ url: `http://${host}:${port}`, pid: child.pid, port });
}
