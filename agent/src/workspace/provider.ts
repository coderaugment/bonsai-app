/**
 * WorkspaceProvider — resolves where a project's code lives and how to
 * run commands there.
 *
 * V1: LocalWorkspaceProvider — local directory, LocalToolExecutor
 * V2: ContainerWorkspaceProvider — Docker container, DockerToolExecutor
 */

import type { ToolExecutor } from "../tools/executor.js";

export interface Workspace {
  projectId: string;
  ticketId?: string; // Which ticket owns this workspace
  rootPath: string;
  worktreePath?: string; // Path to ticket worktree if applicable
  executor: ToolExecutor;
  branch: string;
  remote: string;
}

export interface WorkspaceProvider {
  /**
   * Resolve workspace for a project and optional ticket.
   * If ticketId is provided, creates/returns ticket worktree.
   * If no ticketId, returns main worktree.
   */
  resolve(projectId: string, ticketId?: string): Promise<Workspace>;

  /**
   * Cleanup worktree and branch for a ticket.
   * If no ticketId, no-op for main worktree.
   */
  cleanup(projectId: string, ticketId?: string): Promise<void>;
}
