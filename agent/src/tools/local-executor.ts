/**
 * LocalToolExecutor — runs tools on the host filesystem.
 *
 * Extracted from OpenClaw's bash-tools.exec pattern.
 * All operations are scoped to the workspace rootPath.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolExecutor, RunOpts, RunResult } from "./executor.js";

const execFileAsync = promisify(execFile);

/**
 * LocalToolExecutor (V1) — Filesystem-based agent sandbox
 *
 * Security Model:
 * - All paths are validated to stay within the workspace root
 * - Symlinks are resolved to their canonical targets
 * - Path traversal attempts (../) are blocked
 * - Command execution is scoped to workspace via cwd
 * - Timeouts prevent runaway processes
 * - Buffer limits prevent memory exhaustion
 *
 * Validation Algorithm:
 * 1. Resolve input path relative to workspace root
 * 2. Resolve all symlinks using fs.realpath()
 * 3. Check canonical path starts with workspace root
 * 4. Reject if path escapes workspace boundary
 *
 * Example:
 * ```typescript
 * const executor = new LocalToolExecutor('/workspace');
 * await executor.readFile('src/index.ts');      // ✓ Allowed
 * await executor.readFile('../etc/passwd');     // ✗ Blocked
 * await executor.readFile('evil-link');         // ✗ Blocked if symlink escapes
 * ```
 *
 * Future Evolution:
 * - V2: DockerToolExecutor — container-based isolation
 * - V3: RemoteToolExecutor — remote execution via API
 */
export class LocalToolExecutor implements ToolExecutor {
  private rootPath: string;

  constructor(rootPath: string) {
    // Resolve to canonical path (resolving symlinks) for consistent comparison
    // This ensures that on macOS /tmp resolves to /private/tmp consistently
    try {
      this.rootPath = fs.realpathSync(path.resolve(rootPath));
    } catch {
      // If path doesn't exist yet, use resolved absolute path
      this.rootPath = path.resolve(rootPath);
    }
  }

  /**
   * Validates that a path stays within the workspace boundary.
   *
   * Resolves symlinks to prevent escape via symbolic links.
   * Handles non-existent paths by validating parent directory chain.
   *
   * @throws {Error} if path escapes workspace
   */
  private async guardPath(relativePath: string): Promise<string> {
    // Validate input
    if (!relativePath || typeof relativePath !== "string") {
      throw new Error("Path must be a non-empty string");
    }

    const trimmed = relativePath.trim();
    if (trimmed === "") {
      throw new Error("Path cannot be empty or whitespace");
    }

    const resolved = path.resolve(this.rootPath, trimmed);

    let canonical: string;
    try {
      canonical = await fs.promises.realpath(resolved);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // File doesn't exist yet — validate parent directory chain
        const parent = path.dirname(resolved);
        try {
          const parentCanonical = await fs.promises.realpath(parent);
          if (
            !parentCanonical.startsWith(this.rootPath + path.sep) &&
            parentCanonical !== this.rootPath
          ) {
            throw new Error(`Path escapes workspace: ${trimmed}`);
          }
          canonical = path.join(parentCanonical, path.basename(resolved));
        } catch (parentErr: any) {
          if (parentErr.code === "ENOENT") {
            // Parent doesn't exist either — validate the resolved path directly
            if (
              !resolved.startsWith(this.rootPath + path.sep) &&
              resolved !== this.rootPath
            ) {
              throw new Error(`Path escapes workspace: ${trimmed}`);
            }
            canonical = resolved;
          } else {
            throw parentErr;
          }
        }
      } else {
        throw err;
      }
    }

    // Final check: canonical path must be under workspace root
    if (
      !canonical.startsWith(this.rootPath + path.sep) &&
      canonical !== this.rootPath
    ) {
      throw new Error(
        `Path escapes workspace: ${trimmed} (resolves to ${canonical})`
      );
    }

    return canonical;
  }

  async run(cmd: string, args: string[], opts: RunOpts): Promise<RunResult> {
    const cwd = opts.cwd
      ? await this.guardPath(opts.cwd)
      : this.rootPath;

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd,
        timeout: opts.timeout ?? 30_000,
        maxBuffer: 512 * 1024,
        env: { ...process.env, ...opts.env },
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

  async readFile(filePath: string): Promise<string> {
    const resolved = await this.guardPath(filePath);
    return fs.promises.readFile(resolved, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = await this.guardPath(filePath);
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, "utf-8");
  }

  async listFiles(pattern: string): Promise<string[]> {
    // Use the workspace root as base, list matching files
    const dirPath = await this.guardPath(pattern || ".");
    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });
      return entries.map((e) =>
        e.isDirectory() ? `${e.name}/` : e.name
      );
    } catch {
      return [];
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    // guardPath() throws if path escapes — let it propagate
    const resolved = await this.guardPath(filePath);
    try {
      await fs.promises.access(resolved);
      return true;
    } catch {
      // Only catch access errors, not path validation errors
      return false;
    }
  }
}
