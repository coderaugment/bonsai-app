// Type definitions for database operations
export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  state: 'backlog' | 'research' | 'plan_approval' | 'in_progress' | 'verification' | 'done';
  acceptanceCriteria: string;
  assignedPersonaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  ticketId: string;
  personaId: string;
  content: string;
  createdAt: Date;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  color: string;
  avatar: string | null;
  personality: string | null;
  skills: string | null;
}

export interface BonsaiDbOperations {
  // Ticket operations
  getTicket(ticketId: string): Promise<Ticket | null>;
  updateTicketState(ticketId: string, newState: Ticket['state']): Promise<void>;

  // Comment operations
  createComment(ticketId: string, personaId: string, content: string): Promise<Comment>;

  // Persona operations
  getPersona(personaId: string): Promise<Persona | null>;
}

// Validate state transitions
const VALID_TRANSITIONS: Record<Ticket['state'], Ticket['state'][]> = {
  backlog: ['research'],
  research: ['plan_approval', 'backlog'],
  plan_approval: ['in_progress', 'research'],
  in_progress: ['verification', 'research'],
  verification: ['done', 'in_progress'],
  done: [], // Terminal state
};

export function isValidStateTransition(from: Ticket['state'], to: Ticket['state']): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
