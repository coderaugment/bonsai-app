import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { LocalToolExecutor } from "./local-executor.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("LocalToolExecutor - Path Validation", () => {
  let executor: LocalToolExecutor;
  let workspace: string;

  beforeEach(async () => {
    // Create temp workspace
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bonsai-test-"));
    executor = new LocalToolExecutor(workspace);

    // Create test structure
    await fs.mkdir(path.join(workspace, "src"), { recursive: true });
    await fs.writeFile(path.join(workspace, "src", "index.ts"), "export {}");
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(workspace, { recursive: true, force: true });
  });

  test("allows paths within workspace", async () => {
    const content = await executor.readFile("src/index.ts");
    expect(content).toBe("export {}");
  });

  test("blocks parent directory traversal", async () => {
    await expect(executor.readFile("../etc/passwd")).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("blocks absolute paths outside workspace", async () => {
    await expect(executor.readFile("/etc/passwd")).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("blocks symlinks pointing outside workspace", async () => {
    // Create symlink to /etc/passwd
    const linkPath = path.join(workspace, "evil-link");
    await fs.symlink("/etc/passwd", linkPath);

    await expect(executor.readFile("evil-link")).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("allows symlinks pointing within workspace", async () => {
    // Create symlink to src/index.ts
    const linkPath = path.join(workspace, "good-link");
    await fs.symlink(path.join(workspace, "src", "index.ts"), linkPath);

    const content = await executor.readFile("good-link");
    expect(content).toBe("export {}");
  });

  test("handles non-existent paths", async () => {
    // Should allow validation of non-existent paths for writeFile
    await expect(
      executor.writeFile("new-file.ts", "content")
    ).resolves.toBeUndefined();
  });

  test("handles empty paths", async () => {
    await expect(executor.readFile("")).rejects.toThrow(
      "Path must be a non-empty string"
    );
  });

  test("handles whitespace paths", async () => {
    await expect(executor.readFile("   ")).rejects.toThrow(
      "Path cannot be empty"
    );
  });

  test("normalizes path separators", async () => {
    await expect(executor.readFile("./src//index.ts")).resolves.toBe(
      "export {}"
    );
  });

  test("blocks path with multiple parent traversals", async () => {
    await expect(executor.readFile("../../etc/passwd")).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("blocks path traversal from subdirectory", async () => {
    await expect(executor.readFile("src/../../etc/passwd")).rejects.toThrow(
      "Path escapes workspace"
    );
  });
});

describe("LocalToolExecutor - Command Execution", () => {
  let executor: LocalToolExecutor;
  let workspace: string;
  let canonicalWorkspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bonsai-test-"));
    // Resolve to canonical path for comparison (handles /tmp -> /private/tmp on macOS)
    canonicalWorkspace = await fs.realpath(workspace);
    executor = new LocalToolExecutor(workspace);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  test("executes commands within workspace", async () => {
    const result = await executor.run("pwd", [], { cwd: "." });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(canonicalWorkspace);
  });

  test("respects timeout parameter", async () => {
    const result = await executor.run("sleep", ["10"], {
      cwd: ".",
      timeout: 100,
    });
    // Timeout should result in non-zero exit code
    expect(result.exitCode).not.toBe(0);
  }, 10000);

  test("respects custom environment variables", async () => {
    const result = await executor.run("printenv", ["TEST_VAR"], {
      cwd: ".",
      env: { TEST_VAR: "test-value" },
    });
    expect(result.stdout.trim()).toBe("test-value");
  });

  test("captures stdout on success", async () => {
    const result = await executor.run("echo", ["hello"], { cwd: "." });
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  test("captures stderr on failure", async () => {
    const result = await executor.run("ls", ["nonexistent-file"], {
      cwd: ".",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("nonexistent-file");
  });

  test("blocks cwd outside workspace", async () => {
    await expect(executor.run("pwd", [], { cwd: "../" })).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("returns exit code for failed commands", async () => {
    const result = await executor.run("false", [], { cwd: "." });
    expect(result.exitCode).not.toBe(0);
  });
});

describe("LocalToolExecutor - File Operations", () => {
  let executor: LocalToolExecutor;
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "bonsai-test-"));
    executor = new LocalToolExecutor(workspace);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  test("reads files within workspace", async () => {
    await fs.writeFile(path.join(workspace, "test.txt"), "content");
    const content = await executor.readFile("test.txt");
    expect(content).toBe("content");
  });

  test("writes files within workspace", async () => {
    await executor.writeFile("new.txt", "data");
    const content = await fs.readFile(path.join(workspace, "new.txt"), "utf-8");
    expect(content).toBe("data");
  });

  test("creates parent directories", async () => {
    await executor.writeFile("deep/nested/file.txt", "data");
    const content = await fs.readFile(
      path.join(workspace, "deep", "nested", "file.txt"),
      "utf-8"
    );
    expect(content).toBe("data");
  });

  test("lists directory contents", async () => {
    await fs.writeFile(path.join(workspace, "file1.txt"), "");
    await fs.writeFile(path.join(workspace, "file2.txt"), "");

    const files = await executor.listFiles(".");
    expect(files).toContain("file1.txt");
    expect(files).toContain("file2.txt");
  });

  test("checks file existence", async () => {
    await fs.writeFile(path.join(workspace, "exists.txt"), "");

    expect(await executor.fileExists("exists.txt")).toBe(true);
    expect(await executor.fileExists("missing.txt")).toBe(false);
  });

  test("blocks writing outside workspace", async () => {
    await expect(
      executor.writeFile("../../../tmp/evil.txt", "data")
    ).rejects.toThrow("Path escapes workspace");
  });

  test("blocks reading via symlink outside workspace", async () => {
    const linkPath = path.join(workspace, "evil-link");
    await fs.symlink("/etc", linkPath);

    await expect(executor.readFile("evil-link")).rejects.toThrow(
      "Path escapes workspace"
    );
  });

  test("lists directories with trailing slash", async () => {
    await fs.mkdir(path.join(workspace, "subdir"), { recursive: true });
    await fs.writeFile(path.join(workspace, "file.txt"), "");

    const files = await executor.listFiles(".");
    expect(files.some((f) => f === "subdir/")).toBe(true);
    expect(files.some((f) => f === "file.txt")).toBe(true);
  });

  test("handles non-existent directory in listFiles", async () => {
    const files = await executor.listFiles("nonexistent");
    expect(files).toEqual([]);
  });

  test("blocks fileExists check outside workspace", async () => {
    await expect(executor.fileExists("../etc/passwd")).rejects.toThrow(
      "Path escapes workspace"
    );
  });
});
