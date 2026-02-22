import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

// apply_transparency
const applyTransparencySchema = z.object({
  ticketId: z.string().optional().describe('Ticket ID (default: current ticket from context)'),
  attachmentId: z.number().describe('Attachment ID to process'),
  tolerance: z.number().optional().default(50).describe('Color tolerance for matching grey pixels (0-255, default: 50)'),
  greyTarget: z.number().optional().default(128).describe('Target grey value (0-255, default: 128 for 50% grey)'),
});

export const applyTransparencyTool: ToolDefinition = {
  name: 'apply_transparency',
  description: 'Apply transparency to an image attachment by removing grey background pixels. Useful for processing generated images (like from nano banana) that have grey backgrounds. The tool makes pixels close to 50% grey (RGB ~128) transparent.',
  parameters: zodToJsonSchema(applyTransparencySchema),
  async handle(params, ctx): Promise<ToolResult> {
    const {
      ticketId = ctx.ticketId,
      attachmentId,
      tolerance,
      greyTarget
    } = applyTransparencySchema.parse(params);

    if (!ticketId) {
      return { output: '', error: 'No ticketId provided and no current ticket in context' };
    }

    if (!ctx.db) {
      return { output: '', error: 'Database operations not available in context' };
    }

    try {
      // Call the webapp API to apply transparency
      const apiUrl = `http://localhost:3000/api/tickets/${ticketId}/attachments/${attachmentId}/transparency`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tolerance, greyTarget }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        return {
          output: '',
          error: `Failed to apply transparency: ${errorData.error || response.statusText}`
        };
      }

      return {
        output: `Successfully applied transparency to attachment ${attachmentId} on ticket ${ticketId}. Grey pixels (target: ${greyTarget}, tolerance: ${tolerance}) have been made transparent.`,
        metadata: { attachmentId, ticketId }
      };
    } catch (err) {
      return {
        output: '',
        error: `Failed to apply transparency: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
};

export const imageTools: ToolDefinition[] = [
  applyTransparencyTool,
];
