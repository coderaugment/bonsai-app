import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';
import { toolRegistry } from '../registry.js';
import type { ToolProfile } from '../types.js';

// list_my_tools
const listMyToolsSchema = z.object({});

export const listMyToolsTool: ToolDefinition = {
  name: 'list_my_tools',
  description: 'List all tools available to you based on your role. Use this when asked what tools or capabilities you have access to.',
  parameters: zodToJsonSchema(listMyToolsSchema),
  async handle(params, ctx): Promise<ToolResult> {
    if (!ctx.workspace.personaId) {
      return { output: '', error: 'No persona ID in context - cannot determine your role' };
    }

    try {
      // Get the persona info from the webapp API
      const apiUrl = `http://localhost:3000/api/personas/${ctx.workspace.personaId}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        return { output: '', error: `Failed to fetch persona info: ${response.statusText}` };
      }

      const persona = await response.json() as { role: string };
      const role = persona.role as ToolProfile;

      // Get tools for this role
      const tools = toolRegistry.getToolsForProfile(role);

      // Format the tool list - just names for concise output
      const toolList = tools.map(tool => tool.name).join('\n');

      const output = `**My Role**: ${role}\n\n**Available Tools**:\n${toolList}`;

      return {
        output,
        metadata: {
          role,
          toolCount: tools.length,
          tools: tools.map(t => t.name)
        }
      };
    } catch (err) {
      return { output: '', error: `Failed to list tools: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

export const agentTools: ToolDefinition[] = [
  listMyToolsTool,
];
