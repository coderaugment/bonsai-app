# Heartbeat Quickstart

Quick reference for installing and using the Bonsai heartbeat system.

## 🚀 Installation (5 minutes)

### Automated Installation

```bash
cd /Users/michaeloneal/development/bonsai/webapp
./scripts/install-heartbeat.sh
```

The installer will:
- ✓ Detect your OS (macOS/Linux)
- ✓ Validate prerequisites (Claude CLI, database, Node.js)
- ✓ Create required directories
- ✓ Install via launchd (macOS) or cron (Linux)
- ✓ Start the heartbeat service

### Manual Installation

**macOS:**
```bash
# Copy and customize plist
cp scripts/com.bonsai.heartbeat.plist ~/Library/LaunchAgents/
sed -i '' "s/{USER}/$USER/g" ~/Library/LaunchAgents/com.bonsai.heartbeat.plist

# Load service
launchctl load ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
```

**Linux:**
```bash
# Add to crontab
crontab -e

# Add this line:
*/5 * * * * /Users/michaeloneal/development/bonsai/webapp/scripts/heartbeat.sh dev
```

## 📋 Prerequisites

1. **Claude CLI** at `~/.local/bin/claude` ([install](https://claude.ai/code))
2. **Database** at `webapp/bonsai.db` or `webapp/bonsai-dev.db`
3. **Node.js** v20+ with npm/npx
4. **Git repository** for each project (optional - falls back to direct directory)

## 🧪 Testing

### Manual Test Run

```bash
cd webapp
./scripts/heartbeat.sh dev
```

Check logs:
```bash
tail -f ~/.bonsai/logs/heartbeat.log
```

### What Should Happen

1. Script checks for lock file
2. Queries database for tickets needing work
3. Dispatches agents (if tickets found)
4. Stores results in database
5. Exits cleanly

### Expected Output

```
2026-02-06T10:00:00 === Heartbeat starting (env=dev) ===
[2026-02-06 10:00:00] [dispatch] === Phase 1: RESEARCH ===
[2026-02-06 10:00:00] [dispatch]   found 2 ticket(s) needing research
[2026-02-06 10:00:00] [dispatch]   DISPATCH: ticket_123 "Add login page" → Alice (persona_abc)
[2026-02-06 10:00:05] [dispatch]   COMPLETE: ticket_123 — research stored (1234 chars)
[2026-02-06 10:00:05] [dispatch] === Phase 2: PLANNING ===
[2026-02-06 10:00:05] [dispatch]   no tickets need planning
[2026-02-06 10:00:05] [dispatch] === Phase 3: IMPLEMENTATION ===
[2026-02-06 10:00:05] [dispatch]   no tickets ready for implementation
2026-02-06T10:00:05 === Heartbeat completed (exit=0) ===
```

## 🔍 Monitoring

### Check Status

**macOS:**
```bash
launchctl list | grep bonsai
# Output: 12345  0  com.bonsai.heartbeat
```

**Linux:**
```bash
crontab -l | grep heartbeat
```

### View Logs

```bash
# Main log (timestamped)
tail -f ~/.bonsai/logs/heartbeat.log

# Last 50 lines
tail -50 ~/.bonsai/logs/heartbeat.log

# Search for errors
grep ERROR ~/.bonsai/logs/heartbeat.log

# Search for specific ticket
grep ticket_123 ~/.bonsai/logs/heartbeat.log
```

### Database Queries

```bash
cd webapp
sqlite3 bonsai-dev.db

-- Tickets needing research
SELECT id, title, state FROM tickets
WHERE state = 'backlog' AND research_completed_at IS NULL;

-- Recent agent activity
SELECT id, title, last_agent_activity
FROM tickets
WHERE last_agent_activity IS NOT NULL
ORDER BY last_agent_activity DESC
LIMIT 10;
```

## ⚙️ Configuration

### Environment

```bash
# Development mode (bonsai-dev.db)
./scripts/heartbeat.sh dev

# Production mode (bonsai.db)
./scripts/heartbeat.sh prod
```

### Frequency

**Default:** Every 5 minutes

**Change frequency (cron):**
```cron
# Every 10 minutes
*/10 * * * * ...

# Every hour
0 * * * * ...

# Every 30 minutes
*/30 * * * * ...
```

**Change frequency (launchd):**
Edit `~/Library/LaunchAgents/com.bonsai.heartbeat.plist`:
```xml
<key>StartInterval</key>
<integer>600</integer>  <!-- 10 minutes = 600 seconds -->
```

Then reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
launchctl load ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
```

## 🛠️ Troubleshooting

### Heartbeat not running

1. **Check if scheduled:**
   ```bash
   # macOS
   launchctl list | grep bonsai

   # Linux
   crontab -l | grep heartbeat
   ```

2. **Check logs for errors:**
   ```bash
   tail -50 ~/.bonsai/logs/heartbeat.log
   ```

3. **Check lock file:**
   ```bash
   cat ~/.bonsai/heartbeat.lock  # Shows PID
   ps aux | grep <PID>           # Check if running
   rm ~/.bonsai/heartbeat.lock   # Remove if stale
   ```

### No tickets being dispatched

1. **Check ticket state:**
   ```sql
   SELECT id, title, state, research_completed_at, last_agent_activity
   FROM tickets WHERE id = 'ticket_123';
   ```

2. **Check persona exists:**
   ```sql
   SELECT id, name, role, project_id FROM personas;
   ```

3. **Check if agent already active:**
   ```sql
   -- If last_agent_activity is within 30 minutes, ticket is skipped
   SELECT id, title,
          ROUND((julianday('now') - julianday(last_agent_activity)) * 1440, 1) AS minutes_ago
   FROM tickets WHERE id = 'ticket_123';
   ```

### Claude CLI errors

**Error:** `claude: command not found`

**Fix:**
```bash
# Check installation
which claude
ls -la ~/.local/bin/claude

# Add to PATH if needed (add to ~/.bashrc or ~/.zshrc)
export PATH="$PATH:$HOME/.local/bin"
```

### Database locked

**Error:** `database is locked`

**Fix:**
```bash
# Find processes with database open
lsof webapp/bonsai-dev.db

# Stop the process
kill <PID>

# Or close Drizzle Studio if running
```

## 🔄 Common Tasks

### Restart Service

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
launchctl load ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
```

**Linux:**
```bash
# No restart needed - cron picks up changes automatically
# Just verify crontab entry:
crontab -l | grep heartbeat
```

### Stop Service

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
```

**Linux:**
```bash
crontab -e
# Delete or comment out the heartbeat line
```

### Uninstall

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
rm ~/Library/LaunchAgents/com.bonsai.heartbeat.plist
```

**Linux:**
```bash
crontab -e
# Delete the heartbeat line
```

**Clean up data (optional):**
```bash
rm -rf ~/.bonsai/logs
rm -rf ~/.bonsai/sessions
# Worktrees are stored at {projectRoot}/worktrees/
# To clean: cd ~/development/bonsai/projects/{project} && rm -rf worktrees
```

## 📚 Learn More

- **Full documentation:** `scripts/README.md`
- **Implementation:** `scripts/heartbeat-dispatch.ts`
- **Project docs:** `CLAUDE.md`

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Install | `./scripts/install-heartbeat.sh` |
| Test manually | `./scripts/heartbeat.sh dev` |
| View logs | `tail -f ~/.bonsai/logs/heartbeat.log` |
| Check status (macOS) | `launchctl list \| grep bonsai` |
| Check status (Linux) | `crontab -l \| grep heartbeat` |
| Stop (macOS) | `launchctl unload ~/Library/LaunchAgents/com.bonsai.heartbeat.plist` |
| Stop (Linux) | `crontab -e` (delete line) |
| Database | `sqlite3 webapp/bonsai-dev.db` |
| Clean lock | `rm ~/.bonsai/heartbeat.lock` |

---

**Need help?** Check the full README: `scripts/README.md`
