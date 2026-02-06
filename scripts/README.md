# Bonsai Heartbeat System

The Bonsai heartbeat system automates the three-phase ticket lifecycle: **research → planning → implementation**. Every 5 minutes, the heartbeat dispatcher queries for tickets in each phase and assigns AI agents (personas) to advance them.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Heartbeat Dispatcher                      │
│              (heartbeat-dispatch.ts via cron/launchd)        │
└─────────────────────────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ RESEARCH │   │ PLANNING │   │   IMPL   │
        └──────────┘   └──────────┘   └──────────┘
              │              │              │
      ┌───────┴────┐   ┌─────┴─────┐   ┌───┴────┐
      │ Researcher │   │  Planner  │   │  Dev   │
      │  Persona   │   │  Persona  │   │ Persona│
      └────────────┘   └───────────┘   └────────┘
              │              │              │
              ▼              ▼              ▼
        Creates          Creates        Implements
        Research         Plan           Features
        Document         Document
```

### Three-Phase Lifecycle

1. **Research Phase**
   - **Trigger:** Ticket in `backlog` state, no research document
   - **Agent:** Researcher persona (read-only tools: Read, Grep, Glob, git)
   - **Output:** Research document stored in `ticket_documents` table
   - **Timeout:** 5 minutes
   - **Next:** Ticket remains in `backlog`, awaits manual approval

2. **Planning Phase**
   - **Trigger:** Ticket in `backlog` state, research approved, no plan document
   - **Agent:** Planner persona (read-only tools: Read, Grep, Glob, git)
   - **Output:** Implementation plan stored in `ticket_documents` table
   - **Timeout:** 5 minutes
   - **Next:** Ticket remains in `backlog`, awaits manual approval

3. **Implementation Phase**
   - **Trigger:** Ticket in `in_progress` state, plan approved
   - **Agent:** Developer persona (full tools: Read, Write, Edit, Bash, git)
   - **Output:** Code changes, commits, PR creation
   - **Timeout:** 10 minutes
   - **Next:** Ticket moves to `verification` state on completion

## How It Works

### Idempotency

The system is **idempotent** — safe to run multiple times without duplicating work. This is enforced via:

1. **`last_agent_activity` timestamp** — Set when agent starts work, cleared on completion/failure
2. **30-minute timeout** — If `last_agent_activity` is within 30 minutes, ticket is skipped
3. **Phase completion flags** — `research_completed_at`, `plan_approved_at` prevent re-running completed phases
4. **Lock file** — `~/.bonsai/heartbeat.lock` prevents concurrent heartbeat runs

### Concurrent Execution Safety

- **Lock file with PID check** — Only one heartbeat process runs at a time
- **Per-ticket activity tracking** — Prevents multiple agents on same ticket
- **Git worktree isolation** — Each ticket gets isolated workspace at `~/.bonsai/worktrees/{project}/{ticketId}`
- **Session isolation** — Agent sessions stored in `~/.bonsai/sessions/{ticketId}-{phase}/`

### Round-Robin Dispatch

When multiple projects have tickets needing work, the dispatcher uses **round-robin** scheduling to ensure fair distribution of agent time across projects.

## Installation

### Prerequisites

1. **Claude Code CLI** installed at `~/.local/bin/claude`
   ```bash
   # Verify installation
   which claude
   ~/.local/bin/claude --version
   ```

2. **Database** file exists at `webapp/bonsai.db` or `webapp/bonsai-dev.db`
   ```bash
   # Check database
   ls -lh webapp/bonsai.db
   ls -lh webapp/bonsai-dev.db
   ```

3. **Node.js** and **npm** available in PATH
   ```bash
   node --version  # v20.x or later
   npm --version
   ```

4. **Project dependencies** installed
   ```bash
   cd webapp
   npm install
   ```

### macOS Installation (launchd)

1. **Copy and customize plist:**
   ```bash
   # Copy template
   cp webapp/scripts/com.bonsai.heartbeat.plist ~/Library/LaunchAgents/

   # Edit to replace {USER} with your username
   sed -i '' "s/{USER}/$USER/g" ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
   ```

2. **Load the service:**
   ```bash
   launchctl load ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
   ```

3. **Verify it's running:**
   ```bash
   launchctl list | grep bonsai
   # Should show: 12345  0  com.bonsai.heartbeat
   ```

4. **Check logs:**
   ```bash
   tail -f ~/.bonsai/logs/heartbeat.log
   tail -f ~/.bonsai/logs/launchd.stdout.log
   ```

5. **Unload (if needed):**
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
   ```

### Linux Installation (cron)

1. **Edit crontab:**
   ```bash
   crontab -e
   ```

2. **Add entry** (replace `{USER}` with your username):
   ```cron
   # Bonsai heartbeat - runs every 5 minutes (dev mode)
   */5 * * * * /home/{USER}/development/bonsai/webapp/scripts/heartbeat.sh dev
   ```

3. **Verify installation:**
   ```bash
   crontab -l
   ```

4. **Check logs:**
   ```bash
   tail -f ~/.bonsai/logs/heartbeat.log
   ```

### Manual Testing

Run the heartbeat manually to verify everything works:

```bash
# Development mode
cd webapp
./scripts/heartbeat.sh dev

# Production mode
./scripts/heartbeat.sh prod

# Direct invocation (no shell wrapper)
BONSAI_ENV=dev npx tsx scripts/heartbeat-dispatch.ts

# With limit (max 1 ticket per phase)
BONSAI_ENV=dev npx tsx scripts/heartbeat-dispatch.ts --limit 1
```

## Configuration

### Environment Variables

- **`BONSAI_ENV`** — `dev` or `prod` (default: `prod`)
  - `dev` → uses `webapp/bonsai-dev.db`
  - `prod` → uses `webapp/bonsai.db`

### Command-Line Arguments

The `heartbeat-dispatch.ts` script accepts:

- **`--limit N`** — Process at most N tickets per phase (default: unlimited)
  ```bash
  npx tsx scripts/heartbeat-dispatch.ts --limit 3
  ```

### Timeouts

Configured in `heartbeat-dispatch.ts`:

- **`AGENT_ACTIVITY_TIMEOUT_MS`** — 30 minutes (how long `last_agent_activity` prevents re-dispatch)
- **`AGENT_MAX_DURATION_MS`** — 5 minutes (timeout for research/planning phases)
- **`DEVELOPER_MAX_DURATION_MS`** — 10 minutes (timeout for implementation phase)

### File Locations

```
~/.bonsai/                          # Bonsai home directory
├── logs/
│   ├── heartbeat.log              # Main heartbeat log (timestamped)
│   ├── launchd.stdout.log         # launchd stdout (macOS only)
│   └── launchd.stderr.log         # launchd stderr (macOS only)
├── sessions/
│   └── {ticketId}-{phase}/        # Agent session data
├── worktrees/
│   └── {project}/{ticketId}/      # Git worktree per ticket
├── heartbeat.lock                 # Lock file (PID inside)
└── vault.age                      # Encrypted secrets (GitHub tokens)

webapp/
├── bonsai.db                      # Production database
├── bonsai-dev.db                  # Development database
└── scripts/
    ├── heartbeat.sh               # Shell wrapper (invoked by cron/launchd)
    ├── heartbeat-dispatch.ts      # Main dispatcher logic
    ├── com.bonsai.heartbeat.plist # launchd config (macOS)
    └── crontab.example            # cron config (Linux)
```

## Monitoring

### Check Status

**macOS (launchd):**
```bash
# Check if loaded
launchctl list | grep bonsai

# View recent runs (system log)
log show --predicate 'process == "launchd"' --last 1h | grep bonsai
```

**Linux (cron):**
```bash
# View crontab
crontab -l

# Check syslog for cron execution
grep CRON /var/log/syslog | tail -20
```

### View Logs

```bash
# Main heartbeat log
tail -f ~/.bonsai/logs/heartbeat.log

# Search for errors
grep ERROR ~/.bonsai/logs/heartbeat.log

# Search for specific ticket
grep "ticket_123" ~/.bonsai/logs/heartbeat.log

# View launchd logs (macOS)
tail -f ~/.bonsai/logs/launchd.stdout.log
tail -f ~/.bonsai/logs/launchd.stderr.log
```

### Database Queries

Check ticket states:
```bash
cd webapp
sqlite3 bonsai-dev.db

-- Tickets awaiting research
SELECT id, title, state, last_agent_activity
FROM tickets
WHERE state = 'backlog' AND research_completed_at IS NULL;

-- Tickets awaiting planning
SELECT id, title, state, last_agent_activity
FROM tickets
WHERE state = 'backlog'
  AND research_completed_at IS NOT NULL
  AND plan_approved_at IS NULL;

-- Tickets being implemented
SELECT id, title, state, last_agent_activity, assignee_id
FROM tickets
WHERE state = 'in_progress';

-- Recent agent activity
SELECT id, title, last_agent_activity,
       ROUND((julianday('now') - julianday(last_agent_activity)) * 1440, 1) AS minutes_ago
FROM tickets
WHERE last_agent_activity IS NOT NULL
ORDER BY last_agent_activity DESC
LIMIT 10;
```

## Troubleshooting

### Heartbeat not running

**Check 1: Is it scheduled?**
```bash
# macOS
launchctl list | grep bonsai

# Linux
crontab -l | grep heartbeat
```

**Check 2: Is lock file stale?**
```bash
cat ~/.bonsai/heartbeat.lock  # Shows PID
ps aux | grep <PID>            # Check if process exists
rm ~/.bonsai/heartbeat.lock    # Remove if stale
```

**Check 3: Check logs for errors**
```bash
tail -50 ~/.bonsai/logs/heartbeat.log
tail -50 ~/.bonsai/logs/launchd.stderr.log  # macOS only
```

### Agent not dispatching

**Check 1: Ticket state correct?**
```sql
SELECT id, title, state, research_completed_at, plan_approved_at
FROM tickets WHERE id = 'ticket_123';
```

**Check 2: Is agent already active?**
```sql
SELECT id, title, last_agent_activity,
       ROUND((julianday('now') - julianday(last_agent_activity)) * 1440, 1) AS minutes_ago
FROM tickets WHERE id = 'ticket_123';
```
If `minutes_ago < 30`, agent is considered active (idempotency guard).

**Check 3: Persona exists for project?**
```sql
SELECT id, name, role, project_id FROM personas WHERE project_id = 'proj_xyz';
```

**Check 4: Research/plan document exists?**
```sql
SELECT id, type, created_at FROM ticket_documents WHERE ticket_id = 'ticket_123';
```

### Claude CLI not found

**Error:** `claude: command not found`

**Fix:**
```bash
# Check if installed
which claude

# If not found, check common locations
ls -la ~/.local/bin/claude
ls -la /usr/local/bin/claude

# Add to PATH in shell wrapper or plist
export PATH="$PATH:$HOME/.local/bin"
```

### Database locked

**Error:** `database is locked`

**Cause:** Another process has the database open (e.g., Drizzle Studio, another agent)

**Fix:**
```bash
# Check for processes with database open
lsof webapp/bonsai-dev.db

# Stop conflicting process
kill <PID>

# Or close Drizzle Studio
# Or wait for timeout (30 seconds default)
```

### Timeout too short

**Symptom:** Agent work appears incomplete, logs show timeout

**Fix:** Edit `heartbeat-dispatch.ts` constants:
```typescript
const AGENT_MAX_DURATION_MS = 10 * 60 * 1000; // Increase to 10 minutes
const DEVELOPER_MAX_DURATION_MS = 20 * 60 * 1000; // Increase to 20 minutes
```

### Log files growing too large

**Symptom:** `~/.bonsai/logs/heartbeat.log` is multiple GB

**Fix:** Log rotation is automatic (7 days), but you can manually clean:
```bash
# Archive old logs
gzip ~/.bonsai/logs/heartbeat.log

# Or delete entirely
rm ~/.bonsai/logs/heartbeat.log

# launchd logs rotate automatically (macOS)
```

### Worktree creation fails

**Error:** `fatal: cannot create worktree`

**Causes:**
1. Not a git repository
2. Worktree already exists
3. Branch name conflict

**Fix:**
```bash
# Remove stale worktree
git worktree remove ~/.bonsai/worktrees/{project}/{ticketId}

# Or prune all stale worktrees
git worktree prune

# Or let heartbeat fall back to main repo (automatic)
```

## Architecture Details

### Database Schema

**Tickets Table:**
```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  state TEXT CHECK(state IN ('backlog', 'in_progress', 'verification', 'done')),
  project_id TEXT REFERENCES projects(id),
  assignee_id TEXT REFERENCES personas(id),

  -- Agent lifecycle tracking
  last_agent_activity TEXT,           -- ISO timestamp
  research_completed_at TEXT,          -- ISO timestamp
  research_completed_by TEXT,          -- persona_id
  plan_approved_at TEXT,               -- ISO timestamp
  plan_approved_by TEXT,               -- persona_id

  -- Metadata
  acceptance_criteria TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Ticket Documents Table:**
```sql
CREATE TABLE ticket_documents (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  type TEXT CHECK(type IN ('research', 'implementation_plan')),
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(ticket_id, type, version)
);
```

**Personas Table:**
```sql
CREATE TABLE personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('researcher', 'planner', 'developer', 'reviewer')),
  personality TEXT,
  skills TEXT,  -- JSON array
  project_id TEXT REFERENCES projects(id),
  role_id TEXT,  -- Which role definition template
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Phase Queries

**Research Phase:**
```sql
SELECT t.id, t.title, t.description, t.project_id
FROM tickets t
LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'research'
WHERE t.state = 'backlog'
  AND t.research_completed_at IS NULL
  AND td.id IS NULL  -- No research document exists
  AND (t.last_agent_activity IS NULL OR
       julianday('now') - julianday(t.last_agent_activity) > 0.0208)  -- 30 min
```

**Planning Phase:**
```sql
SELECT t.id, t.title, t.description, t.project_id
FROM tickets t
LEFT JOIN ticket_documents td ON td.ticket_id = t.id AND td.type = 'implementation_plan'
WHERE t.state = 'backlog'
  AND t.research_completed_at IS NOT NULL  -- Research done
  AND t.plan_approved_at IS NULL           -- Plan not approved yet
  AND td.id IS NULL                        -- No plan document exists
  AND (t.last_agent_activity IS NULL OR
       julianday('now') - julianday(t.last_agent_activity) > 0.0208)
```

**Implementation Phase:**
```sql
SELECT t.id, t.title, t.description, t.project_id, t.assignee_id
FROM tickets t
WHERE t.state = 'in_progress'
  AND t.plan_approved_at IS NOT NULL  -- Plan approved
  AND (t.last_agent_activity IS NULL OR
       julianday('now') - julianday(t.last_agent_activity) > 0.0208)
```

### Workflow State Diagram

```
[backlog] ──(no research)──> [DISPATCH RESEARCHER]
    │                              │
    │                              ▼
    │                        [research document]
    │                              │
    │◄──────(research done)────────┘
    │
    │
[backlog] ──(research, no plan)──> [DISPATCH PLANNER]
    │                                   │
    │                                   ▼
    │                            [plan document]
    │                                   │
    │◄────(plan done, awaits approval)──┘
    │
    │───(user approves plan)───> [in_progress]
    │                                   │
    │                                   │
[in_progress] ──(plan approved)──> [DISPATCH DEVELOPER]
    │                                   │
    │                                   ▼
    │                            [commits, PR]
    │                                   │
    │◄────(implementation done)─────────┘
    │
    │
    └──> [verification] ──(tests pass)──> [done]
```

## Development

### Running Tests

```bash
# Manual test - single ticket research
BONSAI_ENV=dev npx tsx scripts/heartbeat-dispatch.ts --limit 1

# Check what would be dispatched (dry run)
# (Not implemented - add if needed)

# Test lock file mechanism
./scripts/heartbeat.sh dev &    # Run in background
./scripts/heartbeat.sh dev      # Should exit immediately (locked)
```

### Debugging

Add debug logging:
```typescript
// In heartbeat-dispatch.ts
const DEBUG = process.env.DEBUG === '1';

function debugLog(msg: string) {
  if (DEBUG) log(`[DEBUG] ${msg}`);
}
```

Run with debug:
```bash
DEBUG=1 BONSAI_ENV=dev npx tsx scripts/heartbeat-dispatch.ts
```

### Modifying Timeouts

Edit constants in `heartbeat-dispatch.ts`:
```typescript
const AGENT_ACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;    // 30 min → 60 min
const AGENT_MAX_DURATION_MS = 5 * 60 * 1000;         // 5 min → 10 min
const DEVELOPER_MAX_DURATION_MS = 10 * 60 * 1000;    // 10 min → 20 min
```

## Security Considerations

1. **Lock file PID check** — Prevents unauthorized removal during active run
2. **Worktree isolation** — Each ticket in separate workspace prevents interference
3. **Tool restrictions** — Research/planning phases are read-only (no writes)
4. **Vault encryption** — GitHub tokens stored in age-encrypted vault
5. **Session isolation** — Agent sessions in separate directories
6. **Log file permissions** — Created with user-only read/write (0600)

## Performance

- **Round-robin** ensures fair distribution across projects
- **Concurrent limit** (`MAX_CONCURRENT = 2`) prevents resource exhaustion
- **Timeouts** prevent runaway agents
- **Lock file** prevents overlapping runs
- **SQLite WAL mode** (if enabled) allows concurrent reads during agent runs

## Future Enhancements

Potential improvements (out of scope for current ticket):

1. **Web dashboard** — Monitor agent activity, view logs, approve plans
2. **Metrics collection** — Track agent success rates, average durations, ticket velocity
3. **Alerting** — Slack/email notifications for failures or stuck tickets
4. **Retry logic** — Exponential backoff for failed agents
5. **Priority queue** — High-priority tickets processed first
6. **Multi-machine support** — Distributed dispatch with leader election
7. **Dry-run mode** — Preview what would be dispatched without executing
8. **Agent quotas** — Limit agent minutes per project per day

---

For questions or issues, check:
- Main documentation: `CLAUDE.md`
- Agent runtime: `agent/README.md` (if exists)
- Database schema: `webapp/src/db/schema.ts`
- Issue tracker: GitHub issues for this repository
