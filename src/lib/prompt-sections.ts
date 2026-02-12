import type { TechStack } from './project-analyzer';
import type { PersonaRow, ProjectRow, TicketRow, CommentRow } from '../db/schema';

export function buildPersonaSection(persona: PersonaRow): string {
  const parts: string[] = [];

  parts.push(`You are ${persona.name}.`);

  if (persona.personality) {
    try {
      const personality = JSON.parse(persona.personality);
      if (personality.background) {
        parts.push(`\n${personality.background}`);
      }
      if (personality.communication || personality.quirks) {
        parts.push(`\n## Your Personality`);
        if (personality.communication) {
          parts.push(personality.communication);
        }
        if (personality.quirks) {
          parts.push(`\n${personality.quirks}`);
        }
      }
    } catch {
      // Malformed personality JSON, skip
    }
  }

  return parts.join('\n');
}

export function buildProjectSection(
  project: ProjectRow,
  techStack: TechStack,
  claudeMd: string | null
): string {
  const parts: string[] = ['## Project Context'];

  parts.push(`**Project:** ${project.name}`);
  if (project.githubOwner && project.githubRepo) {
    parts.push(`**Repository:** ${project.githubOwner}/${project.githubRepo}`);
  }

  if (techStack.languages.length > 0) {
    parts.push(`**Languages:** ${techStack.languages.join(', ')}`);
  }
  if (techStack.frameworks.length > 0) {
    parts.push(`**Frameworks:** ${techStack.frameworks.join(', ')}`);
  }

  if (claudeMd) {
    parts.push(`\n### Project-Specific Guidelines\n${claudeMd}`);
  }

  return parts.join('\n');
}

export function buildTicketSection(ticket: TicketRow): string {
  const parts: string[] = [`## Ticket: ${ticket.id}`];

  parts.push(`**Title:** ${ticket.title}`);
  parts.push(`**Type:** ${ticket.type}`);
  parts.push(`**State:** ${ticket.state}`);

  if (ticket.description) {
    parts.push(`\n### Description\n${ticket.description}`);
  }

  if (ticket.acceptanceCriteria) {
    parts.push(`\n### Acceptance Criteria\n${ticket.acceptanceCriteria}`);
  }

  return parts.join('\n');
}

export function buildCommentsSection(comments: CommentRow[]): string {
  if (comments.length === 0) return '';

  const parts: string[] = ['## Recent Comments'];

  for (const comment of comments) {
    const timestamp = comment.createdAt ? new Date(comment.createdAt).toLocaleString() : 'unknown';
    parts.push(`\n### ${comment.authorType} — ${timestamp}`);
    parts.push(comment.content);
  }

  return parts.join('\n');
}
