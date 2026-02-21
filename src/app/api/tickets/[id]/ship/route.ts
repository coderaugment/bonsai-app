import { NextResponse } from "next/server";
import { formatTicketSlug } from "@/types";
import { getTicketById, getProjectById, updateTicket, logAuditEvent } from "@/db/data";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const HOME = process.env.HOME || "~";
const PROJECTS_DIR = path.join(HOME, "development", "bonsai", "projects");

function resolveProjectRoot(project: { githubRepo: string | null; slug: string; localPath: string | null }): string {
  if (project.localPath) return project.localPath;
  return path.join(PROJECTS_DIR, project.githubRepo || project.slug);
}

function resolveMainRepo(project: { githubRepo: string | null; slug: string; localPath: string | null }): string {
  if (project.localPath) return path.join(project.localPath, "repo");
  const projectRoot = path.join(PROJECTS_DIR, project.githubRepo || project.slug);
  return path.join(projectRoot, "repo");
}

const gitOpts = (cwd: string) => ({
  cwd,
  encoding: "utf-8" as const,
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
});

// POST /api/tickets/[id]/ship — merge worktree branch into main, clean up
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const ticketSlug = formatTicketSlug(ticketId);

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const project = ticket.projectId ? await getProjectById(ticket.projectId) : null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const mainRepo = resolveMainRepo(project);
  const projectRoot = resolveProjectRoot(project);
  const worktreePath = path.join(projectRoot, "worktrees", ticketSlug);
  const branchName = `ticket/${ticketSlug}`;

  if (!fs.existsSync(mainRepo)) {
    return NextResponse.json({ error: "Main repo not found" }, { status: 400 });
  }

  let mergeCommit: string | null = null;
  const log: string[] = [];

  try {
    // Check if this worktree has been corrupted
    const worktreeGitPath = path.join(worktreePath, ".git");
    const worktreeExists = fs.existsSync(worktreePath);
    let isCorruptedWorktree = false;
    if (worktreeExists && fs.existsSync(worktreeGitPath)) {
      const stat = fs.statSync(worktreeGitPath);
      if (stat.isDirectory()) {
        // .git is a directory — corrupted by git init (e.g. create-next-app)
        isCorruptedWorktree = true;
      } else if (stat.isFile()) {
        // .git is a file (normal worktree) — check if the gitdir target exists
        const content = fs.readFileSync(worktreeGitPath, "utf-8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match && !fs.existsSync(match[1])) {
          // gitdir points to a missing path (e.g. project was renamed)
          isCorruptedWorktree = true;
        }
      }
    }

    if (isCorruptedWorktree) {
      // Worktree was corrupted by git init (e.g. create-next-app).
      // The code lives in the worktree dir but it's a standalone repo.
      // Strategy: commit any uncommitted work there, then copy files into main repo.
      log.push("Detected corrupted worktree (standalone .git). Recovering via file copy.");

      // Commit any uncommitted work in the corrupted worktree
      try {
        execFileSync("git", ["add", "-A"], gitOpts(worktreePath));
        const status = execFileSync("git", ["status", "--porcelain"], gitOpts(worktreePath)).trim();
        if (status) {
          execFileSync("git", ["commit", "-m", `ship ${ticketSlug}: commit before merge`], gitOpts(worktreePath));
          log.push("Committed uncommitted work in corrupted worktree.");
        }
      } catch {
        log.push("No changes to commit in corrupted worktree.");
      }

      // Copy all files (except .git) from worktree into main repo
      const entries = fs.readdirSync(worktreePath);
      for (const entry of entries) {
        if (entry === ".git") continue;
        const src = path.join(worktreePath, entry);
        const dst = path.join(mainRepo, entry);
        execFileSync("cp", ["-R", src, dst]);
      }
      log.push("Copied files from worktree to main repo.");

      // Commit in main repo
      execFileSync("git", ["add", "-A"], gitOpts(mainRepo));
      const mainStatus = execFileSync("git", ["status", "--porcelain"], gitOpts(mainRepo)).trim();
      if (mainStatus) {
        execFileSync("git", ["commit", "-m", `merge ${ticketSlug}: ${ticket.title}`], gitOpts(mainRepo));
        log.push("Committed merged code on main.");
      } else {
        log.push("No new changes to commit on main (already up to date).");
      }

      mergeCommit = execFileSync("git", ["rev-parse", "HEAD"], gitOpts(mainRepo)).trim();

      // Remove the corrupted worktree directory
      fs.rmSync(worktreePath, { recursive: true, force: true });
      log.push("Removed corrupted worktree directory.");

    } else if (worktreeExists) {
      // Normal worktree — commit uncommitted work, then merge branch into main
      log.push("Normal worktree detected. Merging branch into main.");

      // Commit any uncommitted work
      try {
        execFileSync("git", ["add", "-A"], gitOpts(worktreePath));
        const status = execFileSync("git", ["status", "--porcelain"], gitOpts(worktreePath)).trim();
        if (status) {
          execFileSync("git", ["commit", "-m", `ship ${ticketSlug}: commit before merge`], gitOpts(worktreePath));
          log.push("Committed uncommitted work in worktree.");
        }
      } catch {
        log.push("No changes to commit in worktree.");
      }

      // Remove worktree first (git requires this before merging the branch)
      execFileSync("git", ["worktree", "remove", worktreePath, "--force"], gitOpts(mainRepo));
      log.push("Removed worktree.");

      // Commit any uncommitted changes in main repo before merging
      try {
        execFileSync("git", ["add", "-A"], gitOpts(mainRepo));
        const mainStatus = execFileSync("git", ["status", "--porcelain"], gitOpts(mainRepo)).trim();
        if (mainStatus) {
          execFileSync("git", ["commit", "-m", `auto-commit before merging ${ticketSlug}`], gitOpts(mainRepo));
          log.push("Committed uncommitted work in main repo.");
        }
      } catch {
        log.push("No changes to commit in main repo.");
      }

      // Merge branch into main
      try {
        execFileSync("git", ["merge", branchName, "--no-ff", "-m", `merge ${ticketSlug}: ${ticket.title}`], gitOpts(mainRepo));
        log.push("Merged branch into main.");
      } catch {
        // Try fast-forward if --no-ff fails
        try {
          execFileSync("git", ["merge", branchName], gitOpts(mainRepo));
          log.push("Fast-forward merged branch into main.");
        } catch (mergeErr: unknown) {
          const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
          log.push(`Merge failed: ${msg.slice(0, 200)}`);
          return NextResponse.json({ error: "Merge failed", log }, { status: 500 });
        }
      }

      mergeCommit = execFileSync("git", ["rev-parse", "HEAD"], gitOpts(mainRepo)).trim();

      // Delete the branch
      try {
        execFileSync("git", ["branch", "-d", branchName], gitOpts(mainRepo));
        log.push(`Deleted branch ${branchName}.`);
      } catch {
        log.push(`Could not delete branch ${branchName} (may already be deleted).`);
      }

    } else {
      // No worktree exists — just check if the branch exists and merge it
      log.push("No worktree found. Checking for branch.");
      try {
        // Commit any uncommitted changes in main repo before merging
        execFileSync("git", ["add", "-A"], gitOpts(mainRepo));
        const mainStatus = execFileSync("git", ["status", "--porcelain"], gitOpts(mainRepo)).trim();
        if (mainStatus) {
          execFileSync("git", ["commit", "-m", `auto-commit before merging ${ticketSlug}`], gitOpts(mainRepo));
          log.push("Committed uncommitted work in main repo.");
        }

        execFileSync("git", ["rev-parse", "--verify", branchName], gitOpts(mainRepo));
        execFileSync("git", ["merge", branchName, "-m", `merge ${ticketSlug}: ${ticket.title}`], gitOpts(mainRepo));
        mergeCommit = execFileSync("git", ["rev-parse", "HEAD"], gitOpts(mainRepo)).trim();
        execFileSync("git", ["branch", "-d", branchName], gitOpts(mainRepo));
        log.push("Merged and deleted branch.");
      } catch {
        log.push("No branch to merge — ticket may not have had a worktree.");
      }
    }

    // Push main to origin so remote stays in sync
    try {
      execFileSync("git", ["push", "origin", "main"], gitOpts(mainRepo));
      log.push("Pushed main to origin.");
    } catch {
      log.push("Could not push to origin (may need manual push).");
    }

    // Update ticket DB
    await updateTicket(ticketId, { state: "shipped", mergedAt: new Date().toISOString(), mergeCommit });

    log.push("Ticket state set to shipped.");

    await logAuditEvent({
      ticketId,
      event: "ticket_shipped",
      actorType: "human",
      actorName: "System",
      detail: mergeCommit ? `Shipped — merged as ${mergeCommit.slice(0, 8)}` : "Shipped",
      metadata: { mergeCommit },
    });

    return NextResponse.json({ ok: true, mergeCommit, log });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ship] Error shipping ${ticketSlug}:`, msg);
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}
