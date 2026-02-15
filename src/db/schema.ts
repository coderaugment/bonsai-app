import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// SKILLS - Individual capabilities that can be attached to roles
// ============================================================================
export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category", {
    enum: ["technical", "communication", "planning", "analysis", "creative"],
  }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// ROLES - Archetypes/templates for generating personas
// ============================================================================
export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon"), // SVG string or icon identifier
  workflow: text("workflow"), // JSON array of workflow steps
  systemPrompt: text("system_prompt"), // Base prompt for agents
  tools: text("tools"), // JSON array of allowed tools (MCP tools, bash, etc.)
  folderAccess: text("folder_access"), // JSON array of folder paths this role can access
  skillDefinitions: text("skill_definitions"), // JSON array of Claude Code skill definitions
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// ROLE_SKILLS - Join table: which skills belong to which roles
// ============================================================================
export const roleSkills = sqliteTable(
  "role_skills",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.skillId] })]
);

// ============================================================================
// USERS
// ============================================================================
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  visibility: text("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  description: text("description"),
  targetCustomer: text("target_customer"),
  techStack: text("tech_stack"),
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  localPath: text("local_path"),
  buildCommand: text("build_command"),
  runCommand: text("run_command"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull(),
  avatar: text("avatar"),
  // Reference to the role archetype this persona was generated from
  roleId: integer("role_id").references(() => roles.id),
  // Role slug — matches roles.slug (dynamic, not hardcoded enum)
  role: text("role").default("developer"),
  personality: text("personality"), // JSON: communication style, quirks
  skills: text("skills"), // JSON: can override/extend role's skills
  processes: text("processes"),
  goals: text("goals"),
  permissions: text("permissions"),
  projectId: integer("project_id").references(() => projects.id),
  deletedAt: text("deleted_at"),
});

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["feature", "bug", "chore"] }).notNull(),
  state: text("state", {
    enum: ["review", "planning", "building", "preview", "test", "shipped"],
  })
    .notNull()
    .default("planning"),
  priority: integer("priority").notNull().default(0),
  assigneeId: text("assignee_id").references(() => personas.id),
  createdBy: integer("created_by").references(() => users.id),
  commentCount: integer("comment_count").default(0),
  acceptanceCriteria: text("acceptance_criteria"),
  hasAttachments: integer("has_attachments", { mode: "boolean" }).default(
    false
  ),
  lastAgentActivity: text("last_agent_activity"),
  lastHumanCommentAt: text("last_human_comment_at"),
  returnedFromVerification: integer("returned_from_verification", { mode: "boolean" }).default(false),
  projectId: integer("project_id").references(() => projects.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  // Git worktree tracking
  worktreePath: text("worktree_path"),
  // Lifecycle tracking columns
  researchCompletedAt: text("research_completed_at"),
  researchCompletedBy: text("research_completed_by").references(() => personas.id),
  researchApprovedAt: text("research_approved_at"),
  researchApprovedBy: integer("research_approved_by").references(() => users.id),
  planCompletedAt: text("plan_completed_at"),
  planCompletedBy: text("plan_completed_by").references(() => personas.id),
  planApprovedAt: text("plan_approved_at"),
  planApprovedBy: integer("plan_approved_by").references(() => users.id),
  // Merge tracking
  mergedAt: text("merged_at"),
  mergeCommit: text("merge_commit"),
  // Epic hierarchy
  isEpic: integer("is_epic", { mode: "boolean" }).default(false),
  epicId: integer("epic_id"), // references tickets.id (self-ref handled at app layer)
  // Soft delete
  deletedAt: text("deleted_at"),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  authorType: text("author_type", { enum: ["human", "agent", "system"] }).notNull(),
  authorId: integer("author_id"), // user id if human
  personaId: text("persona_id").references(() => personas.id), // persona id if agent
  content: text("content").notNull(),
  attachments: text("attachments"), // JSON array of {name, type, data} objects
  documentId: integer("document_id").references(() => ticketDocuments.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ticketDocuments = sqliteTable("ticket_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  type: text("type", { enum: ["research", "implementation_plan", "research_critique", "plan_critique", "design"] }).notNull(),
  content: text("content").notNull(),
  version: integer("version").default(1),
  authorPersonaId: text("author_persona_id").references(() => personas.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ticketAttachments = sqliteTable("ticket_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(), // base64 data URL
  createdByType: text("created_by_type", { enum: ["human", "agent"] }).notNull(),
  createdById: text("created_by_id"), // user id or persona id
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// PROJECT NOTES - Freeform notes on the Desktop (voice, text, images)
// ============================================================================
export const projectNotes = sqliteTable("project_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  type: text("type", { enum: ["text", "image"] }).notNull().default("text"),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// EXTRACTED ITEMS - Work items extracted from notes via Claude
// ============================================================================
export const extractedItems = sqliteTable("extracted_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["feature", "bug", "chore"] })
    .notNull()
    .default("feature"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// TICKET AUDIT LOG - Immutable timeline of ticket events
// ============================================================================
export const ticketAuditLog = sqliteTable("ticket_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull(), // No FK — audit survives ticket deletion
  event: text("event").notNull(), // e.g. "ticket_created", "state_changed", "comment_added"
  actorType: text("actor_type", { enum: ["human", "agent", "system"] }).notNull(),
  actorId: text("actor_id"), // user.id or persona.id
  actorName: text("actor_name").notNull(),
  detail: text("detail").notNull(), // human-readable summary
  metadata: text("metadata"), // JSON blob for event-specific data
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type TicketAuditLogRow = typeof ticketAuditLog.$inferSelect;

// ============================================================================
// AGENT RUNS - Tracks every agent spawn (dispatch or heartbeat)
// ============================================================================
export const agentRuns = sqliteTable("agent_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull(),
  personaId: text("persona_id").notNull(),
  phase: text("phase").notNull(), // research, planning, implementation, conversational, test
  status: text("status", {
    enum: ["running", "completed", "failed", "timeout", "abandoned"],
  }).notNull().default("running"),
  tools: text("tools"), // JSON array of allowed tools
  sessionDir: text("session_dir"),
  dispatchSource: text("dispatch_source"), // "api" | "heartbeat"
  startedAt: text("started_at").default(sql`CURRENT_TIMESTAMP`),
  lastReportAt: text("last_report_at"),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
});

export type AgentRunRow = typeof agentRuns.$inferSelect;

// ── Type exports for prompt builder ──────────────

export type PersonaRow = typeof personas.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TicketRow = typeof tickets.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type TicketDocumentRow = typeof ticketDocuments.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type TicketAttachmentRow = typeof ticketAttachments.$inferSelect;
export type ProjectNoteRow = typeof projectNotes.$inferSelect;
export type ExtractedItemRow = typeof extractedItems.$inferSelect;
