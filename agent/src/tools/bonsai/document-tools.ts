import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

// save_document - Save research or implementation plan
const saveDocumentSchema = z.object({
  type: z.enum(['research', 'implementation_plan', 'design']).describe('Document type'),
  content: z.string().describe('Full document content in markdown format'),
});

export const saveDocumentTool: ToolDefinition = {
  name: 'save_document',
  description: 'Save a research document, implementation plan, or design document for the current ticket. This persists your work to the database so it can be reviewed and approved.',
  parameters: zodToJsonSchema(saveDocumentSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { type, content } = saveDocumentSchema.parse(params);

    if (!ctx.ticketId) {
      return { output: '', error: 'No ticket ID in context' };
    }

    if (!ctx.personaId) {
      return { output: '', error: 'No persona ID in context' };
    }

    if (!ctx.db) {
      return { output: '', error: 'Database operations not available in context' };
    }

    try {
      await ctx.db.saveDocument({
        ticketId: ctx.ticketId,
        type,
        content,
        authorPersonaId: ctx.personaId,
      });

      return { output: `✓ Saved ${type} document for ticket ${ctx.ticketId}` };
    } catch (err) {
      return { output: '', error: `Failed to save document: ${err}` };
    }
  },
};

export const documentTools: ToolDefinition[] = [
  saveDocumentTool,
];
