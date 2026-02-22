/**
 * AgentRunner — the boundary between "decide what to do" and "do the work."
 *
 * Today it's an in-process function call. Tomorrow it could be a child
 * process or a container entrypoint.
 *
 * V1: InProcessAgentRunner — calls the extracted LLM loop directly
 * V2: IsolatedAgentRunner — child process or container
 */

import type { Workspace } from "./workspace/provider.js";

export interface AgentRunParams {
  projectId: string;
  ticketId: string;
  task: string;
  workspace: Workspace;
  systemPrompt: string;
  sessionDir: string;
  maxDurationMs: number;
}

export interface AgentRunResult {
  status: "completed" | "blocked" | "timeout" | "error";
  comments: Array<{
    content: string;
    type: "question" | "status" | "completion";
  }>;
  ticketStateChange?: string;
  tokensUsed: { input: number; output: number };
}

export interface AgentRunner {
  run(params: AgentRunParams): Promise<AgentRunResult>;
}
