/**
 * ClaudeCodeRunner — runs agent tasks via Claude Code CLI sessions.
 *
 * Uses `claude -p` (print mode) with the user's session auth.
 * No API key needed — piggybacks on Claude Max subscription.
 *
 * The CLI handles tool execution natively (Read, Grep, Glob, Bash).
 * Task is passed as a positional argument; system prompt via --append-system-prompt.
 *
 * Uses `exit` event (not `close`) because claude may spawn tool subprocesses
 * that inherit stdio FDs — `close` would wait for those to finish too.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentRunner,
  AgentRunParams,
  AgentRunResult,
} from "../runner.js";

export interface ClaudeCodeRunnerOptions {
  /** Path to claude CLI. Defaults to ~/.local/bin/claude. */
  cliPath?: string;
  /** Model alias. Defaults to "sonnet". */
  model?: string;
  /** Allowed tools. Defaults to read-only set. */
  allowedTools?: string[];
}

export class ClaudeCodeRunner implements AgentRunner {
  private cliPath: string;
  private model: string;
  private allowedTools: string[];

  constructor(options?: ClaudeCodeRunnerOptions) {
    this.cliPath =
      options?.cliPath ??
      path.join(process.env.HOME ?? "", ".local", "bin", "claude");
    this.model = options?.model ?? "sonnet";
    this.allowedTools = options?.allowedTools ?? [
      "Read",
      "Grep",
      "Glob",
      "Bash(git:*)",
    ];
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const {
      ticketId,
      task,
      workspace,
      systemPrompt,
      sessionDir,
      maxDurationMs,
    } = params;

    fs.mkdirSync(sessionDir, { recursive: true });

    const startTime = Date.now();

    // Write system prompt and task to files for reference
    fs.writeFileSync(path.join(sessionDir, "system-prompt.txt"), systemPrompt);
    fs.writeFileSync(path.join(sessionDir, "task.md"), task);

    // Build CLI args — task passed as positional argument (no stdin piping needed)
    const args = [
      "-p",
      "--model", this.model,
      "--allowedTools", this.allowedTools.join(","),
      "--output-format", "text",
      "--no-session-persistence",
      "--append-system-prompt", systemPrompt,
      task,  // positional argument: the prompt
    ];

    // Log the invocation
    fs.writeFileSync(
      path.join(sessionDir, "invocation.json"),
      JSON.stringify(
        {
          ticketId,
          model: this.model,
          workspace: workspace.rootPath,
          tools: this.allowedTools,
          startedAt: new Date().toISOString(),
          taskLength: task.length,
          systemPromptLength: systemPrompt.length,
        },
        null,
        2
      )
    );

    return new Promise<AgentRunResult>((resolve) => {
      const child = spawn(this.cliPath, args, {
        cwd: workspace.rootPath,
        env: { ...process.env, DISABLE_AUTOUPDATER: "1" },
        stdio: ["ignore", "pipe", "pipe"],  // no stdin needed
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let resolved = false;

      const finish = (status: string, code: number | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);

        const durationMs = Date.now() - startTime;

        // Save outputs
        if (stdout) {
          fs.writeFileSync(path.join(sessionDir, "output.md"), stdout);
        }
        if (stderr) {
          fs.writeFileSync(path.join(sessionDir, "stderr.log"), stderr);
        }

        fs.appendFileSync(
          path.join(sessionDir, "session.jsonl"),
          JSON.stringify({
            event: status,
            durationMs,
            exitCode: code,
            outputLength: stdout.length,
            stderrLength: stderr.length,
          }) + "\n"
        );

        if (timedOut) {
          resolve({
            status: "timeout",
            comments: [
              {
                content: `Agent timed out after ${Math.round(durationMs / 1000)}s`,
                type: "status",
              },
            ],
            tokensUsed: { input: 0, output: 0 },
          });
          return;
        }

        const content = stdout.trim();

        if (code !== 0 || content.length < 100) {
          resolve({
            status: "error",
            comments: [
              {
                content:
                  content.length < 100
                    ? `Output too short (${content.length} chars). stderr: ${stderr.slice(0, 200)}`
                    : stderr.slice(0, 500),
                type: "status",
              },
            ],
            tokensUsed: { input: 0, output: 0 },
          });
          return;
        }

        resolve({
          status: "completed",
          comments: [{ content, type: "completion" }],
          tokensUsed: { input: 0, output: 0 },
        });
      };

      // Timeout enforcement
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          child.kill("SIGKILL");
          finish("timeout", null);
        }, 5000);
      }, maxDurationMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Use `exit` event (not `close`) — claude spawns tool subprocesses that
      // may hold stdio FDs open; `close` waits for ALL FDs, `exit` fires when
      // the main process exits.
      child.on("exit", (code) => {
        // Give a brief moment for any last buffered data chunks
        setTimeout(() => finish(timedOut ? "timeout" : "complete", code), 200);
      });

      child.on("error", (err) => {
        fs.appendFileSync(
          path.join(sessionDir, "session.jsonl"),
          JSON.stringify({ event: "error", error: err.message }) + "\n"
        );
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            status: "error",
            comments: [{ content: err.message, type: "status" }],
            tokensUsed: { input: 0, output: 0 },
          });
        }
      });

      // Log the PID
      fs.appendFileSync(
        path.join(sessionDir, "session.jsonl"),
        JSON.stringify({ event: "spawned", pid: child.pid }) + "\n"
      );
    });
  }
}
