/**
 * Workspace management exports.
 * Provides git worktree isolation for ticket-based development.
 */

export type { WorkspaceProvider, Workspace } from "./provider.js";
export { LocalWorkspaceProvider } from "./local-provider.js";
export type { LocalWorkspaceProviderConfig } from "./local-provider.js";
export { GitOperationQueue, gitQueue } from "./git-queue.js";
export * as gitCommands from "./git-commands.js";
