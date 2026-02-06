# Developer Setup Guide

**Last updated:** February 2026

This guide will help you set up the Bonsai Developer OS codebase for local development. By the end of this guide, you'll have a fully functional development environment with the application running on your local machine.

**Estimated setup time:** 30 minutes

---

## Prerequisites Checklist

Before starting, ensure you have the following installed:

- **Node.js 22.x or later** - [Download here](https://nodejs.org/)
  - Verify: `node --version` should show v22.x or higher

- **npm** (comes with Node.js)
  - Verify: `npm --version`

- **Git**
  - Verify: `git --version`

- **Claude CLI** - Required for agent execution
  - Install: Follow instructions at [claude.ai/cli](https://claude.ai/cli)
  - Verify: `~/.local/bin/claude --version`
  - The Claude CLI should be located at `~/.local/bin/claude`

- **Anthropic API Key OR Claude Max subscription**
  - Get API key from: [console.anthropic.com](https://console.anthropic.com/)
  - Or use Claude Max session (requires Claude CLI login)

- **GitHub Personal Access Token** (optional, for GitHub integration testing)
  - Create at: [github.com/settings/tokens](https://github.com/settings/tokens)
  - Scopes needed: `repo`, `read:user`

---

## Monorepo Structure

Bonsai is organized as a monorepo with three packages:

```
development/bonsai/
├── agent/          # Agent runtime package (@bonsai/agent)
│                   # TypeScript package with agent roles and execution logic
├── webapp/         # Next.js application (main codebase)
│                   # This is where most development happens
└── docs/           # Architecture documentation (15+ detailed docs)
```

**Important:** The webapp depends on the agent package, so you must build the agent package first.

---

## Step-by-Step Installation

### Step 1: Clone and Navigate

```bash
# Clone the repository
git clone <repository-url>
cd development/bonsai
```

### Step 2: Build Agent Package First (Required)

The webapp depends on `@bonsai/agent`, so we must build this package first:

```bash
cd agent
npm install
npm run build
npm link  # Makes @bonsai/agent available locally
```

**What this does:**
- Installs agent package dependencies
- Compiles TypeScript to JavaScript in `agent/dist/`
- Creates a global symlink so webapp can use it

**Verify:** Check that `agent/dist/` directory exists and contains `.js` files.

### Step 3: Setup Webapp

Now we can install and configure the main application:

```bash
cd ../webapp
npm install
npm link @bonsai/agent  # Link to the local agent package
```

⚠️ **Common issue:** If you get "Module not found: @bonsai/agent" errors later, you need to repeat the `npm link` steps above.

### Step 4: Configure Environment

Create your local environment file:

```bash
cp .env.development .env.local
```

Edit `.env.local` and add your Anthropic API key:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
BONSAI_ENV=dev
```

**Environment variables explained:**

- **`ANTHROPIC_API_KEY`** (required) - Your Claude API key for agent execution
- **`BONSAI_ENV`** (default: `dev`) - Switches between `bonsai-dev.db` (dev) and `bonsai.db` (production)
- **`DATABASE_URL`** (auto-configured) - SQLite database path
- **`GITHUB_TOKEN`** (optional) - Only needed for testing GitHub integration features

### Step 5: Initialize Database

Create the database schema and populate it with sample data:

```bash
# Create database tables
npm run db:push

# Seed with comprehensive test data
npm run db:reset-test
```

**What this does:**
- `db:push` - Creates SQLite database file (`bonsai-dev.db`) with all tables
- `db:reset-test` - Drops all data and repopulates with sample tickets, personas, and projects

**Verify:** Check that `bonsai-dev.db` exists and is ~100KB or larger:
```bash
ls -lh bonsai-dev.db
```

### Step 6: Verify Setup

Start the development server:

```bash
npm run dev
```

You should see output like:
```
▲ Next.js 16.1.6
- Local:        http://localhost:3000
- Network:      http://192.168.x.x:3000

✓ Ready in 2.3s
```

**Open your browser** to [http://localhost:3000](http://localhost:3000)

You should see the Bonsai Developer OS interface with sample tickets from the seed data.

---

## Encrypted Vault System

Bonsai uses **age-encryption** (public-key cryptography) to securely store API keys and tokens.

**How it works:**

1. **Auto-initialization** - On first run, Bonsai generates a keypair:
   - Private key: `~/.bonsai/vault-key.txt` (keep this secure!)
   - Encrypted secrets: `~/.bonsai/vault.age`

2. **Migration** - Bonsai automatically migrates plaintext secrets (like GitHub tokens) from the database to the encrypted vault

3. **Security model:**
   - Private key never leaves your local machine
   - All secrets are encrypted at rest
   - Uses age-encryption standard (https://age-encryption.org/)

**Vault locations:**
```bash
~/.bonsai/vault-key.txt    # Your private key (backup this file!)
~/.bonsai/vault.age        # Encrypted secrets storage
```

**Backup recommendation:** Save `~/.bonsai/vault-key.txt` to a secure location. If you lose this file, you'll lose access to all encrypted secrets.

---

## Verification Checklist

After completing the setup, verify everything works:

- [ ] ✅ Dev server starts without errors (`npm run dev`)
- [ ] ✅ Can access http://localhost:3000
- [ ] ✅ Database shows sample tickets in the UI (from seed data)
- [ ] ✅ Can click on a ticket to view details
- [ ] ✅ Can create a new ticket via the UI
- [ ] ✅ Vault initialized successfully (check `ls ~/.bonsai/vault-key.txt`)
- [ ] ✅ Claude CLI is accessible (`~/.local/bin/claude --version`)
- [ ] ✅ No console errors in browser DevTools

**Optional verification:**
- [ ] Can trigger agent dispatch on a ticket (requires Claude CLI setup)
- [ ] Agent session directory created at `~/.bonsai/sessions/`

---

## Common Issues & Solutions

### "Module not found: @bonsai/agent"

**Cause:** Agent package not built or not linked properly.

**Solution:**
```bash
cd ../agent
npm run build
npm link
cd ../webapp
npm link @bonsai/agent
npm run dev  # Restart dev server
```

---

### "ANTHROPIC_API_KEY is not set"

**Cause:** Missing or incorrect environment variable.

**Solution:**
1. Check that `.env.local` exists in webapp root
2. Verify it contains: `ANTHROPIC_API_KEY=sk-ant-...`
3. Restart dev server: `Ctrl+C` then `npm run dev`

---

### "Database locked" or "SQLITE_BUSY"

**Cause:** Multiple processes accessing the same database file.

**Solution:**
```bash
# Stop all node processes
pkill -f "node"

# Remove SQLite journal files
rm -f *.db-journal *.db-wal

# Restart dev server
npm run dev
```

---

### "Claude CLI not found"

**Cause:** Claude CLI not installed or not in PATH.

**Solution:**
1. Install Claude CLI: https://claude.ai/cli
2. Verify installation: `which claude` should show `~/.local/bin/claude`
3. If not in PATH, add to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```
4. Reload shell: `source ~/.zshrc` (or `~/.bashrc`)

---

### "Port 3000 already in use"

**Cause:** Another application is using port 3000.

**Solution:**
```bash
# Option 1: Use a different port
PORT=3001 npm run dev

# Option 2: Kill the process using port 3000
lsof -ti:3000 | xargs kill -9
npm run dev
```

---

### "Cannot decrypt vault" or vault errors

**Cause:** Vault key file corrupted or missing.

**Solution (WARNING: This will delete all stored secrets):**
```bash
rm ~/.bonsai/vault-key.txt ~/.bonsai/vault.age
npm run dev  # Vault will auto-regenerate on next run
```

You'll need to re-enter any API keys or tokens after regeneration.

---

### TypeScript errors after `git pull`

**Cause:** Dependencies or agent package out of sync.

**Solution:**
```bash
# Reinstall webapp dependencies
npm install

# Rebuild agent package
cd ../agent
npm run build
cd ../webapp

# Restart dev server
npm run dev
```

---

### Hot reload not working

**Cause:** Next.js cache corruption or file watcher issues.

**Solution:**
```bash
# Clear Next.js cache
rm -rf .next

# Restart with fresh cache
npm run dev
```

---

## Database Management

### Useful database commands:

```bash
# Apply schema changes (after editing src/db/schema.ts)
npm run db:push

# Add sample data to existing database
npm run db:seed

# Full reset with comprehensive test data
npm run db:reset-test

# Inspect database with Drizzle Studio (web UI)
npx drizzle-kit studio
```

### Database files:

- **Development:** `bonsai-dev.db` (when `BONSAI_ENV=dev`)
- **Production:** `bonsai.db` (when `BONSAI_ENV=production`)

The environment variable determines which database file is used.

---

## Next Steps

Now that you have Bonsai running locally, here's what to explore next:

1. **Understand the architecture** - Read [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) to learn how the system works

2. **Learn the workflow** - Read [CONTRIBUTING.md](./CONTRIBUTING.md) to understand how to add features and make changes

3. **Explore the codebase:**
   - `src/app/api/tickets/` - Ticket management API routes
   - `src/db/schema.ts` - Database schema definitions
   - `src/lib/vault.ts` - Encrypted credential storage
   - `scripts/heartbeat-dispatch.ts` - Automated agent workflow

4. **Read the architecture docs:**
   - `docs/02-technical-architecture.md` - System design rationale
   - `docs/12-technology-stack.md` - Technology decisions
   - `docs/13-agent-runtime.md` - How agents execute
   - `docs/15-agent-teams.md` - Multi-agent coordination

5. **Try creating a ticket:**
   - Create a new ticket in the UI
   - Trigger agent dispatch (if Claude CLI is configured)
   - Watch session files in `~/.bonsai/sessions/`
   - Observe agent progress and outputs

---

## Getting Help

If you encounter issues not covered in this guide:

1. **Check troubleshooting guide:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. **Review architecture docs:** `docs/` directory
3. **Check existing issues:** [GitHub Issues](https://github.com/coderaugment/bonsai-app/issues)
4. **Ask the team:** [Team communication channel]

---

## Contributing Documentation

Found an error or ambiguity in this guide? **Please update it!** This documentation is most valuable when it's accurate and current.

When you encounter setup issues:
1. Document the solution
2. Add it to this guide
3. Submit a pull request

Future developers will thank you. 🙏
