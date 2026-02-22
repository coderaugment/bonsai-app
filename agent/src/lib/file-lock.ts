import * as fs from 'fs';
import * as os from 'os';

export interface LockOptions {
  staleTimeoutMs?: number; // Default 20 minutes
}

interface LockData {
  pid: number;
  timestamp: number;
  hostname: string;
}

export class FileLock {
  private readonly staleTimeoutMs: number;

  constructor(
    private readonly lockPath: string,
    options: LockOptions = {}
  ) {
    this.staleTimeoutMs = options.staleTimeoutMs ?? 20 * 60 * 1000; // 20 minutes
  }

  /**
   * Attempts to acquire the lock.
   * @returns true if lock was acquired, false if already held by another process
   */
  acquire(): boolean {
    // Check for stale lock first
    if (this.isStale()) {
      this.forceRelease();
    }

    try {
      // Atomic lock file creation using 'wx' flag (O_CREAT | O_EXCL)
      const fd = fs.openSync(this.lockPath, 'wx');
      const lockData: LockData = {
        pid: process.pid,
        timestamp: Date.now(),
        hostname: os.hostname()
      };
      fs.writeSync(fd, JSON.stringify(lockData, null, 2));
      fs.closeSync(fd);
      return true;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        return false; // Lock already held
      }
      throw err; // Other errors (permissions, disk full, etc.)
    }
  }

  /**
   * Releases the lock by deleting the lock file.
   */
  release(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err; // Only ignore "file not found"
      }
    }
  }

  /**
   * Checks if the lock file is stale (older than timeout).
   */
  private isStale(): boolean {
    try {
      const content = fs.readFileSync(this.lockPath, 'utf-8');
      const lockData: LockData = JSON.parse(content);
      const age = Date.now() - lockData.timestamp;
      return age > this.staleTimeoutMs;
    } catch {
      return false; // Can't read lock = not stale
    }
  }

  /**
   * Forcibly removes the lock file (used for stale locks).
   */
  private forceRelease(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {
      // Ignore errors - lock might not exist or be inaccessible
    }
  }
}
