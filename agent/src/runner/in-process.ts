/**
 * InProcessAgentRunner — the Anthropic SDK conversation loop.
 *
 * Extracted from OpenClaw's runEmbeddedAttempt pattern.
 * Sends messages to Claude, handles tool_use blocks, executes tools
 * via the LocalToolExecutor, and loops until completion.
 *
 * Session state persists to a JSONL file for crash recovery.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentRunner,
  AgentRunParams,
  AgentRunResult,
} from "../runner.js";
import type { ToolExecutor } from "../tools/executor.js";
import { SessionStore } from "../session/store.js";

// ── Config ──────────────────────────────────────
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TOKENS = 8192;
const MAX_TURNS = 40;
const MAX_TOOL_OUTPUT = 50_000; // chars

// ── Anthropic tool definitions for the researcher ──
function buildToolSchemas(
  allowedTools: string[]
): Anthropic.Messages.Tool[] {
  const all: Record<string, Anthropic.Messages.Tool> = {
    read_file: {
      name: "read_file",
      description:
        "Read the contents of a file. Returns file content as text.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description:
              "Relative path from project root (e.g. 'src/index.ts')",
          },
        },
        required: ["path"],
      },
    },
    search_code: {
      name: "search_code",
      description:
        "Search for a regex pattern in the codebase. Returns matching lines with file paths and line numbers.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for",
          },
          glob: {
            type: "string",
            description:
              "Optional file glob filter (e.g. '*.ts', 'src/**/*.tsx')",
          },
        },
        required: ["pattern"],
      },
    },
    list_directory: {
      name: "list_directory",
      description:
        "List files and directories. Returns names with / suffix for directories.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description:
              "Relative path from project root. Use '.' for root.",
          },
        },
        required: ["path"],
      },
    },
    git_log: {
      name: "git_log",
      description:
        "Show recent git commit history. Returns commit hashes, authors, dates, and messages.",
      input_schema: {
        type: "object" as const,
        properties: {
          count: {
            type: "number",
            description: "Number of commits to show (default 20)",
          },
          path: {
            type: "string",
            description: "Optional file path to filter history",
          },
        },
        required: [],
      },
    },
    git_blame: {
      name: "git_blame",
      description:
        "Show git blame for a file — who last modified each line.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "File path to blame",
          },
        },
        required: ["path"],
      },
    },
  };

  return allowedTools
    .filter((t) => all[t] !== undefined)
    .map((t) => all[t]!);
}

// ── Tool execution ──────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  executor: ToolExecutor,
  rootPath: string
): Promise<string> {
  try {
    switch (name) {
      case "read_file": {
        const filePath = String(input.path ?? "");
        if (!filePath) {
          return "Error: read_file requires a 'path' parameter";
        }
        return await executor.readFile(filePath);
      }

      case "search_code": {
        const pattern = String(input.pattern ?? "");
        if (!pattern) {
          return "Error: search_code requires a 'pattern' parameter";
        }
        const glob = input.glob ? String(input.glob) : undefined;
        const args = ["--line-number", "--max-count", "50"];
        if (glob) args.push("--glob", glob);
        args.push(pattern);
        const result = await executor.run("rg", args, { cwd: rootPath });
        return result.stdout || result.stderr || "No matches found";
      }

      case "list_directory": {
        const dirPath = String(input.path ?? ".");
        const entries = await executor.listFiles(dirPath);
        if (entries.length === 0) {
          return `Empty directory: ${dirPath}`;
        }
        return entries.join("\n");
      }

      case "git_log": {
        const count = String(input.count ?? 20);
        const args = [
          "log",
          `--max-count=${count}`,
          "--oneline",
          "--decorate",
        ];
        if (input.path) args.push("--", String(input.path));
        const result = await executor.run("git", args, { cwd: rootPath });
        return result.stdout || result.stderr || "No commits found";
      }

      case "git_blame": {
        const filePath = String(input.path ?? "");
        if (!filePath) {
          return "Error: git_blame requires a 'path' parameter";
        }
        const result = await executor.run("git", ["blame", filePath], {
          cwd: rootPath,
        });
        return result.stdout || result.stderr || "No blame data";
      }

      default:
        return `Error: Unknown tool '${name}'. Available tools: read_file, search_code, list_directory, git_log, git_blame`;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return `Error executing ${name}: ${errorMessage}\n\nInput: ${JSON.stringify(input)}`;
  }
}

// ── Session logging ─────────────────────────────
function appendSessionLog(
  sessionDir: string,
  entry: Record<string, unknown>
): void {
  try {
    fs.appendFileSync(
      path.join(sessionDir, "session.jsonl"),
      JSON.stringify(entry) + "\n"
    );
  } catch {
    // non-fatal
  }
}

// ── InProcessAgentRunner ────────────────────────
export class InProcessAgentRunner implements AgentRunner {
  private client: Anthropic;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({
      apiKey: options?.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = options?.model ?? DEFAULT_MODEL;
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

    const startTime = Date.now();
    const comments: AgentRunResult["comments"] = [];
    let tokensUsed = { input: 0, output: 0 };

    // Ensure session directory exists
    fs.mkdirSync(sessionDir, { recursive: true });

    // Initialize SessionStore for conversation persistence
    // SessionStore expects parent directory + ticket key, but sessionDir is already per-ticket
    // Extract parent directory and use ticketId as key
    const sessionStore = new SessionStore(path.dirname(sessionDir));
    const ticketKey = ticketId;

    // Build tool schemas from workspace allowed tools
    // For researcher: read_file, search_code, list_directory, git_log, git_blame
    const tools = buildToolSchemas([
      "read_file",
      "search_code",
      "list_directory",
      "git_log",
      "git_blame",
    ]);

    // Load existing conversation history or start fresh
    const existingMessages = sessionStore.load(ticketKey);
    const messages: Anthropic.Messages.MessageParam[] =
      existingMessages.length > 0
        ? existingMessages
        : [{ role: "user", content: task }];

    // If starting fresh, save initial user message
    if (existingMessages.length === 0 && messages[0]) {
      sessionStore.append(ticketKey, messages[0]);
    }

    appendSessionLog(sessionDir, {
      event: "start",
      ticketId,
      projectId: params.projectId,
      task: task.slice(0, 200),
      timestamp: new Date().toISOString(),
      resuming: existingMessages.length > 0,
      existing_turns: existingMessages.length,
      model: this.model,
      max_turns: MAX_TURNS,
      max_duration_ms: maxDurationMs,
      tools_available: tools.map(t => t.name),
    });

    let finalText = "";
    let totalInputTokens = 0;
    const CONTEXT_WARNING_THRESHOLD = 180_000; // Warn at 180k input tokens
    const CONTEXT_LIMIT = 200_000; // Claude's context window

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Check timeout
      if (Date.now() - startTime > maxDurationMs) {
        // Ensure session is saved before timeout return
        sessionStore.save(ticketKey, messages);

        appendSessionLog(sessionDir, {
          event: "timeout",
          turn,
        });
        return {
          status: "timeout",
          comments,
          tokensUsed,
        };
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        tools,
        messages,
      });

      // Track tokens
      tokensUsed.input += response.usage.input_tokens;
      tokensUsed.output += response.usage.output_tokens;
      totalInputTokens += response.usage.input_tokens;

      // Warn if approaching context limit
      if (totalInputTokens > CONTEXT_WARNING_THRESHOLD) {
        appendSessionLog(sessionDir, {
          event: "context_warning",
          turn,
          total_input_tokens: totalInputTokens,
          threshold: CONTEXT_WARNING_THRESHOLD,
        });

        comments.push({
          content: `Warning: Approaching context limit (${totalInputTokens}/${CONTEXT_LIMIT} tokens). Consider compacting conversation.`,
          type: "status",
        });
      }

      // Hard stop if we exceed context limit
      if (totalInputTokens > CONTEXT_LIMIT) {
        sessionStore.save(ticketKey, messages);

        appendSessionLog(sessionDir, {
          event: "context_limit_exceeded",
          turn,
          total_input_tokens: totalInputTokens,
        });

        return {
          status: "blocked",
          comments: [
            ...comments,
            {
              content: "Context window limit exceeded. This ticket requires conversation compaction or manual intervention.",
              type: "status",
            },
          ],
          tokensUsed,
        };
      }

      appendSessionLog(sessionDir, {
        event: "response",
        turn,
        stop_reason: response.stop_reason,
        usage: response.usage,
        content_types: response.content.map((b) => b.type),
      });

      // Extract text blocks
      for (const block of response.content) {
        if (block.type === "text") {
          finalText += block.text;
        }
      }

      // Check for explicit completion signals
      const completionPatterns = [
        /moved? (?:the )?ticket to verification/i,
        /all acceptance criteria (?:are )?(?:now )?met/i,
        /(?:work|task|research) (?:is )?complete/i,
        /ready for (?:plan )?approval/i,
      ];

      const hasCompletionSignal = completionPatterns.some(p => p.test(finalText));

      if (hasCompletionSignal && response.stop_reason === "end_turn") {
        appendSessionLog(sessionDir, {
          event: "completion_signal_detected",
          turn,
          pattern_matched: completionPatterns.findIndex(p => p.test(finalText)),
        });

        // Early return with completion status
        sessionStore.save(ticketKey, messages);

        if (finalText) {
          fs.writeFileSync(
            path.join(sessionDir, "output.md"),
            finalText
          );
        }

        appendSessionLog(sessionDir, {
          event: "complete",
          tokens: tokensUsed,
          output_length: finalText.length,
          completion_type: "explicit_signal",
        });

        return {
          status: "completed",
          comments: [{ content: finalText, type: "completion" }],
          ticketStateChange: "verification",
          tokensUsed,
        };
      }

      // Handle stop reasons
      switch (response.stop_reason) {
        case "end_turn":
          // Normal completion - no more tool use
          break;

        case "max_tokens":
          // Hit token limit - log warning but continue conversation
          appendSessionLog(sessionDir, {
            event: "warning",
            turn,
            message: "Response truncated due to max_tokens",
          });
          // Don't break - agent may have more to say
          break;

        case "stop_sequence":
          // Hit a stop sequence - treat as completion
          appendSessionLog(sessionDir, {
            event: "stop_sequence",
            turn,
          });
          break;

        default:
          appendSessionLog(sessionDir, {
            event: "unknown_stop_reason",
            turn,
            stop_reason: response.stop_reason,
          });
          break;
      }

      // Only break if end_turn or stop_sequence
      if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
        break;
      }

      // Handle tool calls
      const toolBlocks = response.content.filter(
        (b) => b.type === "tool_use"
      );
      if (toolBlocks.length === 0) break;

      // Add assistant message
      const assistantMessage = { role: "assistant" as const, content: response.content };
      messages.push(assistantMessage);
      sessionStore.append(ticketKey, assistantMessage);

      // Execute each tool and collect results
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of toolBlocks) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, unknown>;

        appendSessionLog(sessionDir, {
          event: "tool_call",
          turn,
          tool: block.name,
          input: JSON.stringify(input).slice(0, 200),
        });

        const output = await executeTool(
          block.name,
          input,
          workspace.executor,
          workspace.rootPath
        );

        const truncated = output.slice(0, MAX_TOOL_OUTPUT);

        appendSessionLog(sessionDir, {
          event: "tool_result",
          turn,
          tool: block.name,
          output_length: truncated.length,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncated,
        });
      }

      const userMessage = { role: "user" as const, content: toolResults };
      messages.push(userMessage);
      sessionStore.append(ticketKey, userMessage);
    }

    // Save the final output
    if (finalText) {
      fs.writeFileSync(
        path.join(sessionDir, "output.md"),
        finalText
      );
    }

    // Ensure final session state is persisted
    sessionStore.save(ticketKey, messages);

    const endTime = Date.now();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    appendSessionLog(sessionDir, {
      event: "complete",
      timestamp: new Date().toISOString(),
      duration_seconds: durationSeconds,
      tokens: tokensUsed,
      tokens_per_second: durationSeconds > 0
        ? Math.round((tokensUsed.input + tokensUsed.output) / durationSeconds)
        : 0,
      output_length: finalText.length,
      status: "completed",
    });

    comments.push({
      content: finalText,
      type: "completion",
    });

    return {
      status: "completed",
      comments,
      tokensUsed,
    };
  }
}
