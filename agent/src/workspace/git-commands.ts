/**
 * Git command wrappers for workspace management.
 * All git operations go through the queue to prevent concurrent access issues.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitQueue } from "./git-queue.js";

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a git command with timeout and error handling.
 */
async function execGit(
  args: string[],
  cwd: string,
  timeout = 30_000
): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout,
      maxBuffer: 512 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      exitCode: e.code ?? 1,
    };
  }
}

// ============================================================================
// Shared operations (require queue)
// ============================================================================

export async function gitFetch(projectPath: string): Promise<void> {
  await gitQueue.shared(projectPath, async () => {
    const result = await execGit(["fetch", "origin"], projectPath);
    if (result.exitCode !== 0) {
      throw new Error(`git fetch failed: ${result.stderr}`);
    }
  });
}

export async function gitCreateBranch(
  projectPath: string,
  branchName: string,
  startPoint: string
): Promise<void> {
  await gitQueue.shared(projectPath, async () => {
    const result = await execGit(
      ["branch", branchName, startPoint],
      projectPath
    );
    if (result.exitCode !== 0) {
      throw new Error(`git branch failed: ${result.stderr}`);
    }
  });
}

export async function gitWorktreeAdd(
  projectPath: string,
  worktreePath: string,
  branchName: string
): Promise<void> {
  await gitQueue.shared(projectPath, async () => {
    const result = await execGit(
      ["worktree", "add", worktreePath, branchName],
      projectPath
    );
    if (result.exitCode !== 0) {
      throw new Error(`git worktree add failed: ${result.stderr}`);
    }
  });
}

export async function gitWorktreeRemove(
  projectPath: string,
  worktreePath: string
): Promise<void> {
  await gitQueue.shared(projectPath, async () => {
    const result = await execGit(
      ["worktree", "remove", "--force", worktreePath],
      projectPath
    );
    if (result.exitCode !== 0) {
      throw new Error(`git worktree remove failed: ${result.stderr}`);
    }
  });
}

export async function gitDeleteBranch(
  projectPath: string,
  branchName: string
): Promise<void> {
  await gitQueue.shared(projectPath, async () => {
    const result = await execGit(["branch", "-D", branchName], projectPath);
    if (result.exitCode !== 0) {
      throw new Error(`git branch delete failed: ${result.stderr}`);
    }
  });
}

export async function gitConfigUser(
  worktreePath: string,
  name: string,
  email: string
): Promise<void> {
  await gitQueue.shared(worktreePath, async () => {
    await execGit(["config", "user.name", name], worktreePath);
    await execGit(["config", "user.email", email], worktreePath);
  });
}

// ============================================================================
// Local operations (no queue needed)
// ============================================================================

export async function gitBranchExists(
  projectPath: string,
  branchName: string
): Promise<boolean> {
  return gitQueue.local(async () => {
    const result = await execGit(
      ["rev-parse", "--verify", branchName],
      projectPath
    );
    return result.exitCode === 0;
  });
}

export async function gitGetRemote(projectPath: string): Promise<string> {
  return gitQueue.local(async () => {
    const result = await execGit(
      ["config", "--get", "remote.origin.url"],
      projectPath
    );
    if (result.exitCode !== 0) {
      throw new Error("No remote.origin.url configured");
    }
    return result.stdout.trim();
  });
}

export async function gitGetCurrentBranch(cwd: string): Promise<string> {
  return gitQueue.local(async () => {
    const result = await execGit(["branch", "--show-current"], cwd);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${result.stderr}`);
    }
    return result.stdout.trim();
  });
}
