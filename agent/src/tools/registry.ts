import type { ToolDefinition, ToolProfile } from './types.js';
import { fileTools } from './dev/file-tools.js';
import { bashTools } from './dev/bash-tools.js';
import { gitTools } from './dev/git-tools.js';
import { ticketTools } from './bonsai/ticket-tools.js';
import { commentTools } from './bonsai/comment-tools.js';
import { imageTools } from './bonsai/image-tools.js';
import { agentTools } from './bonsai/agent-tools.js';

// Tool profiles define which tools each role can access
const TOOL_PROFILES: Record<ToolProfile, string[]> = {
  researcher: [
    'file_read',
    'file_list',
    'bash', // For read-only commands like git log
    'git_status',
    'git_diff',
    'ticket_read',
    'comment_post',
    'apply_transparency',
    'list_my_tools',
  ],
  developer: [
    'file_read',
    'file_write',
    'file_edit',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'git_commit',
    'git_push',
    'ticket_read',
    'ticket_update_state',
    'comment_post',
    'apply_transparency',
    'list_my_tools',
  ],
  reviewer: [
    'file_read',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'ticket_read',
    'ticket_update_state', // Can move to done or back to in_progress
    'comment_post',
    'apply_transparency',
    'list_my_tools',
  ],
  hacker: [
    'file_read',
    'file_write',
    'file_edit',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'git_commit',
    'git_push',
    'ticket_read',
    'ticket_update_state',
    'comment_post',
    'apply_transparency', // Hackers can use transparency tool for image processing
    'list_my_tools',
  ],
  lead: [
    'file_read',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'ticket_read',
    'ticket_update_state',
    'comment_post',
    'list_my_tools',
  ],
  designer: [
    'file_read',
    'file_write',
    'file_edit',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'ticket_read',
    'comment_post',
    'apply_transparency', // Designers can use transparency tool for image processing
    'list_my_tools',
  ],
  critic: [
    'file_read',
    'file_list',
    'bash',
    'git_status',
    'git_diff',
    'ticket_read',
    'comment_post',
    'list_my_tools',
  ],
};

export class ToolRegistry {
  private allTools: Map<string, ToolDefinition>;

  constructor() {
    this.allTools = new Map();
    this.registerTools([
      ...fileTools,
      ...bashTools,
      ...gitTools,
      ...ticketTools,
      ...commentTools,
      ...imageTools,
      ...agentTools,
    ]);
  }

  private registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      if (this.allTools.has(tool.name)) {
        throw new Error(`Tool ${tool.name} is already registered`);
      }
      this.allTools.set(tool.name, tool);
    }
  }

  /**
   * Get all tools filtered by profile
   */
  getToolsForProfile(profile: ToolProfile): ToolDefinition[] {
    const allowedNames = TOOL_PROFILES[profile];
    return allowedNames
      .map(name => this.allTools.get(name))
      .filter((tool): tool is ToolDefinition => tool !== undefined);
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.allTools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getAllToolNames(): string[] {
    return Array.from(this.allTools.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.allTools.has(name);
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
