#!/usr/bin/env npx tsx
/**
 * Bonsai CLI — database and workflow utilities
 * Usage: bonsai-cli <command> [args]
 */

import { db } from "../src/db/index";
import { tickets, projects, comments, ticketDocuments } from "../src/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  console.log(`
Bonsai CLI — database and workflow utilities

Usage: bonsai-cli <command> [args]

Commands:
  create-ticket <project-slug> <title> --type <feature|bug|chore> [--description <text>] [--acceptance-criteria <text>]
                                              Create a new ticket
  get-comments <project-slug> <ticket-id> [--head N | --tail N]
                                              Get all comments for a ticket
  get-persona <persona-id>                    Get persona details (name, role, avatar status)
  write-artifact <ticket-id> <type> <file>    Save a document artifact (research|implementation_plan|design)
  read-artifact <ticket-id> <type>            Read the latest artifact of a type
  sync-artifacts                              Export all artifacts to markdown files for QMD indexing
  search-artifacts <query>                    Search artifacts using QMD hybrid search
  report <ticket-id> <message>                Post a progress update to the ticket
  check-criteria <ticket-id> <index>          Mark an acceptance criterion as complete (0-indexed)
  credit-status                               Check if API credits are paused

Examples:
  bonsai-cli create-ticket my-project "Add login feature" --type feature --description "Implement user login" --acceptance-criteria "User can log in with email/password"
  bonsai-cli get-comments digitalworker-ai-demo 41 --tail 5
  bonsai-cli get-persona p8
  bonsai-cli write-artifact 41 research /tmp/research.md
  bonsai-cli read-artifact 41 research
  bonsai-cli sync-artifacts
  bonsai-cli search-artifacts "React 19 patterns"
  bonsai-cli report 41 "Starting implementation of auth module"
  bonsai-cli check-criteria 41 0
  bonsai-cli credit-status
  `);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// get-comments <project-slug> <ticket-id> [--head N | --tail N]
// ───────────────────────────────────────────────────────────────────────────
function getComments(projectSlug: string, ticketId: string, limit?: {type: 'head' | 'tail', count: number}) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  // Verify project exists
  const project = db.select().from(projects).where(and(
    eq(projects.slug, projectSlug),
    isNull(projects.deletedAt)
  )).get();

  if (!project) {
    console.error(`Error: project '${projectSlug}' not found`);
    process.exit(1);
  }

  // Verify ticket exists and belongs to project
  const ticket = db.select().from(tickets).where(and(
    eq(tickets.id, ticketIdNum),
    eq(tickets.projectId, project.id),
    isNull(tickets.deletedAt)
  )).get();

  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found in project '${projectSlug}'`);
    process.exit(1);
  }

  // Fetch comments
  const allComments = db.select().from(comments)
    .where(eq(comments.ticketId, ticketIdNum))
    .orderBy(comments.createdAt)
    .all();

  // Apply head/tail filtering
  let ticketComments = allComments;
  if (limit) {
    if (limit.type === 'head') {
      ticketComments = allComments.slice(0, limit.count);
    } else if (limit.type === 'tail') {
      ticketComments = allComments.slice(-limit.count);
    }
  }

  console.log(`\n=== Ticket #${ticketId}: ${ticket.title} ===`);
  console.log(`State: ${ticket.state}`);
  console.log(`Project: ${project.name} (${project.slug})`);
  console.log(`Comments: ${ticketComments.length}${limit ? ` (${limit.type} ${limit.count} of ${allComments.length} total)` : ''}\n`);

  ticketComments.forEach((c, idx) => {
    const displayIdx = limit?.type === 'tail' ? allComments.length - ticketComments.length + idx + 1 : idx + 1;
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(`Comment #${displayIdx} | ${c.authorType} | ${c.personaId || 'system'} | ${c.createdAt}`);
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(c.content);
  });

  console.log(`\n────────────────────────────────────────────────────────────────\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// create-ticket <project-slug> <title> --type <type> [--description <text>] [--acceptance-criteria <text>]
// ───────────────────────────────────────────────────────────────────────────
async function createTicketCmd(projectSlug: string, title: string, options: { type?: string; description?: string; acceptanceCriteria?: string }) {
  // Verify project exists
  const project = db.select().from(projects).where(and(
    eq(projects.slug, projectSlug),
    isNull(projects.deletedAt)
  )).get();

  if (!project) {
    console.error(`Error: project '${projectSlug}' not found`);
    process.exit(1);
  }

  // Validate type
  const validTypes = ["feature", "bug", "chore"];
  if (!options.type || !validTypes.includes(options.type)) {
    console.error(`Error: --type is required and must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  // Create ticket via API
  try {
    const res = await fetch(`http://localhost:3080/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        title: title,
        type: options.type,
        description: options.description || "",
        acceptanceCriteria: options.acceptanceCriteria || "",
        state: "planning",
        priority: 0,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error(`Error creating ticket: ${data.error || res.statusText}`);
      process.exit(1);
    }

    const ticket = await res.json();
    console.log(`✓ Created ticket #${ticket.id}: ${ticket.title}`);
    console.log(`  Type: ${ticket.type}`);
    console.log(`  State: ${ticket.state}`);
    console.log(`  Project: ${project.name} (${project.slug})`);
    if (options.description) console.log(`  Description: ${options.description.substring(0, 100)}${options.description.length > 100 ? '...' : ''}`);
    if (options.acceptanceCriteria) console.log(`  Acceptance criteria: ${options.acceptanceCriteria.substring(0, 100)}${options.acceptanceCriteria.length > 100 ? '...' : ''}`);
  } catch (err: any) {
    console.error(`Error creating ticket: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// write-artifact <ticket-id> <type> <file>
// ───────────────────────────────────────────────────────────────────────────
async function writeArtifact(ticketId: string, type: string, filePath: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const validTypes = ["research", "implementation_plan", "design"];
  if (!validTypes.includes(type)) {
    console.error(`Error: type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketIdNum)).get();
  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found`);
    process.exit(1);
  }

  // Read file content
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    console.error(`Error reading file '${filePath}': ${err.message}`);
    process.exit(1);
  }

  if (!content.trim()) {
    console.error(`Error: file '${filePath}' is empty`);
    process.exit(1);
  }

  // Call the API endpoint
  try {
    const res = await fetch(`http://localhost:3080/api/tickets/${ticketId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content: content.trim(), personaId: null }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`Error: ${data.error || "Failed to save document"}`);
      if (data.detail) console.error(data.detail);
      process.exit(1);
    }

    console.log(`✓ ${type} v${data.version} saved to ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error calling API: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// read-artifact <ticket-id> <type>
// ───────────────────────────────────────────────────────────────────────────
function readArtifact(ticketId: string, type: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  const validTypes = ["research", "implementation_plan", "design"];
  if (!validTypes.includes(type)) {
    console.error(`Error: type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketIdNum)).get();
  if (!ticket) {
    console.error(`Error: ticket ${ticketId} not found`);
    process.exit(1);
  }

  // Fetch latest version of this document type
  const docs = db.select().from(ticketDocuments)
    .where(and(
      eq(ticketDocuments.ticketId, ticketIdNum),
      eq(ticketDocuments.type, type)
    ))
    .orderBy(desc(ticketDocuments.version))
    .all();

  if (docs.length === 0) {
    console.error(`No ${type} documents found for ticket ${ticketId}`);
    process.exit(1);
  }

  const latest = docs[0];
  console.log(`\n=== ${type} v${latest.version} | Ticket #${ticketId} ===`);
  console.log(`Created: ${latest.createdAt}`);
  console.log(`Author: ${latest.authorPersonaId || 'human'}\n`);
  console.log(`────────────────────────────────────────────────────────────────\n`);
  console.log(latest.content);
  console.log(`\n────────────────────────────────────────────────────────────────\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// get-persona <persona-id>
// ───────────────────────────────────────────────────────────────────────────
function getPersona(personaId: string) {
  const { personas } = require("../src/db/schema");

  const persona = db.select().from(personas).where(eq(personas.id, personaId)).get();

  if (!persona) {
    console.error(`Error: persona '${personaId}' not found`);
    process.exit(1);
  }

  const hasAvatar = persona.avatar && persona.avatar.length > 0;
  const avatarPreview = hasAvatar
    ? persona.avatar!.substring(0, 100) + `... (${persona.avatar!.length} chars total)`
    : 'No avatar';

  console.log(`\n=== Persona: ${persona.name} (${personaId}) ===`);
  console.log(`Role: ${persona.role}`);
  console.log(`Color: ${persona.color}`);
  console.log(`Project ID: ${persona.projectId}`);
  console.log(`Avatar: ${avatarPreview}`);
  console.log(`Deleted: ${persona.deletedAt || 'No'}\n`);
}

// ───────────────────────────────────────────────────────────────────────────
// sync-artifacts — Export all artifacts to markdown files for QMD
// ───────────────────────────────────────────────────────────────────────────
async function syncArtifacts() {
  const os = await import('node:os');
  const path = await import('node:path');

  const artifactsDir = path.join(os.homedir(), '.bonsai', 'artifacts');

  // Create directory structure
  await fs.mkdir(path.join(artifactsDir, 'research'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'plans'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'designs'), { recursive: true });

  // Fetch all artifacts
  const allDocs = db.select().from(ticketDocuments).all();

  console.log(`Syncing ${allDocs.length} artifacts to ${artifactsDir}...\n`);

  let synced = 0;
  for (const doc of allDocs) {
    const ticket = db.select().from(tickets).where(eq(tickets.id, doc.ticketId)).get();
    if (!ticket) continue;

    const ticketSlug = ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let subdir: string;
    let filename: string;

    if (doc.type === 'research') {
      subdir = 'research';
      filename = `ticket-${doc.ticketId}-${ticketSlug}-v${doc.version}.md`;
    } else if (doc.type === 'implementation_plan') {
      subdir = 'plans';
      filename = `ticket-${doc.ticketId}-${ticketSlug}-v${doc.version}.md`;
    } else if (doc.type === 'design') {
      subdir = 'designs';
      filename = `ticket-${doc.ticketId}-${ticketSlug}-v${doc.version}.md`;
    } else {
      continue;
    }

    const filePath = path.join(artifactsDir, subdir, filename);

    // Add frontmatter with metadata
    const frontmatter = `---
ticketId: ${doc.ticketId}
ticketTitle: ${ticket.title}
type: ${doc.type}
version: ${doc.version}
author: ${doc.authorPersonaId || 'human'}
created: ${doc.createdAt}
---

`;

    await fs.writeFile(filePath, frontmatter + doc.content, 'utf-8');
    synced++;
  }

  console.log(`✓ Synced ${synced} artifacts to ${artifactsDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. cd ~/.bonsai/artifacts`);
  console.log(`  2. qmd collection add . --name bonsai-artifacts --mask "**/*.md"`);
  console.log(`  3. qmd embed`);
  console.log(`  4. qmd search "your query" -c bonsai-artifacts`);
}

// ───────────────────────────────────────────────────────────────────────────
// search-artifacts <query> — Search artifacts using QMD
// ───────────────────────────────────────────────────────────────────────────
async function searchArtifacts(query: string) {
  const { spawn } = await import('node:child_process');

  if (!query?.trim()) {
    console.error("Error: search query is required");
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('qmd', ['search', query, '-c', 'bonsai-artifacts'], {
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`\nQMD search failed. Run 'bonsai-cli sync-artifacts' first to set up the collection.`);
        process.exit(code || 1);
      }
      resolve(undefined);
    });

    proc.on('error', (err) => {
      console.error(`Error: ${err.message}`);
      console.error(`\nMake sure QMD is installed: npm install -g @arcadeum/qmd`);
      process.exit(1);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// report <ticket-id> <message> — Post progress update to ticket
// ───────────────────────────────────────────────────────────────────────────
async function reportProgress(ticketId: string, message: string) {
  const ticketIdNum = Number(ticketId);
  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  if (!message?.trim()) {
    console.error("Error: message is required");
    process.exit(1);
  }

  // Get persona ID and API base from environment
  const personaId = process.env.BONSAI_PERSONA_ID;
  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  if (!personaId) {
    console.error("Error: BONSAI_PERSONA_ID environment variable not set");
    process.exit(1);
  }

  try {
    const response = await fetch(`${apiBase}/api/tickets/${ticketIdNum}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, content: message }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(data.error || data.detail || "Failed to post report");
      process.exit(1);
    }

    console.log(`✓ Progress update posted to ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// check-criteria <ticket-id> <index> — Mark acceptance criterion complete
// ───────────────────────────────────────────────────────────────────────────
async function checkCriteria(ticketId: string, indexStr: string) {
  const ticketIdNum = Number(ticketId);
  const index = Number(indexStr);

  if (!ticketIdNum) {
    console.error("Error: ticket-id must be a number");
    process.exit(1);
  }

  if (isNaN(index) || index < 0) {
    console.error("Error: index must be a non-negative number");
    process.exit(1);
  }

  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  try {
    const response = await fetch(`${apiBase}/api/tickets/${ticketIdNum}/check-criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(data.error || data.detail || "Failed to check criterion");
      process.exit(1);
    }

    const data = await response.json();
    console.log(`✓ Checked criterion ${index} on ticket ${ticketId}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// credit-status — Check if API credits are paused
// ───────────────────────────────────────────────────────────────────────────
async function creditStatus() {
  const apiBase = process.env.BONSAI_API_BASE || "http://localhost:3080";

  try {
    const response = await fetch(`${apiBase}/api/credit-pause`, {
      method: "GET",
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();

    if (data.paused) {
      console.log(`⏸️  Credits are PAUSED until ${data.pausedUntil}`);
      console.log(`   Reason: ${data.reason || 'Unknown'}`);
      console.log(`   Remaining: ${Math.round(data.remainingMs / 1000 / 60)} minutes`);
      process.exit(1); // Exit with error code when paused
    } else {
      console.log(`✓ Credits are active (not paused)`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────
async function main() {
  if (!command) usage();

  switch (command) {
    case "create-ticket": {
      if (args.length < 2) {
        console.error("Error: create-ticket requires <project-slug> <title>");
        usage();
      }
      const projectSlug = args[0];
      const title = args[1];
      const options: { type?: string; description?: string; acceptanceCriteria?: string } = {};

      // Parse flags
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--type' && args[i + 1]) {
          options.type = args[i + 1];
          i++;
        } else if (args[i] === '--description' && args[i + 1]) {
          options.description = args[i + 1];
          i++;
        } else if (args[i] === '--acceptance-criteria' && args[i + 1]) {
          options.acceptanceCriteria = args[i + 1];
          i++;
        }
      }

      await createTicketCmd(projectSlug, title, options);
      break;
    }

    case "get-comments": {
      if (args.length < 2) {
        console.error("Error: get-comments requires <project-slug> <ticket-id>");
        usage();
      }
      const projectSlug = args[0];
      const ticketId = args[1];
      let limit: {type: 'head' | 'tail', count: number} | undefined;

      // Check for --head or --tail
      const headIdx = args.indexOf('--head');
      const tailIdx = args.indexOf('--tail');
      if (headIdx >= 0 && args[headIdx + 1]) {
        limit = { type: 'head', count: Number(args[headIdx + 1]) };
      } else if (tailIdx >= 0 && args[tailIdx + 1]) {
        limit = { type: 'tail', count: Number(args[tailIdx + 1]) };
      }

      getComments(projectSlug, ticketId, limit);
      break;
    }

    case "get-persona":
      if (args.length < 1) {
        console.error("Error: get-persona requires <persona-id>");
        usage();
      }
      getPersona(args[0]);
      break;

    case "write-artifact":
      if (args.length < 3) {
        console.error("Error: write-artifact requires <ticket-id> <type> <file>");
        usage();
      }
      await writeArtifact(args[0], args[1], args[2]);
      break;

    case "read-artifact":
      if (args.length < 2) {
        console.error("Error: read-artifact requires <ticket-id> <type>");
        usage();
      }
      readArtifact(args[0], args[1]);
      break;

    case "sync-artifacts":
      await syncArtifacts();
      break;

    case "search-artifacts":
      if (args.length < 1) {
        console.error("Error: search-artifacts requires <query>");
        usage();
      }
      await searchArtifacts(args.join(' '));
      break;

    case "report":
      if (args.length < 2) {
        console.error("Error: report requires <ticket-id> <message>");
        usage();
      }
      await reportProgress(args[0], args.slice(1).join(' '));
      break;

    case "check-criteria":
      if (args.length < 2) {
        console.error("Error: check-criteria requires <ticket-id> <index>");
        usage();
      }
      await checkCriteria(args[0], args[1]);
      break;

    case "credit-status":
      await creditStatus();
      break;

    default:
      console.error(`Error: unknown command '${command}'`);
      usage();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
