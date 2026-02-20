/**
 * Agent system prompt construction.
 *
 * Builds comprehensive context for Claude agents including:
 * - Agent persona (identity, role, skills, personality)
 * - Role-specific instructions and workflows
 * - Project context (tech stack, CLAUDE.md guidelines)
 * - Ticket details (title, description, acceptance criteria)
 * - Recent conversation history (comments)
 *
 * The prompt is assembled from modular sections to maintain consistency
 * across different agent types and ticket phases.
 *
 * @module prompt-builder
 */

import { getCommentsByTicket } from '../db/data/comments';
import { detectTechStack, loadClaudeMd } from './project-analyzer';
import {
  buildPersonaSection,
  buildProjectSection,
  buildTicketSection,
  buildCommentsSection,
} from './prompt-sections';
import type {
  PersonaRow as SchemaPersonaRow,
  ProjectRow as SchemaProjectRow,
  TicketRow as SchemaTicketRow,
  CommentRow as SchemaCommentRow,
} from '../db/schema';

// Accept both snake_case (raw SQL) and camelCase (Drizzle ORM) field names
export interface PersonaRow {
  id: string;
  name: string;
  personality: string | null;
  role_id?: number | null;
  roleId?: number | null;
}

export interface ProjectRow {
  id: number;
  name: string;
  github_owner?: string | null;
  github_repo?: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
}

export interface TicketRow {
  id: number;
  title: string;
  type: string;
  state: string;
  description: string | null;
  acceptance_criteria?: string | null;
  acceptanceCriteria?: string | null;
}

export interface RoleRow {
  id: number;
  title?: string;
  name?: string;
  description: string | null;
  skill_definitions: string | null;
  workflow: string | null;
}

export interface PromptOptions {
  commentLimit?: number;
  includeComments?: boolean;
  workspacePath?: string;
  roleData?: RoleRow;
}

/**
 * Build a complete system prompt for an AI agent.
 *
 * Assembles a comprehensive prompt from multiple sections:
 * 1. Persona identity (name, personality, role)
 * 2. Role-specific instructions and skills (if roleData provided)
 * 3. Project context (tech stack, CLAUDE.md) (if workspacePath provided)
 * 4. Ticket details (title, description, acceptance criteria)
 * 5. Recent conversation history (if includeComments is true)
 *
 * The prompt is designed to give agents:
 * - Clear identity and personality
 * - Specific instructions for their role
 * - Full context about the project and task
 * - Relevant conversation history
 *
 * @param persona - The AI agent persona with identity and personality
 * @param project - The project the ticket belongs to
 * @param ticket - The ticket the agent will work on
 * @param options - Optional configuration for prompt building
 * @param options.commentLimit - Max comments to include (default: 10)
 * @param options.includeComments - Whether to include comments (default: true)
 * @param options.workspacePath - Path to project workspace for tech stack detection
 * @param options.roleData - Detailed role definition with skills and workflow
 * @returns The complete system prompt as a string
 */
export async function buildSystemPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  options: PromptOptions = {}
): Promise<string> {
  const {
    commentLimit = 10,
    includeComments = true,
    workspacePath,
    roleData,
  } = options;

  // Normalize fields to handle both naming conventions
  const normalizedPersona = {
    ...persona,
    roleId: persona.roleId ?? persona.role_id,
  };

  const normalizedProject = {
    ...project,
    githubOwner: project.githubOwner ?? project.github_owner,
    githubRepo: project.githubRepo ?? project.github_repo,
  };

  const normalizedTicket = {
    ...ticket,
    acceptanceCriteria: ticket.acceptanceCriteria ?? ticket.acceptance_criteria,
  };

  const sections: string[] = [];

  // 1. Persona identity
  sections.push(buildPersonaSection(normalizedPersona as SchemaPersonaRow));

  // 2. Role definition (if available)
  if (roleData) {
    sections.push(`\n## Your Role: ${roleData.title || roleData.name || 'Agent'}`);
    if (roleData.description) {
      sections.push(roleData.description);
    }

    // Include skill definitions (YAML frontmatter format)
    if (roleData.skill_definitions) {
      try {
        const skills = JSON.parse(roleData.skill_definitions);
        if (Array.isArray(skills)) {
          for (const skill of skills) {
            if (skill.name && skill.content) {
              sections.push(`\n## ${skill.name} Instructions`);
              sections.push(skill.content);
            }
          }
        } else if (skills['ticket-researcher']) {
          sections.push(`\n## ticket-researcher Instructions`);
          sections.push(skills['ticket-researcher']);
        }
      } catch {
        // Malformed skill definitions, skip
      }
    }

    // Include workflow
    if (roleData.workflow) {
      try {
        const workflow = JSON.parse(roleData.workflow);
        if (Array.isArray(workflow)) {
          sections.push(`\n## Workflow`);
          workflow.forEach((step: string, i: number) => {
            sections.push(`${i + 1}. ${step}`);
          });
        } else if (workflow.steps) {
          sections.push(`\n## Workflow`);
          workflow.steps.forEach((step: string, i: number) => {
            sections.push(`${i + 1}. ${step}`);
          });
          if (workflow.outputFormat) {
            sections.push(`\n## Required Output Format`);
            sections.push(workflow.outputFormat);
          }
        }
      } catch {
        // Malformed workflow, skip
      }
    }
  }

  // 3. Workspace boundary rules (hard constraint — must come before project context)
  if (workspacePath) {
    sections.push([
      "",
      "## WORKSPACE BOUNDARY — HARD RULE",
      `Your workspace is: ${workspacePath}`,
      `You are ONLY allowed to read, write, or search files inside: ${workspacePath}`,
      "DO NOT read files outside this directory. No absolute paths to other directories. No ../",
      "There is other software on this machine. You are NOT allowed to access it.",
      `If any Read/Glob/Grep call would target a path outside ${workspacePath}, SKIP IT.`,
    ].join("\n"));
  }

  // 4. Project context
  if (workspacePath) {
    const techStack = detectTechStack(workspacePath);
    const claudeMd = loadClaudeMd(workspacePath);
    sections.push(`\n${buildProjectSection(normalizedProject as SchemaProjectRow, techStack, claudeMd)}`);
  }

  // 4. Ticket context
  sections.push(`\n${buildTicketSection(normalizedTicket as SchemaTicketRow)}`);

  // 5. Recent comments
  if (includeComments) {
    const comments = await getCommentsByTicket(ticket.id, commentLimit);
    const commentsSection = buildCommentsSection(comments as SchemaCommentRow[]);
    if (commentsSection) {
      sections.push(`\n${commentsSection}`);
    }
  }

  return sections.join('\n');
}
