# Contributing Guide

**Last updated:** February 2026

This guide helps you make changes to the Bonsai Developer OS codebase. It covers the development workflow, project structure, common tasks, and coding patterns.

---

## Table of Contents

1. [Development Environment](#development-environment)
2. [Project Structure](#project-structure)
3. [How to Add Features](#how-to-add-features)
4. [Database Workflow](#database-workflow)
5. [Testing Strategy](#testing-strategy)
6. [Code Style and Patterns](#code-style-and-patterns)
7. [Common Development Tasks](#common-development-tasks)
8. [Pull Request Guidelines](#pull-request-guidelines)

---

## Development Environment

### Running the Application

```bash
# Start dev server with hot reload
npm run dev

# Start on different port
PORT=3001 npm run dev

# Run with debug logging
DEBUG=* npm run dev
```

### Type Checking and Linting

```bash
# Type check entire codebase
npm run type-check

# Run ESLint
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

### Database Operations

```bash
# Apply schema changes (after editing src/db/schema.ts)
npm run db:push

# Add sample data to existing database
npm run db:seed

# Full reset with comprehensive test data
npm run db:reset-test

# Open Drizzle Studio (web-based DB browser)
npx drizzle-kit studio
```

### Building

```bash
# Build for production
npm run build

# Start production server
npm start
```

---

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # Backend API routes
│   │   ├── tickets/          # Ticket management
│   │   │   ├── route.ts      # List/create tickets
│   │   │   └── [id]/         # Individual ticket operations
│   │   │       ├── route.ts            # Get/update/delete ticket
│   │   │       ├── dispatch/route.ts   # Spawn agent
│   │   │       ├── report/route.ts     # Agent progress updates
│   │   │       └── agent-complete/route.ts  # Agent completion
│   │   ├── settings/         # Settings management
│   │   │   └── keys/route.ts # Vault API key management
│   │   └── health/route.ts   # Health check endpoint
│   ├── onboard/              # User onboarding wizard
│   │   ├── welcome/page.tsx  # Name collection
│   │   ├── github/page.tsx   # GitHub token setup
│   │   └── project/page.tsx  # Project creation
│   ├── tickets/              # Ticket UI pages
│   │   ├── page.tsx          # Ticket list
│   │   └── [id]/page.tsx     # Ticket detail
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Home page
├── components/               # React components
│   ├── ticket-card.tsx       # Ticket display component
│   ├── persona-avatar.tsx    # Agent avatar component
│   └── ...                   # Other UI components
├── db/                       # Database layer
│   ├── schema.ts             # Drizzle ORM schema definitions
│   ├── index.ts              # Database connection
│   ├── seed.ts               # Sample data for development
│   └── reset-test.ts         # Test environment reset
├── lib/                      # Shared utilities
│   ├── vault.ts              # Encrypted credential storage
│   ├── prompt-builder.ts     # Agent prompt construction
│   └── utils.ts              # General utilities
└── scripts/                  # Automation scripts
    └── heartbeat-dispatch.ts # Automated workflow
```

---

## How to Add Features

### Adding a New API Route

**Example:** Add an endpoint to export tickets as JSON

1. **Create the route file:**
   ```bash
   mkdir -p src/app/api/tickets/export
   touch src/app/api/tickets/export/route.ts
   ```

2. **Implement the handler:**
   ```typescript
   // src/app/api/tickets/export/route.ts
   import { NextRequest } from "next/server";
   import { db } from "@/db";
   import { tickets } from "@/db/schema";

   export async function GET(request: NextRequest) {
     try {
       const allTickets = await db.select().from(tickets);

       return Response.json({
         tickets: allTickets,
         exportedAt: new Date().toISOString(),
       });
     } catch (error) {
       console.error("Export failed:", error);
       return Response.json(
         { error: "Failed to export tickets" },
         { status: 500 }
       );
     }
   }
   ```

3. **Test the endpoint:**
   ```bash
   curl http://localhost:3000/api/tickets/export
   ```

**Reference:** See `src/app/api/tickets/[id]/dispatch/route.ts` for a complete example with error handling and database access.

---

### Adding a New Database Table

**Example:** Add a table to track agent performance metrics

1. **Define the schema:**
   ```typescript
   // src/db/schema.ts
   export const agentMetrics = sqliteTable("agent_metrics", {
     id: text("id").primaryKey(),
     agentId: text("agent_id").notNull(),
     ticketId: text("ticket_id").references(() => tickets.id),
     executionTime: integer("execution_time"), // milliseconds
     tokensUsed: integer("tokens_used"),
     successRate: real("success_rate"),
     createdAt: integer("created_at", { mode: "timestamp" })
       .notNull()
       .default(sql`(unixepoch())`),
   });
   ```

2. **Update TypeScript types:**
   ```typescript
   export type AgentMetric = typeof agentMetrics.$inferSelect;
   export type NewAgentMetric = typeof agentMetrics.$inferInsert;
   ```

3. **Apply schema changes:**
   ```bash
   npm run db:push
   ```

4. **Add seed data (optional):**
   ```typescript
   // src/db/seed.ts
   await db.insert(agentMetrics).values([
     {
       id: "metric_1",
       agentId: "persona_kira",
       ticketId: "tkt_001",
       executionTime: 45000,
       tokensUsed: 12000,
       successRate: 0.95,
     },
   ]);
   ```

**Reference:** See `src/db/schema.ts` for existing table definitions and patterns.

---

### Adding a New Agent Role

**Example:** Add a "Reviewer" role that reviews code changes

1. **Define the role in the agent package:**
   ```typescript
   // ../agent/src/roles/reviewer.ts
   export const reviewerRole = {
     name: "Code Reviewer",
     description: "Reviews code changes for quality and correctness",
     skills: ["code-review", "testing", "technical"],
     systemPrompt: `You are a code reviewer...`,
   };
   ```

2. **Rebuild the agent package:**
   ```bash
   cd ../agent
   npm run build
   cd ../webapp
   ```

3. **Import in dispatch script:**
   ```typescript
   // scripts/heartbeat-dispatch.ts
   import { reviewerRole } from "../../agent/src/roles/reviewer.js";

   const roleMap = {
     research: researcherRole,
     planning: plannerRole,
     implementation: developerRole,
     review: reviewerRole, // New role
   };
   ```

4. **Update ticket state machine (if needed):**
   ```typescript
   // src/db/schema.ts
   // Add "review" to ticket state type
   state: text("state").notNull(),
   // Valid values: draft, research, planning, implementation, review, completed
   ```

**Reference:** See `agent/src/roles/` for existing role definitions.

---

### Adding a New UI Component

**Example:** Add a component to display ticket statistics

1. **Create the component:**
   ```typescript
   // src/components/ticket-stats.tsx
   "use client";

   import { useEffect, useState } from "react";

   interface TicketStats {
     total: number;
     completed: number;
     inProgress: number;
   }

   export function TicketStats() {
     const [stats, setStats] = useState<TicketStats | null>(null);

     useEffect(() => {
       fetch("/api/tickets/stats")
         .then((res) => res.json())
         .then((data) => setStats(data));
     }, []);

     if (!stats) return <div>Loading...</div>;

     return (
       <div className="grid grid-cols-3 gap-4">
         <StatCard label="Total" value={stats.total} />
         <StatCard label="Completed" value={stats.completed} />
         <StatCard label="In Progress" value={stats.inProgress} />
       </div>
     );
   }

   function StatCard({ label, value }: { label: string; value: number }) {
     return (
       <div className="p-4 border rounded-lg">
         <div className="text-sm text-gray-500">{label}</div>
         <div className="text-2xl font-bold">{value}</div>
       </div>
     );
   }
   ```

2. **Use in a page:**
   ```typescript
   // src/app/dashboard/page.tsx
   import { TicketStats } from "@/components/ticket-stats";

   export default function DashboardPage() {
     return (
       <div>
         <h1>Dashboard</h1>
         <TicketStats />
       </div>
     );
   }
   ```

**Reference:** See `src/components/` for existing component patterns.

**React Server Components:** By default, components in `src/components/` are Server Components. Add `"use client"` directive only if you need:
- React hooks (useState, useEffect, etc.)
- Browser APIs (window, document, etc.)
- Event handlers (onClick, onChange, etc.)

---

### Adding Environment Variables

1. **Add to `.env.development`:**
   ```bash
   # .env.development
   NEW_FEATURE_FLAG=true
   EXTERNAL_API_URL=https://api.example.com
   ```

2. **Access in code:**
   ```typescript
   // Server-side only (API routes, Server Components)
   const featureEnabled = process.env.NEW_FEATURE_FLAG === "true";
   const apiUrl = process.env.EXTERNAL_API_URL;
   ```

3. **For client-side access, prefix with `NEXT_PUBLIC_`:**
   ```bash
   # .env.development
   NEXT_PUBLIC_FEATURE_ENABLED=true
   ```

   ```typescript
   // Client-side (use client components)
   const featureEnabled = process.env.NEXT_PUBLIC_FEATURE_ENABLED === "true";
   ```

4. **Update `.env.local` for local testing:**
   ```bash
   cp .env.development .env.local
   # Edit .env.local with your values
   ```

**Important:** Never commit `.env.local` or real secrets. Use `.env.development` for defaults and documentation.

---

## Database Workflow

### Making Schema Changes

1. **Edit schema:**
   ```typescript
   // src/db/schema.ts
   export const myNewTable = sqliteTable("my_new_table", {
     id: text("id").primaryKey(),
     name: text("name").notNull(),
     // ... other fields
   });
   ```

2. **Apply changes:**
   ```bash
   npm run db:push
   ```

3. **Verify in Drizzle Studio:**
   ```bash
   npx drizzle-kit studio
   # Opens web UI at http://localhost:4983
   ```

### Querying the Database

**Select:**
```typescript
import { db } from "@/db";
import { tickets } from "@/db/schema";

// Get all tickets
const allTickets = await db.select().from(tickets);

// Filter with where clause
import { eq } from "drizzle-orm";
const ticket = await db.select()
  .from(tickets)
  .where(eq(tickets.id, "tkt_123"));
```

**Insert:**
```typescript
await db.insert(tickets).values({
  id: "tkt_new",
  title: "New ticket",
  description: "Description here",
  state: "draft",
});
```

**Update:**
```typescript
await db.update(tickets)
  .set({ state: "completed" })
  .where(eq(tickets.id, "tkt_123"));
```

**Delete:**
```typescript
await db.delete(tickets)
  .where(eq(tickets.id, "tkt_123"));
```

**Reference:** See [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview) for advanced queries.

---

### Database Files

- **Development:** `bonsai-dev.db` (when `BONSAI_ENV=dev`)
- **Production:** `bonsai.db` (when `BONSAI_ENV=production`)

Switch between databases using environment variable:
```bash
BONSAI_ENV=dev npm run dev      # Uses bonsai-dev.db
BONSAI_ENV=production npm run dev  # Uses bonsai.db
```

---

## Testing Strategy

### Manual Testing

**Use seeded data for consistent testing:**

```bash
# Reset database with comprehensive test data
npm run db:reset-test

# This creates:
# - 3 personas (Kira, Renzo, Mika)
# - 5 sample tickets in various states
# - Skills and roles
# - Sample comments
```

**Test API endpoints with curl:**
```bash
# Get all tickets
curl http://localhost:3000/api/tickets

# Get specific ticket
curl http://localhost:3000/api/tickets/tkt_001

# Create ticket
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title": "Test ticket", "description": "Test description"}'
```

---

### Database Inspection

**Option 1: Drizzle Studio (recommended)**
```bash
npx drizzle-kit studio
# Opens web UI at http://localhost:4983
```

**Option 2: SQLite CLI**
```bash
sqlite3 bonsai-dev.db

# Useful commands:
.tables                    # List all tables
.schema tickets            # Show table schema
SELECT * FROM tickets;     # Query data
.quit                      # Exit
```

---

### Agent Testing

**Test agent dispatch locally:**

1. **Create test ticket in UI or via API**

2. **Trigger dispatch:**
   ```bash
   curl -X POST http://localhost:3000/api/tickets/tkt_123/dispatch
   ```

3. **Watch session files:**
   ```bash
   # List session directories
   ls -la ~/.bonsai/sessions/

   # Monitor agent progress
   tail -f ~/.bonsai/sessions/tkt_123-agent-*/stderr.log

   # Read final output
   cat ~/.bonsai/sessions/tkt_123-agent-*/output.md
   ```

4. **Check database updates:**
   ```bash
   sqlite3 bonsai-dev.db "SELECT * FROM comments WHERE ticket_id='tkt_123';"
   ```

---

### Debugging Vault Issues

**Check vault files exist:**
```bash
ls -la ~/.bonsai/vault-key.txt ~/.bonsai/vault.age
```

**Test encryption/decryption:**
```bash
# Via API
curl -X POST http://localhost:3000/api/settings/keys \
  -H "Content-Type: application/json" \
  -d '{"key": "test-key", "value": "secret-value", "type": "custom"}'

curl http://localhost:3000/api/settings/keys/test-key
```

**Reset vault (WARNING: Deletes all secrets):**
```bash
rm ~/.bonsai/vault-key.txt ~/.bonsai/vault.age
npm run dev  # Vault regenerates on startup
```

---

## Code Style and Patterns

### TypeScript

- **Strict mode enabled** - All code must pass strict type checking
- **Explicit return types** for exported functions
- **Avoid `any`** - Use `unknown` and type guards instead
- **Use const assertions** for readonly data

```typescript
// Good
export function getTicket(id: string): Promise<Ticket | null> {
  return db.select().from(tickets).where(eq(tickets.id, id));
}

// Avoid
export function getTicket(id: any): any {
  return db.select().from(tickets).where(eq(tickets.id, id));
}
```

---

### Database Access

- **Use Drizzle ORM** for all database operations (never raw SQL)
- **Use transactions** for multi-step operations
- **Handle errors** gracefully with try/catch

```typescript
// Good - Transaction for related operations
await db.transaction(async (tx) => {
  await tx.insert(tickets).values(newTicket);
  await tx.insert(comments).values(initialComment);
});

// Good - Error handling
try {
  const ticket = await db.select().from(tickets)
    .where(eq(tickets.id, id));
  return ticket[0] ?? null;
} catch (error) {
  console.error("Failed to fetch ticket:", error);
  throw new Error("Database error");
}
```

---

### React Components

- **Server Components by default** - Only use `"use client"` when necessary
- **Co-locate styles** - Use Tailwind CSS classes directly
- **Extract reusable logic** - Create custom hooks for complex state
- **Props interfaces** - Define explicit types for component props

```typescript
// Good - Server Component (default)
export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-bold">{ticket.title}</h3>
      <p className="text-gray-600">{ticket.description}</p>
    </div>
  );
}

// Good - Client Component (when needed)
"use client";

export function InteractiveTicket({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div onClick={() => setExpanded(!expanded)}>
      {/* ... */}
    </div>
  );
}
```

---

### API Routes

- **Return standardized JSON** responses
- **Use proper HTTP status codes** (200, 201, 400, 404, 500)
- **Validate inputs** before processing
- **Handle errors** with descriptive messages

```typescript
// Good - Standardized response format
export async function GET(request: NextRequest) {
  try {
    const tickets = await db.select().from(tickets);

    return Response.json({
      tickets,
      count: tickets.length,
    }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch tickets:", error);

    return Response.json({
      error: "Failed to fetch tickets",
      message: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
```

---

### Error Handling

- **Try/catch** around database operations and external API calls
- **Log errors** with context (include IDs, operation name)
- **Return user-friendly messages** (don't expose stack traces)
- **Use specific error types** when appropriate

```typescript
// Good
try {
  await db.update(tickets)
    .set({ state: "completed" })
    .where(eq(tickets.id, ticketId));
} catch (error) {
  console.error(`Failed to update ticket ${ticketId}:`, error);
  return Response.json(
    { error: "Failed to update ticket" },
    { status: 500 }
  );
}
```

---

## Common Development Tasks

### Adding a New Ticket State

1. **Update schema type:**
   ```typescript
   // src/db/schema.ts
   state: text("state").notNull(),
   // Valid values: draft, research, planning, implementation, review, completed
   ```

2. **Update state machine logic:**
   ```typescript
   // scripts/heartbeat-dispatch.ts
   const stateTransitions = {
     research: "planning",
     planning: "implementation",
     implementation: "review", // New state
     review: "completed",
   };
   ```

3. **Update UI to display new state:**
   ```typescript
   // src/components/ticket-card.tsx
   const stateColors = {
     draft: "gray",
     research: "blue",
     planning: "yellow",
     implementation: "orange",
     review: "purple", // New state
     completed: "green",
   };
   ```

---

### Modifying Agent Prompt

**Location:** `src/lib/prompt-builder.ts`

```typescript
export function buildAgentPrompt(
  ticket: Ticket,
  persona: Persona,
  phase: "research" | "planning" | "implementation"
): string {
  return `
You are ${persona.name}, a ${persona.role}.

${persona.personality}

Your task: ${ticket.title}
${ticket.description}

Acceptance criteria:
${ticket.acceptanceCriteria}

Available tools: ${getToolsForPhase(phase).join(", ")}

Instructions: ...
  `;
}
```

**Test changes:**
1. Create test ticket
2. Dispatch agent
3. Check `~/.bonsai/sessions/tkt_*/system-prompt.txt`

---

### Resetting Database for Testing

**Full reset with comprehensive data:**
```bash
npm run db:reset-test
```

**Minimal reset (schema only):**
```bash
rm bonsai-dev.db
npm run db:push
```

**Custom seed data:**
```typescript
// src/db/seed.ts
await db.insert(tickets).values([
  { id: "tkt_custom", title: "Custom ticket", state: "draft" },
]);
```

---

## Pull Request Guidelines

### Before Submitting

- [ ] Code passes type checking (`npm run type-check`)
- [ ] Code passes linting (`npm run lint`)
- [ ] Manually tested changes in development
- [ ] Database schema changes applied (`npm run db:push`)
- [ ] Documentation updated (if adding features)

---

### PR Description Template

```markdown
## What does this PR do?

Brief description of the changes.

## Why are we doing this?

Context and motivation. Link to ticket/issue if applicable.

## How can this be tested?

Step-by-step instructions:
1. Run `npm run db:reset-test`
2. Navigate to http://localhost:3000/tickets
3. Click on "New Ticket" button
4. Verify form validation works

## Screenshots (if applicable)

[Add screenshots here]

## Checklist

- [ ] Type checking passes
- [ ] Linting passes
- [ ] Manually tested
- [ ] Documentation updated
```

---

### Review Process

1. **Self-review** - Read your own changes before submitting
2. **Request review** - Tag relevant team members
3. **Address feedback** - Make requested changes promptly
4. **Merge** - Once approved, merge using squash and merge

---

## Questions?

If you need help:

1. **Check existing documentation:**
   - [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) - System design
   - [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
   - `docs/` - Detailed technical docs

2. **Search existing issues:** [GitHub Issues](https://github.com/coderaugment/bonsai-app/issues)

3. **Ask the team:** [Team communication channel]

---

**Last updated:** February 2026

This guide evolves as the codebase evolves. If you discover better patterns or find gaps in this documentation, please update it and submit a pull request.
