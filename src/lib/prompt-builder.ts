import { getCommentsByTicket } from '../db/queries';
import { detectTechStack, loadClaudeMd } from './project-analyzer';
import {
  buildPersonaSection,
  buildProjectSection,
  buildTicketSection,
  buildCommentsSection,
} from './prompt-sections';

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
  id: string;
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

export function buildSystemPrompt(
  persona: PersonaRow,
  project: ProjectRow,
  ticket: TicketRow,
  options: PromptOptions = {}
): string {
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
  sections.push(buildPersonaSection(normalizedPersona as any));

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
      } catch (e) {
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
      } catch (e) {
        // Malformed workflow, skip
      }
    }
  }

  // 3. Project context
  if (workspacePath) {
    const techStack = detectTechStack(workspacePath);
    const claudeMd = loadClaudeMd(workspacePath);
    sections.push(`\n${buildProjectSection(normalizedProject as any, techStack, claudeMd)}`);
  }

  // 4. Ticket context
  sections.push(`\n${buildTicketSection(normalizedTicket as any)}`);

  // 5. Recent comments
  if (includeComments) {
    const comments = getCommentsByTicket(ticket.id, commentLimit);
    const commentsSection = buildCommentsSection(comments as any);
    if (commentsSection) {
      sections.push(`\n${commentsSection}`);
    }
  }

  return sections.join('\n');
}
