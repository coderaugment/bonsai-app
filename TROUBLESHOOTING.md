# Troubleshooting Guide

**Last updated:** February 2026

This guide helps you diagnose and fix common issues when developing Bonsai Developer OS.

---

## Table of Contents

1. [Installation Verification](#installation-verification)
2. [Common Error Messages](#common-error-messages)
3. [Agent Execution Issues](#agent-execution-issues)
4. [Database Issues](#database-issues)
5. [Development Environment Issues](#development-environment-issues)
6. [Getting Help](#getting-help)

---

## Installation Verification

Run these checks after completing [DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md):

### Post-Installation Checklist

- [ ] **Node.js version:** `node --version` (should be v22.x+)
- [ ] **npm version:** `npm --version` (should be 9.x+)
- [ ] **Claude CLI installed:** `~/.local/bin/claude --version` (should show version number)
- [ ] **Agent package built:** `ls -la ../agent/dist/` (should have .js files)
- [ ] **Agent package linked:** `npm list -g @bonsai/agent` (should show symlink)
- [ ] **Database exists:** `ls -lh bonsai-dev.db` (should be 100KB+ after seeding)
- [ ] **Vault initialized:** `ls -la ~/.bonsai/vault-key.txt` (should exist)
- [ ] **Dev server starts:** `npm run dev` (no errors, shows port 3000)
- [ ] **UI loads:** Visit http://localhost:3000 (should show Bonsai UI)
- [ ] **Sample data:** Check for tickets in UI (from `db:reset-test`)

### Quick Verification Commands

```bash
# Check Node.js version
node --version

# Check Claude CLI
~/.local/bin/claude --version

# Check database file
ls -lh bonsai-dev.db

# Check vault files
ls -la ~/.bonsai/vault-key.txt ~/.bonsai/vault.age

# Check agent package
cd ../agent && ls -la dist/

# Check if dev server can start
npm run dev
# Ctrl+C to stop
```

---

## Common Error Messages

### "Module not found: @bonsai/agent"

**Cause:** Agent package not built or not linked properly.

**Solution:**

```bash
# Step 1: Build agent package
cd ../agent
npm install
npm run build

# Step 2: Link agent package globally
npm link

# Step 3: Link in webapp
cd ../webapp
npm link @bonsai/agent

# Step 4: Restart dev server
npm run dev
```

**Verify fix:**
```bash
# Check that dist/ exists in agent package
ls ../agent/dist/

# Check that link exists
npm list -g @bonsai/agent
# Should show: @bonsai/agent@1.0.0 -> /path/to/agent
```

---

### "ANTHROPIC_API_KEY is not set"

**Cause:** Missing or incorrect environment variable.

**Solution:**

1. **Check that `.env.local` exists:**
   ```bash
   ls -la .env.local
   ```

2. **If missing, create it:**
   ```bash
   cp .env.development .env.local
   ```

3. **Edit `.env.local` and add your API key:**
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-...your-key-here...
   BONSAI_ENV=dev
   ```

4. **Restart dev server:**
   ```bash
   npm run dev
   ```

**Verify fix:**
```bash
# Check that .env.local contains the key
grep ANTHROPIC_API_KEY .env.local
# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

---

### "Database locked" or "SQLITE_BUSY"

**Cause:** Multiple processes accessing the same database file.

**Solution:**

```bash
# Step 1: Stop all node processes
pkill -f "node"

# Step 2: Remove SQLite journal files
rm -f *.db-journal *.db-wal

# Step 3: Close Drizzle Studio if running
# (It keeps a connection open)

# Step 4: Restart dev server
npm run dev
```

**Prevent this issue:**
- Only run one `npm run dev` instance
- Close Drizzle Studio when not using it
- Avoid running database scripts while dev server is running

---

### "Claude CLI not found"

**Cause:** Claude CLI not installed or not in PATH.

**Solution:**

1. **Check if Claude CLI exists:**
   ```bash
   ls ~/.local/bin/claude
   ```

2. **If not found, install Claude CLI:**
   - Visit: https://claude.ai/cli
   - Follow installation instructions
   - Or run: `brew install anthropic/claude/claude` (macOS)

3. **Verify installation:**
   ```bash
   ~/.local/bin/claude --version
   ```

4. **Add to PATH if needed:**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

5. **Verify PATH:**
   ```bash
   which claude
   # Should show: /Users/yourname/.local/bin/claude
   ```

---

### "Port 3000 already in use"

**Cause:** Another application is using port 3000.

**Solution:**

**Option 1: Use a different port**
```bash
PORT=3001 npm run dev
```

**Option 2: Kill the process using port 3000**
```bash
# Find process ID
lsof -ti:3000

# Kill it
lsof -ti:3000 | xargs kill -9

# Start dev server
npm run dev
```

**Option 3: Change default port in package.json**
```json
{
  "scripts": {
    "dev": "next dev --port 3001"
  }
}
```

---

### "Cannot decrypt vault" or vault errors

**Cause:** Vault key file corrupted, missing, or permissions issue.

**Check vault files:**
```bash
ls -la ~/.bonsai/vault-key.txt ~/.bonsai/vault.age
```

**Solution (WARNING: This will delete all stored secrets):**

```bash
# Backup existing vault (if you want to try recovering it)
cp ~/.bonsai/vault-key.txt ~/.bonsai/vault-key.txt.backup
cp ~/.bonsai/vault.age ~/.bonsai/vault.age.backup

# Remove vault files
rm ~/.bonsai/vault-key.txt ~/.bonsai/vault.age

# Restart app to regenerate
npm run dev
```

After regeneration, you'll need to re-enter any API keys or tokens.

**Recovery attempt (if you have backup):**
```bash
# Restore backup
cp ~/.bonsai/vault-key.txt.backup ~/.bonsai/vault-key.txt
cp ~/.bonsai/vault.age.backup ~/.bonsai/vault.age

# Check permissions
chmod 600 ~/.bonsai/vault-key.txt
chmod 600 ~/.bonsai/vault.age

# Try again
npm run dev
```

---

### "TypeScript errors" after `git pull`

**Cause:** Dependencies or agent package out of sync.

**Solution:**

```bash
# Step 1: Reinstall webapp dependencies
npm install

# Step 2: Rebuild agent package
cd ../agent
npm install
npm run build
cd ../webapp

# Step 3: Clear Next.js cache
rm -rf .next

# Step 4: Restart dev server
npm run dev
```

**If errors persist:**
```bash
# Check TypeScript version
npm list typescript

# Run type checking to see specific errors
npm run type-check
```

---

### "Hot reload not working"

**Cause:** Next.js cache corruption or file watcher issues.

**Solution:**

```bash
# Step 1: Clear Next.js cache
rm -rf .next

# Step 2: Restart dev server
npm run dev
```

**If still not working:**

```bash
# Check if file watcher is running
ps aux | grep "next"

# Increase file watcher limit (macOS)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Or on macOS
launchctl limit maxfiles 65536 200000
```

---

## Agent Execution Issues

### Agent not starting after dispatch

**Symptoms:** Click dispatch button, but nothing happens.

**Diagnosis:**

1. **Check session directory was created:**
   ```bash
   ls -la ~/.bonsai/sessions/
   # Should show directory for your ticket
   ```

2. **Check stderr.log for errors:**
   ```bash
   cat ~/.bonsai/sessions/tkt_*-comment-*/stderr.log
   ```

3. **Verify Claude CLI works:**
   ```bash
   echo "test" | ~/.local/bin/claude
   ```

**Common causes and solutions:**

**Cause: Claude CLI not installed**
```bash
# Install Claude CLI
# See "Claude CLI not found" section above
```

**Cause: API key not configured**
```bash
# Check .env.local has ANTHROPIC_API_KEY
grep ANTHROPIC_API_KEY .env.local
```

**Cause: Claude CLI not authenticated**
```bash
# Login to Claude CLI
~/.local/bin/claude login
```

---

### Agent completes but no output

**Symptoms:** Agent runs, but output.md is empty or missing.

**Diagnosis:**

1. **Check if output.md exists:**
   ```bash
   ls -la ~/.bonsai/sessions/tkt_*-comment-*/output.md
   ```

2. **Read output file:**
   ```bash
   cat ~/.bonsai/sessions/tkt_*-comment-*/output.md
   ```

3. **Check stderr for webhook errors:**
   ```bash
   grep "webhook" ~/.bonsai/sessions/tkt_*-comment-*/stderr.log
   ```

**Solutions:**

**If output.md is empty:**
- Agent may have crashed or timed out
- Check stderr.log for error messages
- Try re-dispatching with simpler task

**If webhook failed:**
- Check dev server is running
- Verify `/api/tickets/[id]/agent-complete` endpoint works
- Check database for ticket state changes

---

### Agent stuck in "in_progress" state

**Symptoms:** Ticket shows agent is working, but no updates for a long time.

**Diagnosis:**

1. **Check if Claude process is still running:**
   ```bash
   ps aux | grep claude
   ```

2. **Check session files for recent activity:**
   ```bash
   ls -lt ~/.bonsai/sessions/
   ```

3. **Read stderr.log for last activity:**
   ```bash
   tail -50 ~/.bonsai/sessions/tkt_*-comment-*/stderr.log
   ```

**Solutions:**

**If process is frozen:**
```bash
# Kill the claude process
pkill -f "claude.*tkt_"

# Manually update ticket state in database
sqlite3 bonsai-dev.db
UPDATE tickets SET state = 'draft' WHERE id = 'tkt_XXX';
.quit
```

**If process finished but didn't update database:**
- Check webhook endpoint logs
- Manually trigger agent-complete webhook
- Check database connection

---

### Agent error: "Tool not allowed"

**Symptoms:** Agent tries to use a tool but gets permission error.

**Cause:** Tool restrictions based on agent role.

**Expected behavior:**
- **Researcher/Designer:** Read-only tools (Read, Grep, Glob, Bash git)
- **Developer/Manager:** Full tools (Read, Grep, Glob, Write, Edit, Bash)

**Solution:** Assign ticket to correct role, or update role tool restrictions in code.

---

## Database Issues

### Schema out of sync

**Symptoms:** Database queries fail with "no such column" or similar errors.

**Solution:**

```bash
# Apply latest schema changes
npm run db:push
```

**If that doesn't work:**

```bash
# Full database reset (WARNING: Deletes all data)
rm bonsai-dev.db
npm run db:push
npm run db:reset-test
```

---

### Want fresh start with test data

**Solution:**

```bash
# Full reset with comprehensive test data
npm run db:reset-test
```

This will:
- Drop all existing data
- Recreate schema
- Seed with sample personas, tickets, projects
- Useful for testing and development

---

### Inspect database contents

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
.mode column               # Better formatting
.headers on                # Show column names
.quit                      # Exit
```

**Option 3: DB Browser for SQLite**
- Download: https://sqlitebrowser.org/
- Open `bonsai-dev.db`
- GUI for browsing and editing

---

### Database file disappeared

**Cause:** Wrong `BONSAI_ENV` or database file deleted.

**Check which database file should be used:**

```bash
# Development uses bonsai-dev.db
echo $BONSAI_ENV
# Should show: dev

# Check if file exists
ls -la bonsai-dev.db bonsai.db
```

**Solution:**

```bash
# Recreate database
npm run db:push
npm run db:reset-test
```

---

## Development Environment Issues

### Changes to agent package not reflected

**Symptoms:** Modified agent code, but changes don't appear in webapp.

**Solution:**

```bash
# Step 1: Rebuild agent package
cd ../agent
npm run build

# Step 2: Verify dist/ updated
ls -lt dist/ | head -5
# Should show recent timestamps

# Step 3: Restart webapp dev server
cd ../webapp
npm run dev
```

**If still not working:**

```bash
# Relink packages
cd ../agent
npm link
cd ../webapp
npm link @bonsai/agent
npm run dev
```

---

### Next.js build errors

**Symptoms:** `npm run build` fails.

**Common causes:**

**TypeScript errors:**
```bash
# Check for type errors
npm run type-check
```

**Linting errors:**
```bash
# Check for lint errors
npm run lint

# Auto-fix where possible
npm run lint:fix
```

**Out of memory:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

### Environment variables not loading

**Symptoms:** `process.env.SOME_VAR` is undefined.

**Check which environment file is used:**

- `.env.local` - Overrides everything, loaded first
- `.env.development` - Used in development mode
- `.env.production` - Used in production mode

**Solution:**

```bash
# Check if .env.local exists
ls -la .env.local

# Check variable is defined
grep YOUR_VAR_NAME .env.local

# Restart dev server (required after env changes)
npm run dev
```

**Client-side variables:**

- Must be prefixed with `NEXT_PUBLIC_`
- Example: `NEXT_PUBLIC_FEATURE_FLAG=true`
- Server-side variables work without prefix

---

### Git issues

**Uncommitted changes lost:**
```bash
# Check git reflog
git reflog

# Find lost commit
git show <commit-hash>

# Restore if found
git cherry-pick <commit-hash>
```

**Wrong branch:**
```bash
# Check current branch
git branch

# Switch branches
git checkout main
```

**Merge conflicts:**
```bash
# Check status
git status

# Resolve conflicts in files marked with <<<<<<<
# Then stage and commit
git add .
git commit -m "Resolve merge conflicts"
```

---

## Getting Help

If you encounter issues not covered in this guide:

### 1. Check Existing Documentation

- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** - Setup instructions
- **[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md)** - System design
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflow
- **`docs/`** - Detailed technical documentation

### 2. Search Existing Issues

- [GitHub Issues](https://github.com/coderaugment/bonsai-app/issues)
- Search for your error message or symptom
- Check both open and closed issues

### 3. File a Bug Report

If you've found a new issue:

1. **Gather information:**
   - Exact error message
   - Steps to reproduce
   - Environment (OS, Node version, etc.)
   - Relevant logs (stderr.log, console output)

2. **Create issue:**
   - Use issue template
   - Include reproduction steps
   - Attach logs if helpful

3. **Example bug report:**
   ```markdown
   **Issue:** Agent dispatch fails with "Module not found"

   **Environment:**
   - OS: macOS 14.0
   - Node: v22.1.0
   - Branch: main (commit abc123)

   **Steps to reproduce:**
   1. Run `npm run dev`
   2. Create new ticket
   3. Click "Dispatch Agent"
   4. Error appears in console

   **Error message:**
   ```
   Module not found: Can't resolve '@bonsai/agent'
   ```

   **What I tried:**
   - Ran `npm install`
   - Rebuilt agent package
   - Still getting error
   ```

### 4. Ask the Team

- Team chat: [Slack/Discord channel]
- Tag relevant team members
- Provide context and what you've tried

---

## Contributing Fixes

Found a solution not documented here? **Please add it!**

1. Edit this file (TROUBLESHOOTING.md)
2. Add your solution under the appropriate section
3. Submit a pull request
4. Help future developers avoid the same issue

---

**Last updated:** February 2026

This troubleshooting guide evolves as new issues are discovered. If you find a solution to a problem, please document it here for others.
