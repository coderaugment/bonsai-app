/**
 * Tool definitions — the contract between the agent runner and individual tools.
 */

import type { ToolExecutor } from "./executor.js";
import type { BonsaiDbOperations } from "./bonsai/db-interface.js";

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolContext {
  projectId: string;
  ticketId?: string; // Optional since not all contexts have a ticket
  workspace: {
    rootPath: string;
    executor: ToolExecutor;
    branch: string;
    remote: string;
    personaId?: string; // ID of the persona running the agent
  };
  db?: BonsaiDbOperations; // Optional database operations for Bonsai tools
}

export interface ToolResult {
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  handle(params: unknown, ctx: ToolContext): Promise<ToolResult>;
}

// Tool profile type
export type ToolProfile = 'researcher' | 'developer' | 'reviewer' | 'hacker' | 'lead' | 'designer' | 'critic';
