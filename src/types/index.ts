export type TicketType = "feature" | "bug" | "chore";

export type TicketState =
  | "planning"
  | "building"
  | "preview"
  | "test"
  | "shipped";

/** Format integer ticket ID as display slug: 1 → "tkt_01" */
export function formatTicketSlug(id: number): string {
  return `tkt_${String(id).padStart(2, "0")}`;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  type: TicketType;
  state: TicketState;
  priority: number;
  assignee?: Persona;
  acceptanceCriteria?: string;
  commentCount: number;
  hasAttachments: boolean;
  lastAgentActivity?: string;
  lastHumanCommentAt?: string;
  returnedFromVerification?: boolean;
  createdAt: string;
  // Lifecycle tracking
  researchCompletedAt?: string;
  researchCompletedBy?: string;
  researchApprovedAt?: string;
  planCompletedAt?: string;
  planCompletedBy?: string;
  planApprovedAt?: string;
  // Merge tracking
  mergedAt?: string;
  mergeCommit?: string;
  // Epic hierarchy
  isEpic?: boolean;
  epicId?: number;
  epicTitle?: string;       // parent epic's title (for child cards)
  childCount?: number;      // how many children (for epic cards)
  childrenShipped?: number; // how many children shipped (for progress)
  // All personas who have interacted with this ticket
  participants?: Persona[];
  // IDs of personas with currently-running agent_runs (for real-time working indicator)
  activeRunPersonaIds?: string[];
}

export type TicketDocumentType = "research" | "implementation_plan" | "design" | "security_review" | "research_critique" | "plan_critique";

export interface TicketDocument {
  id: number;
  ticketId: number;
  type: TicketDocumentType;
  content: string;
  version: number;
  authorPersonaId?: string;
  createdAt: string;
  updatedAt: string;
}

// Legacy type - keeping for backward compatibility
export type WorkerRole = "lead" | "researcher" | "developer" | "designer" | "critic" | "hacker";

// ============================================================================
// SKILLS - Individual capabilities that can be attached to roles
// ============================================================================
export type SkillCategory = "technical" | "communication" | "planning" | "analysis" | "creative";

export interface Skill {
  id: number;
  name: string;
  description?: string;
  category?: SkillCategory;
  createdAt: string;
}

// ============================================================================
// ROLES - Archetypes/templates for generating personas
// ============================================================================
// Claude Code Skill Definition (follows https://code.claude.com/docs/en/skills)
export interface ClaudeSkillDefinition {
  name: string; // lowercase, numbers, hyphens only (max 64 chars)
  description: string;
  argumentHint?: string; // e.g. "[issue-number]" or "[filename] [format]"
  disableModelInvocation?: boolean; // true = only user can invoke
  userInvocable?: boolean; // false = hide from / menu
  allowedTools?: string; // e.g. "Read, Grep, Glob"
  model?: string; // model to use
  context?: "fork"; // run in subagent
  agent?: string; // subagent type (Explore, Plan, general-purpose)
  content: string; // markdown instructions
}

export interface Role {
  id: number;
  slug: string;
  title: string;
  description?: string;
  color: string;
  icon?: string;
  workflow?: string[]; // Stored as JSON in DB
  systemPrompt?: string;
  tools?: string[]; // Allowed tools (MCP tools, bash commands, etc.)
  folderAccess?: string[]; // Folder paths this role can access
  skillDefinitions?: ClaudeSkillDefinition[]; // Claude Code skills for this role
  skills?: Skill[]; // Populated via join (legacy)
  createdAt: string;
}

// ============================================================================
// PERSONAS - Generated identities assigned to projects
// ============================================================================
export interface Persona {
  id: string;
  name: string;
  slug: string;
  color: string;
  avatar?: string;
  roleId?: number; // Reference to the role archetype
  role?: string; // Role slug (matches roles.slug)
  roleData?: Role; // Populated via join
  personality?: string;
  skills: string[];
  processes: string[];
  goals: string[];
  permissions: { tools: string[]; folders: string[] };
  projectId?: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  targetCustomer?: string;
  techStack?: string;
  visibility?: string;
  ticketCount: number;
  githubOwner?: string;
  githubRepo?: string;
  localPath?: string;
  buildCommand?: string;
  runCommand?: string;
}

export interface CommentAttachment {
  name: string;
  type: string; // mime type
  data: string; // base64 data URL
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  filename: string;
  mimeType: string;
  data: string; // base64 data URL
  createdByType: "human" | "agent";
  createdById?: string;
  createdAt: string;
}

export interface Comment {
  id: number;
  ticketId: number;
  authorType: "human" | "agent" | "system";
  author?: {
    name: string;
    avatarUrl?: string;
    color?: string;
    role?: string;
  };
  content: string;
  attachments?: CommentAttachment[];
  documentId?: number;
  createdAt: string;
}

// ============================================================================
// PROJECT NOTES - Freeform Desktop notes (voice, text, images)
// ============================================================================
export interface ProjectNote {
  id: number;
  projectId: number;
  type: "text" | "image";
  content: string;
  createdAt: string;
}

// ============================================================================
// EXTRACTED ITEMS - Work items extracted from notes via Claude
// ============================================================================
export interface ExtractedItem {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  type: TicketType;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// ============================================================================
// AGENT RUNS - Tracks every agent spawn
// ============================================================================
// ============================================================================
// PROJECT MESSAGES - Project-level chat
// ============================================================================
export interface ProjectMessage {
  id: number;
  projectId: number;
  authorType: "human" | "agent" | "system";
  author?: {
    name: string;
    avatarUrl?: string;
    color?: string;
    role?: string;
  };
  content: string;
  attachments?: CommentAttachment[];
  createdAt: string;
}

export type AgentRunStatus = "running" | "completed" | "failed" | "timeout" | "abandoned";

export interface AgentRun {
  id: number;
  ticketId: number;
  ticketTitle: string | null;
  personaId: string;
  personaName: string | null;
  personaColor: string | null;
  personaAvatar: string | null;
  personaRole: string | null;
  phase: string;
  status: AgentRunStatus;
  tools: string | null;
  dispatchSource: string | null;
  startedAt: string | null;
  lastReportAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}
