import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../bonsai.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

// Clear existing data
db.delete(schema.tickets).run();
db.delete(schema.personas).run();
db.delete(schema.projects).run();

// Seed project
const project = db
  .insert(schema.projects)
  .values({
    name: "Bonsai",
    slug: "bonsai",
    visibility: "private",
    description: "Bonsai Developer OS",
  })
  .returning()
  .get();

console.log(`Created project: ${project.name} (id: ${project.id})`);

// Seed personas
const personaData = [
  {
    id: "p1", name: "Kira", slug: "kira", color: "#3b82f6", projectId: project.id,
    role: "developer" as const,
    personality: "Methodical and precise. Prefers small, well-tested PRs over large sweeping changes. Gets excited about type safety and elegant abstractions.",
    skills: JSON.stringify(["React", "TypeScript", "Node.js", "Testing", "CI/CD"]),
    processes: JSON.stringify(["TDD", "Code review", "Trunk-based dev"]),
    goals: JSON.stringify(["Clean code", "Test coverage", "Ship fast"]),
    permissions: JSON.stringify({ tools: ["git", "npm", "docker", "bash"], folders: ["src/", "tests/"] }),
  },
  {
    id: "p2", name: "Renzo", slug: "renzo", color: "#22c55e", projectId: project.id,
    role: "lead" as const,
    personality: "Calm under pressure with a talent for breaking big goals into achievable sprints. The team's favorite meeting facilitator.",
    skills: JSON.stringify(["Planning", "Risk assessment", "Agile", "Sprint planning"]),
    processes: JSON.stringify(["Stand-ups", "Retrospectives", "Status reports"]),
    goals: JSON.stringify(["On-time delivery", "Team velocity", "Clear priorities"]),
    permissions: JSON.stringify({ tools: ["tickets", "calendar", "notifications"], folders: ["docs/", "plans/"] }),
  },
  {
    id: "p3", name: "Mika", slug: "mika", color: "#f59e0b", projectId: project.id,
    role: "designer" as const,
    personality: "Visually driven with strong opinions about whitespace. Believes every pixel matters but ships imperfect work early to gather feedback fast.",
    skills: JSON.stringify(["Figma", "UI design", "UX research", "Design systems", "Accessibility"]),
    processes: JSON.stringify(["User interviews", "Design critique", "Iterative prototyping"]),
    goals: JSON.stringify(["User satisfaction", "Consistent design", "Accessible interfaces"]),
    permissions: JSON.stringify({ tools: ["figma", "image-gen", "file-read"], folders: ["assets/", "components/"] }),
  },
] as const;

db.insert(schema.personas).values([...personaData]).run();
console.log(`Created ${personaData.length} personas`);

// Seed tickets
const ticketData = [
  {
    id: "tkt_01", title: "Design System Foundation",
    description: "Create base color tokens, typography scale, and spacing system for the Bonsai UI. Establish dark theme as default.",
    type: "feature" as const, state: "done" as const, priority: 900,
    assigneeId: "p1", commentCount: 3, hasAttachments: false,
    lastAgentActivity: "2h ago", projectId: project.id, createdAt: "2026-01-28",
  },
  {
    id: "tkt_02", title: "Project Board Kanban View",
    description: "Build the main kanban board with drag-and-drop columns for ticket states. Support filtering by type and assignee.",
    type: "feature" as const, state: "in_progress" as const, priority: 1000,
    assigneeId: "p1", commentCount: 5, hasAttachments: true,
    lastAgentActivity: "12m ago", projectId: project.id, createdAt: "2026-01-30",
  },
  {
    id: "tkt_03", title: "Heartbeat Service Integration",
    description: "Connect the webapp to the heartbeat status API. Show agent activity, queue depth, and last run time on the dashboard.",
    type: "feature" as const, state: "backlog" as const, priority: 800,
    assigneeId: "p2", commentCount: 2, hasAttachments: false,
    lastAgentActivity: "1h ago", projectId: project.id, createdAt: "2026-01-31",
  },
  {
    id: "tkt_04", title: "Ticket Detail View",
    description: "Full ticket detail page with description, acceptance criteria, comment thread, and agent activity log.",
    type: "feature" as const, state: "backlog" as const, priority: 700,
    commentCount: 0, hasAttachments: false, projectId: project.id, createdAt: "2026-02-01",
  },
  {
    id: "tkt_05", title: "Agent Persona Configuration",
    description: "Settings page for managing agent personas — name, color, avatar, and default tool profile.",
    type: "feature" as const, state: "backlog" as const, priority: 500,
    commentCount: 1, hasAttachments: false, projectId: project.id, createdAt: "2026-02-01",
  },
  {
    id: "tkt_06", title: "Fix Column Overflow on Small Screens",
    description: "Board columns overflow horizontally without scroll indicators on viewports below 1280px.",
    type: "bug" as const, state: "backlog" as const, priority: 600,
    commentCount: 0, hasAttachments: false, projectId: project.id, createdAt: "2026-02-02",
  },
  {
    id: "tkt_07", title: "SQLite Database Schema",
    description: "Set up Drizzle with SQLite. Create models for Project, Ticket, Comment, Document, AgentRun, and Persona.",
    type: "feature" as const, state: "backlog" as const, priority: 850,
    assigneeId: "p3", commentCount: 4, hasAttachments: true,
    lastAgentActivity: "35m ago", projectId: project.id, createdAt: "2026-01-29",
  },
  {
    id: "tkt_08", title: "Comment Thread Component",
    description: "Threaded comment UI for ticket detail view. Support human and agent comments with different styling.",
    type: "feature" as const, state: "backlog" as const, priority: 650,
    commentCount: 0, hasAttachments: false, projectId: project.id, createdAt: "2026-02-02",
  },
  {
    id: "tkt_09", title: "Startup Token Auth",
    description: "Implement Jupyter-style token auth. Generate token on first run, validate via cookie and Authorization header.",
    type: "feature" as const, state: "verification" as const, priority: 950,
    assigneeId: "p2", commentCount: 7, hasAttachments: false,
    lastAgentActivity: "45m ago", projectId: project.id, createdAt: "2026-01-28",
  },
  {
    id: "tkt_10", title: "Onboarding Wizard Flow",
    description: "First-run setup wizard: API key entry, project creation, heartbeat service install, vault initialization.",
    type: "feature" as const, state: "backlog" as const, priority: 750,
    assigneeId: "p1", commentCount: 3, hasAttachments: false,
    lastAgentActivity: "3h ago", projectId: project.id, createdAt: "2026-02-01",
  },
  {
    id: "tkt_11", title: "Git Operations Module",
    description: "Implement clone, branch, commit, push operations for agent workspaces. Validate paths and prevent escapes.",
    type: "feature" as const, state: "in_progress" as const, priority: 900,
    assigneeId: "p3", commentCount: 6, hasAttachments: true,
    lastAgentActivity: "8m ago", projectId: project.id, createdAt: "2026-01-30",
  },
  {
    id: "tkt_12", title: "Clean Up Stale Agent Locks",
    description: "Add automated cleanup of agent locks older than 45 minutes. Prevent stuck tickets after heartbeat crashes.",
    type: "chore" as const, state: "verification" as const, priority: 800,
    assigneeId: "p3", commentCount: 2, hasAttachments: false,
    lastAgentActivity: "1h ago", projectId: project.id, createdAt: "2026-02-03",
  },
  {
    id: "tkt_13", title: "Ticket State Transition Validation",
    description: "Enforce valid state transitions. Backlog can only move to In Progress, etc.",
    type: "chore" as const, state: "in_progress" as const, priority: 700,
    assigneeId: "p2", commentCount: 1, hasAttachments: false,
    lastAgentActivity: "2h ago", projectId: project.id, createdAt: "2026-02-03",
  },
  {
    id: "tkt_14", title: "Sidebar Navigation with Active States",
    description: "Icon-based sidebar with hover tooltips and active route highlighting. Include home, board, projects, settings.",
    type: "feature" as const, state: "done" as const, priority: 850,
    assigneeId: "p1", commentCount: 2, hasAttachments: false,
    lastAgentActivity: "5h ago", projectId: project.id, createdAt: "2026-01-29",
  },
];

db.insert(schema.tickets).values(ticketData).run();
console.log(`Created ${ticketData.length} tickets`);

sqlite.close();
console.log("Seed complete.");
