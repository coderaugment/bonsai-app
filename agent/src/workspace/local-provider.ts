/**
 * LocalWorkspaceProvider — manages git worktrees for ticket isolation.
 *
 * Each ticket gets its own worktree in .worktrees/{ticketId}/ on branch ticket/{ticketId}.
 * This allows multiple agents to work on different tickets in parallel without conflicts.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import type { WorkspaceProvider, Workspace } from "./provider.js";
import { LocalToolExecutor } from "../tools/local-executor.js";
import {
  gitFetch,
  gitCreateBranch,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitDeleteBranch,
  gitBranchExists,
  gitGetRemote,
  gitGetCurrentBranch,
  gitConfigUser,
} from "./git-commands.js";

export interface LocalWorkspaceProviderConfig {
  /** Base directory for all projects (default: ~/.bonsai/projects) */
  basePath?: string;
}

export class LocalWorkspaceProvider implements WorkspaceProvider {
  private basePath: string;

  constructor(config: LocalWorkspaceProviderConfig = {}) {
    this.basePath =
      config.basePath ?? path.join(os.homedir(), ".bonsai", "projects");
  }

  /**
   * Resolve workspace for a project and optional ticket.
   * If ticketId is provided, creates/returns ticket worktree.
   * If no ticketId, returns main worktree.
   */
  async resolve(projectId: string, ticketId?: string): Promise<Workspace> {
    const projectPath = this.getProjectPath(projectId);
    const repoPath = path.join(projectPath, "repo");

    // Verify project repository directory exists
    await this.ensureProjectExists(repoPath);

    const remote = await gitGetRemote(repoPath);

    // No ticketId → return main worktree
    if (!ticketId) {
      const branch = await gitGetCurrentBranch(repoPath);
      return {
        projectId,
        rootPath: repoPath,
        executor: new LocalToolExecutor(repoPath),
        branch,
        remote,
      };
    }

    // ticketId provided → create/return ticket worktree
    const worktreePath = this.getWorktreePath(projectPath, ticketId);
    const branchName = this.getBranchName(ticketId);

    // Check if worktree already exists
    const worktreeExists = await this.worktreeExists(worktreePath);

    if (!worktreeExists) {
      await this.createWorktree(repoPath, ticketId, worktreePath, branchName);
    }

    return {
      projectId,
      ticketId,
      rootPath: repoPath,
      worktreePath,
      executor: new LocalToolExecutor(worktreePath),
      branch: branchName,
      remote,
    };
  }

  /**
   * Cleanup worktree and branch for a ticket.
   */
  async cleanup(projectId: string, ticketId?: string): Promise<void> {
    if (!ticketId) {
      // No ticketId → nothing to clean up for main worktree
      return;
    }

    const projectPath = this.getProjectPath(projectId);
    const repoPath = path.join(projectPath, "repo");
    const worktreePath = this.getWorktreePath(projectPath, ticketId);
    const branchName = this.getBranchName(ticketId);

    // Remove worktree if it exists
    const exists = await this.worktreeExists(worktreePath);
    if (exists) {
      await gitWorktreeRemove(repoPath, worktreePath);
    }

    // Delete branch if it exists
    const branchExists = await gitBranchExists(repoPath, branchName);
    if (branchExists) {
      await gitDeleteBranch(repoPath, branchName);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private getProjectPath(projectId: string): string {
    return path.join(this.basePath, projectId);
  }

  private getWorktreePath(projectPath: string, ticketId: string): string {
    return path.join(projectPath, "worktrees", ticketId);
  }

  private getBranchName(ticketId: string): string {
    return `ticket/${ticketId}`;
  }

  private async ensureProjectExists(repoPath: string): Promise<void> {
    // CRITICAL VERIFICATION: Ensure repo/ directory exists
    try {
      await fs.access(repoPath);
    } catch {
      const projectPath = path.dirname(repoPath);
      throw new Error(
        `FATAL: Project structure violation - repo/ directory missing at ${repoPath}. ` +
        `Expected structure: ${projectPath}/repo/ (git repository) and ${projectPath}/worktrees/ (ticket worktrees). ` +
        `Clone repository using the project creation API.`
      );
    }

    // Verify it's a git repository
    const gitDir = path.join(repoPath, ".git");
    try {
      await fs.access(gitDir);
    } catch {
      throw new Error(
        `FATAL: Project structure violation - repo/ is not a git repository at ${repoPath}. ` +
        `The repo/ directory MUST contain a valid git repository with .git/ directory.`
      );
    }
  }

  private async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  private async createWorktree(
    projectPath: string,
    ticketId: string,
    worktreePath: string,
    branchName: string
  ): Promise<void> {
    // 1. Fetch latest from origin
    await gitFetch(projectPath);

    // 2. Create branch from origin/main (delete if exists)
    const branchExists = await gitBranchExists(projectPath, branchName);
    if (branchExists) {
      await gitDeleteBranch(projectPath, branchName);
    }
    await gitCreateBranch(projectPath, branchName, "origin/main");

    // 3. Create worktree
    await gitWorktreeAdd(projectPath, worktreePath, branchName);

    // 4. Configure git user identity in worktree
    const agentName = `${ticketId} Agent`;
    const agentEmail = `${ticketId}@bonsai.local`;
    await gitConfigUser(worktreePath, agentName, agentEmail);
  }
}
