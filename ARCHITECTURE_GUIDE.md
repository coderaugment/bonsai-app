# Architecture Guide

**Last updated:** February 2026

This guide explains how Bonsai Developer OS is designed and how its components work together. It bridges practical implementation details with high-level system design, helping you understand both HOW the system works and WHY it was built this way.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Core Concepts](#core-concepts)
3. [Three-Phase Workflow](#three-phase-workflow)
4. [Data Flow](#data-flow)
5. [Agent Runtime Model](#agent-runtime-model)
6. [Key Files and Their Purposes](#key-files-and-their-purposes)
7. [Deep Dive Links](#deep-dive-links)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          User Interface                          │
│                     (Next.js App Router)                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Routes Layer                           │
│               (Ticket management, Agent dispatch)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌──────────┐    ┌──────────────┐  ┌────────────┐
    │  SQLite  │    │ Agent        │  │  Encrypted │
    │ Database │    │ Dispatcher   │  │   Vault    │
    └──────────┘    └──────┬───────┘  └────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   Claude CLI    │
                  │  (Detached)     │
                  └────────┬────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   AI Agent (Claude)    │
              │   - Research tools     │
              │   - Planning tools     │
              │   - Implementation     │
              └────────┬───────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ Session │  │ Webhook │  │ File    │
    │  Files  │  │ Reports │  │ Changes │
    └─────────┘  └─────────┘  └─────────┘
```

**Request Flow:**
1. User creates/updates ticket in UI
2. API route handles request, updates SQLite database
3. Agent dispatcher spawns detached Claude CLI process
4. Agent executes with phase-specific tools and permissions
5. Agent posts progress updates via webhook
6. Agent writes final output to session directory
7. UI reflects changes from database updates

---

## Core Concepts

### Tickets (`src/db/schema.ts:30-45`)

Tickets are the fundamental unit of work in Bonsai. Each ticket represents a task to be completed by AI agents.

**Ticket Lifecycle:**
- `draft` → `research` → `planning` → `implementation` → `completed`

**Key properties:**
- `title` and `description` - What needs to be done
- `acceptanceCriteria` - How to verify completion
- `state` - Current phase in three-phase workflow
- `assignedPersonaId` - Which AI agent is working on it
- `projectId` - Links to GitHub repository context

**Database schema:**
```typescript
export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  acceptanceCriteria: text("acceptance_criteria"),
  state: text("state").notNull(), // draft, research, planning, implementation, completed
  assignedPersonaId: text("assigned_persona_id"),
  projectId: text("project_id"),
  // ... additional fields
});
```

**Why tickets?** Tickets provide structure and accountability. Each unit of work has clear objectives, assigned resources, and trackable progress.

---

### Personas (`src/db/schema.ts:60-75`)

Personas are AI agents with distinct roles, skills, and communication styles. They act like members of a development team, each bringing specialized capabilities.

**Default personas (from seed data):**
- **Kira (Developer)** - Implementation, code review, technical skills
- **Renzo (Researcher)** - Codebase exploration, documentation, analysis
- **Mika (Planner)** - Architecture design, strategic planning

**Persona properties:**
- `name` and `role` - Identity and primary function
- `skills` - JSON array of skill IDs (e.g., `["technical", "communication"]`)
- `personality` - Communication style and approach
- `avatar` - Visual representation in UI

**Why personas?** Different phases require different thinking modes. A researcher needs to be thorough and exploratory. A planner needs to be strategic and structured. A developer needs to be precise and pragmatic. Personas embody these distinct approaches.

---

### Agent Sessions (`scripts/heartbeat-dispatch.ts`)

Agent sessions are isolated execution environments where agents work on tickets. Each session is a directory containing all context, outputs, and logs.

**Session directory structure:**
```
~/.bonsai/sessions/{ticketId}-agent-{timestamp}/
├── task.md              # Agent instructions (ticket details)
├── system-prompt.txt    # Full context (role, tools, constraints)
├── output.md            # Agent's final deliverable
├── stderr.log           # Error logs and debugging info
└── report.sh            # Script for posting progress updates
```

**Session lifecycle:**
1. **Creation** - Dispatcher creates directory and writes task/prompt files
2. **Execution** - Claude CLI process runs with session as context
3. **Progress** - Agent calls `report.sh` to post updates via webhook
4. **Completion** - Agent writes `output.md` and posts final webhook
5. **Cleanup** - Session directory persists for debugging/auditing

**Why sessions?** Isolation prevents cross-contamination between tickets. Session directories provide a complete audit trail. Filesystem-based storage is simple, reliable, and easily debuggable.

---

### Encrypted Vault (`src/lib/vault.ts`)

The vault securely stores API keys, tokens, and other sensitive credentials using age-encryption (public-key cryptography).

**Vault files:**
- `~/.bonsai/vault-key.txt` - Private key (never share this!)
- `~/.bonsai/vault.age` - Encrypted secrets storage

**How it works:**
1. **Auto-initialization** - On first run, generates ed25519 keypair
2. **Encryption** - Secrets encrypted with public key before storage
3. **Decryption** - Private key required to read secrets
4. **Migration** - Automatically migrates plaintext secrets from SQLite

**Secret types:**
- `session` - Claude session credentials
- `api_key` - API keys (Anthropic, GitHub, etc.)
- `token` - OAuth tokens and PATs
- `custom` - User-defined secrets

**Why age-encryption?** Industry-standard cryptography, simple API, no complex key management. Secrets are encrypted at rest, and the private key never leaves the local machine.

---

## Three-Phase Workflow

Bonsai uses a structured three-phase approach to ensure quality and maintain human oversight.

### Phase 1: Research

**Goal:** Understand the problem and gather context

**Agent behavior:**
- Explores codebase using read-only tools
- Searches for relevant files and patterns
- Analyzes existing implementations
- Documents findings in research document

**Tools available:**
- `Read` - Read file contents
- `Grep` - Search codebase for patterns
- `Glob` - Find files by name/pattern
- `Bash` - Run read-only commands (ls, git log, etc.)

**Output:** Research document explaining:
- What currently exists
- What needs to change
- Relevant files and patterns
- Risks and considerations

**Human gate:** Review research document before proceeding to planning.

---

### Phase 2: Planning

**Goal:** Design the implementation approach

**Agent behavior:**
- Reviews research document
- Creates step-by-step implementation plan
- Identifies files to modify
- Considers edge cases and testing

**Tools available:**
- Same as research phase (read-only)
- `AskUserQuestion` - Clarify requirements

**Output:** Implementation plan with:
- Ordered list of steps
- Files to create/modify
- Test cases to write
- Verification checklist

**Human gate:** Approve implementation plan before proceeding to implementation.

---

### Phase 3: Implementation

**Goal:** Execute the plan and deliver working code

**Agent behavior:**
- Follows approved implementation plan
- Writes/modifies code
- Runs tests and fixes errors
- Creates commits and pull requests

**Tools available:**
- All research tools (Read, Grep, Glob, Bash)
- `Write` - Create new files
- `Edit` - Modify existing files
- `Bash` (full access) - Run tests, git commands, etc.

**Output:** Working code with:
- Feature implementation
- Tests (unit, integration)
- Documentation updates
- Git commits with clear messages

**Human gate:** Review pull request before merging.

---

**Why three phases?** This structure mirrors real software development:
1. **Research** prevents building the wrong thing
2. **Planning** prevents building the thing wrong
3. **Implementation** builds the thing right

Human approval gates ensure AI agents don't make irreversible changes without oversight.

---

## Data Flow

### Storage Layers

Bonsai uses three storage mechanisms, each optimized for different data types:

**1. SQLite Database (`bonsai-dev.db` or `bonsai.db`)**
- **Stores:** Structured, queryable data
- **Contents:** Tickets, personas, skills, roles, comments, projects
- **Why:** Fast queries, transactions, relational integrity

**2. Filesystem (`~/.bonsai/sessions/`)**
- **Stores:** Agent outputs, logs, session state
- **Contents:** Task files, prompts, output.md, stderr.log
- **Why:** Human-readable, debuggable, simple append-only logs

**3. Encrypted Vault (`~/.bonsai/vault.age`)**
- **Stores:** Sensitive credentials
- **Contents:** API keys, OAuth tokens, session credentials
- **Why:** Security, encryption at rest, migration from plaintext

**Data flow example (ticket creation → agent completion):**

```
1. User creates ticket via UI
   ↓
2. POST /api/tickets → Insert into SQLite
   ↓
3. User dispatches agent
   ↓
4. POST /api/tickets/[id]/dispatch
   ↓
5. Create session directory with task.md, system-prompt.txt
   ↓
6. Spawn detached Claude CLI process
   ↓
7. Agent reads from SQLite (ticket/project data)
   Agent reads from vault (API keys if needed)
   ↓
8. Agent posts updates: POST /api/tickets/[id]/report
   ↓
9. Update SQLite: Add comment with agent progress
   ↓
10. Agent writes output.md to session directory
    ↓
11. Agent posts completion: POST /api/tickets/[id]/agent-complete
    ↓
12. Update SQLite: Change ticket state, store output
    ↓
13. UI reflects changes (real-time updates via polling/SSE)
```

---

## Agent Runtime Model

### Fire-and-Forget Execution

Agents run as **detached processes**, meaning the API endpoint returns immediately after spawning the agent. The agent continues running independently.

**Implementation (`src/app/api/tickets/[id]/dispatch/route.ts`):**

```typescript
const claudeCmd = `cd "${sessionDir}" && ~/.local/bin/claude --session-dir . < task.md`;

// Spawn detached process (fire-and-forget)
const child = spawn("sh", ["-c", claudeCmd], {
  detached: true,
  stdio: "ignore",
});

child.unref(); // Allow parent process to exit

return Response.json({ sessionDir }); // Return immediately
```

**Why fire-and-forget?** Agents can run for minutes or hours. Blocking the HTTP request would timeout. Detached processes allow the web server to remain responsive while agents work.

---

### Communication via Webhooks

Since agents run detached, they communicate back to the webapp via HTTP webhooks.

**Agent → Webapp communication:**

1. **Progress updates** - `POST /api/tickets/[id]/report`
   - Posted periodically during execution
   - Contains status message and current step
   - Stored as comments in database

2. **Completion notification** - `POST /api/tickets/[id]/agent-complete`
   - Posted when agent finishes
   - Contains final output and success/failure status
   - Updates ticket state in database

**How agents know the webhook URLs:**

The `report.sh` script is generated during session creation and contains the webhook URL:

```bash
#!/bin/bash
# report.sh
curl -X POST http://localhost:3000/api/tickets/tkt_123/report \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$1\"}"
```

Agent calls: `./report.sh "Completed research phase"`

---

### Tool Restrictions by Phase

Agents have different tool access depending on the current phase:

**Research phase:**
```typescript
const allowedTools = ["Read", "Grep", "Glob", "Bash"];
```
- Read-only access
- Cannot modify code or create files
- Can run safe bash commands (ls, git log, etc.)

**Implementation phase:**
```typescript
const allowedTools = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];
```
- Full access to modify codebase
- Can create files, edit files, run tests
- Can execute git commands (commit, push, etc.)

**Why restrict tools?** Safety and correctness:
- Research shouldn't modify code (prevents premature changes)
- Implementation needs full access (can execute approved plan)
- Tool restrictions are enforced in the system prompt

---

## Key Files and Their Purposes

### API Routes

**`src/app/api/tickets/[id]/dispatch/route.ts`**
- **Purpose:** Spawns agent process for ticket execution
- **Key logic:** Session directory creation, prompt building, process spawning
- **HTTP method:** POST
- **Returns:** Session directory path

**`src/app/api/tickets/[id]/report/route.ts`**
- **Purpose:** Receives progress updates from running agents
- **Key logic:** Creates comment in database with agent message
- **HTTP method:** POST
- **Called by:** Agent via `report.sh` script

**`src/app/api/tickets/[id]/agent-complete/route.ts`**
- **Purpose:** Handles agent completion notification
- **Key logic:** Updates ticket state, stores output, marks phase complete
- **HTTP method:** POST
- **Called by:** Agent after writing final output

---

### Core Libraries

**`src/lib/vault.ts`**
- **Purpose:** Encrypted credential storage using age-encryption
- **Key functions:**
  - `getVaultKey()` - Auto-generates keypair if not exists
  - `storeSecret()` - Encrypts and stores secret
  - `getSecret()` - Decrypts and retrieves secret
  - `migrateGitHubToken()` - Migrates plaintext tokens to vault

**`src/lib/prompt-builder.ts`**
- **Purpose:** Constructs system prompts for agents
- **Key logic:**
  - Injects ticket context (title, description, acceptance criteria)
  - Adds agent role and persona information
  - Specifies available tools and restrictions
  - Includes project context and file structure
  - Embeds `report.sh` script for progress updates

---

### Database Layer

**`src/db/schema.ts`**
- **Purpose:** Drizzle ORM schema definitions
- **Key tables:**
  - `tickets` - Work items and their state
  - `personas` - AI agents with roles and skills
  - `comments` - Communication thread on tickets
  - `ticketDocuments` - Research docs and implementation plans
  - `projects` - GitHub repository metadata

**`src/db/index.ts`**
- **Purpose:** Database connection and configuration
- **Key logic:** Environment-based database file selection
  ```typescript
  const dbPath = process.env.BONSAI_ENV === "dev"
    ? "bonsai-dev.db"
    : "bonsai.db";
  ```

**`src/db/seed.ts`**
- **Purpose:** Populate database with sample data
- **Key data:** Default personas, sample tickets, skills, roles

---

### Automation Scripts

**`scripts/heartbeat-dispatch.ts`**
- **Purpose:** Automated three-phase workflow execution
- **Key logic:**
  - Monitors ticket state
  - Triggers phase transitions
  - Spawns agents automatically
  - Enforces approval gates

**How it works:**
1. Runs periodically (heartbeat)
2. Queries tickets in `research`/`planning`/`implementation` state
3. Checks if agent should be dispatched
4. Creates session and spawns agent
5. Waits for completion, then transitions to next phase

---

## Deep Dive Links

For detailed information on specific topics, see:

### Agent System
- **[docs/13-agent-runtime.md](./docs/13-agent-runtime.md)** - Detailed agent execution model, tool system, session lifecycle
- **[docs/15-agent-teams.md](./docs/15-agent-teams.md)** - Multi-agent coordination, role specialization, communication patterns

### Architecture & Design
- **[docs/02-technical-architecture.md](./docs/02-technical-architecture.md)** - System design rationale, architectural decisions, tradeoffs
- **[docs/12-technology-stack.md](./docs/12-technology-stack.md)** - Why we chose Next.js, SQLite, age-encryption, etc.

### Features & Workflows
- **[docs/05-onboarding-wizard.md](./docs/05-onboarding-wizard.md)** - End-user onboarding flow (not developer onboarding)
- **[docs/06-project-management.md](./docs/06-project-management.md)** - Project creation, GitHub integration

### Development
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to add features, testing, code style
- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** - First-time setup instructions

---

## Architectural Principles

### Local-First

Bonsai runs entirely on your local machine:
- SQLite database (no remote DB connection)
- Local filesystem for session storage
- Encrypted vault stored locally

**Why?** Privacy, speed, reliability. No cloud dependencies mean no outages, no data leaks, no latency.

---

### Progressive Enhancement

The system works at multiple levels:
- **Manual mode** - Create tickets, manually dispatch agents
- **Semi-automated** - Heartbeat monitors and suggests actions
- **Fully automated** - Heartbeat executes three-phase workflow without intervention

**Why?** Users can choose their level of automation. Start with manual control, gradually trust the system more.

---

### Explicit State Machines

Every ticket follows a clear state machine:
```
draft → research → planning → implementation → completed
```

No hidden states, no implicit transitions. Current state is always visible in the database and UI.

**Why?** Predictability and debuggability. You always know where a ticket is in the workflow.

---

### Audit Trail

Everything is logged and traceable:
- Comments track all communication
- Session directories preserve full context
- Ticket history shows state transitions
- Git commits link back to tickets

**Why?** Transparency and accountability. When something goes wrong, you can trace exactly what happened.

---

## Questions & Answers

### Why detached processes instead of API streaming?

**Short answer:** Long-running tasks require resilience.

**Explanation:** Agents can run for 30+ minutes. HTTP streaming connections are fragile (proxies, timeouts, network issues). Detached processes with webhook callbacks are more robust: if the connection drops, the agent continues working. If the web server restarts, agents aren't affected.

---

### Why SQLite instead of PostgreSQL?

**Short answer:** Local-first architecture and simplicity.

**Explanation:** Bonsai is a single-user, local-first tool. SQLite provides:
- Zero configuration (no server to manage)
- File-based storage (easy backups)
- Fast queries for small datasets
- Embedded in application (no external dependencies)

For multi-user or cloud-based deployment, PostgreSQL would make sense. For local development automation, SQLite is ideal.

---

### Why three phases instead of two or four?

**Short answer:** Balance between thoroughness and overhead.

**Explanation:**
- **One phase** - Too risky, no approval gates
- **Two phases** (plan → implement) - Skips critical research step, leads to wrong solutions
- **Three phases** (research → plan → implement) - Right balance of safety and speed
- **Four+ phases** - Diminishing returns, too much overhead

Three phases mirror real development: understand the problem, design the solution, build the solution.

---

### Why personas instead of generic agents?

**Short answer:** Different tasks need different thinking modes.

**Explanation:** A researcher should be thorough and exploratory. A planner should be strategic. A developer should be pragmatic. By giving agents distinct personalities and skills, we get better specialized performance. It also makes the system more transparent—users know WHO is working on their ticket and WHAT expertise they bring.

---

**Last updated:** February 2026

This guide evolves as Bonsai evolves. If you find gaps or outdated information, please update this document and submit a pull request.
