/**
 * ToolExecutor — the boundary between agent logic and system operations.
 *
 * All agent tool usage goes through this interface. The agent never
 * touches the filesystem or spawns processes directly.
 *
 * V1: LocalToolExecutor — runs on host, path validation
 * V2: DockerToolExecutor — runs inside container
 * V3: RemoteToolExecutor — runs on remote machine
 */

export interface RunOpts {
  cwd: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ToolExecutor {
  /** Run a command with arguments in the workspace */
  run(cmd: string, args: string[], opts: RunOpts): Promise<RunResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(pattern: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
}
