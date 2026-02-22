/**
 * Per-project git operation queue.
 * Serializes git commands that touch shared .git/ directory to prevent
 * lock contention and corruption when multiple agents work on the same project.
 */

type QueuedOperation<T> = () => Promise<T>;

export class GitOperationQueue {
  private queues = new Map<string, Promise<unknown>>();

  /**
   * Run a git operation that touches shared .git/ state.
   * Operations are serialized per-project to prevent lock conflicts.
   *
   * Examples: fetch, branch, worktree add/remove, rebase
   */
  async shared<T>(projectPath: string, fn: QueuedOperation<T>): Promise<T> {
    const chain = this.queues.get(projectPath) ?? Promise.resolve();

    const next = chain.then(
      () => fn(),
      () => fn() // Run even if previous operation failed
    );

    this.queues.set(projectPath, next);

    try {
      return await next;
    } finally {
      // Clean up if this was the last operation
      if (this.queues.get(projectPath) === next) {
        this.queues.delete(projectPath);
      }
    }
  }

  /**
   * Run a git operation local to a worktree (add, status, diff).
   * These don't need serialization as they use worktree-local index.
   */
  async local<T>(fn: QueuedOperation<T>): Promise<T> {
    return fn();
  }
}

// Global singleton
export const gitQueue = new GitOperationQueue();
