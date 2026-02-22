import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';
import { isValidStateTransition } from './db-interface.js';

// ticket_read
const ticketReadSchema = z.object({
  ticketId: z.string().optional().describe('Ticket ID to read (default: current ticket from context)'),
});

export const ticketReadTool: ToolDefinition = {
  name: 'ticket_read',
  description: 'Read full details of a ticket including title, description, acceptance criteria, current state, and assigned persona. If no ticketId provided, reads the current ticket from context.',
  parameters: zodToJsonSchema(ticketReadSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { ticketId = ctx.ticketId } = ticketReadSchema.parse(params);

    if (!ticketId) {
      return { output: '', error: 'No ticketId provided and no current ticket in context' };
    }

    if (!ctx.db) {
      return { output: '', error: 'Database operations not available in context' };
    }

    try {
      const ticket = await ctx.db.getTicket(ticketId);

      if (!ticket) {
        return { output: '', error: `Ticket ${ticketId} not found` };
      }

      const output = [
        `ID: ${ticket.id}`,
        `Title: ${ticket.title}`,
        `State: ${ticket.state}`,
        `Assigned: ${ticket.assignedPersonaId || 'Unassigned'}`,
        ``,
        `Description:`,
        ticket.description,
        ``,
        `Acceptance Criteria:`,
        ticket.acceptanceCriteria,
      ].join('\n');

      return { output };
    } catch (err) {
      return { output: '', error: `Failed to read ticket: ${err}` };
    }
  },
};

// ticket_update_state
const ticketUpdateStateSchema = z.object({
  ticketId: z.string().optional().describe('Ticket ID to update (default: current ticket from context)'),
  newState: z.enum(['backlog', 'research', 'plan_approval', 'in_progress', 'verification', 'done'])
    .describe('New state for the ticket'),
});

export const ticketUpdateStateTool: ToolDefinition = {
  name: 'ticket_update_state',
  description: 'Update the state of a ticket. Valid transitions: backlog→research, research→plan_approval, plan_approval→in_progress, in_progress→verification, verification→done. Can also move backwards for rework.',
  parameters: zodToJsonSchema(ticketUpdateStateSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { ticketId = ctx.ticketId, newState } = ticketUpdateStateSchema.parse(params);

    if (!ticketId) {
      return { output: '', error: 'No ticketId provided and no current ticket in context' };
    }

    if (!ctx.db) {
      return { output: '', error: 'Database operations not available in context' };
    }

    try {
      // Get current ticket
      const ticket = await ctx.db.getTicket(ticketId);
      if (!ticket) {
        return { output: '', error: `Ticket ${ticketId} not found` };
      }

      // Validate state transition
      if (!isValidStateTransition(ticket.state, newState)) {
        return {
          output: '',
          error: `Invalid state transition: ${ticket.state} → ${newState}`
        };
      }

      // Update state
      await ctx.db.updateTicketState(ticketId, newState);

      return { output: `Updated ticket ${ticketId} state: ${ticket.state} → ${newState}` };
    } catch (err) {
      return { output: '', error: `Failed to update ticket state: ${err}` };
    }
  },
};

export const ticketTools: ToolDefinition[] = [
  ticketReadTool,
  ticketUpdateStateTool,
];
