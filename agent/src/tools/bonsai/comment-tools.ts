import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

const commentPostSchema = z.object({
  ticketId: z.string().optional().describe('Ticket ID to comment on (default: current ticket from context)'),
  content: z.string().describe('Comment content (supports markdown)'),
});

export const commentPostTool: ToolDefinition = {
  name: 'comment_post',
  description: 'Post a comment to a ticket. Use this to communicate findings, ask questions, report progress, or document decisions. Supports markdown formatting.',
  parameters: zodToJsonSchema(commentPostSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { ticketId = ctx.ticketId, content } = commentPostSchema.parse(params);

    if (!ticketId) {
      return { output: '', error: 'No ticketId provided and no current ticket in context' };
    }

    if (!ctx.db) {
      return { output: '', error: 'Database operations not available in context' };
    }

    // Persona ID should come from context (the agent making the comment)
    // For now, we'll require it to be set in context
    if (!ctx.workspace.personaId) {
      return { output: '', error: 'No persona ID in context - cannot determine comment author' };
    }

    try {
      const comment = await ctx.db.createComment(
        ticketId,
        ctx.workspace.personaId,
        content
      );

      return { output: `Posted comment ${comment.id} to ticket ${ticketId}` };
    } catch (err) {
      return { output: '', error: `Failed to post comment: ${err}` };
    }
  },
};

export const commentTools: ToolDefinition[] = [commentPostTool];
