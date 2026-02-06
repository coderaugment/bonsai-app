# Bonsai Developer OS

An AI-powered development environment that automates software engineering workflows through autonomous agent teams.

---

## What is Bonsai?

Bonsai Developer OS is a ticket-based development assistant that uses AI agents to help teams build software faster. It orchestrates autonomous agents through a three-phase workflow:

1. **Research Phase** - Agents explore the codebase and gather context
2. **Planning Phase** - Agents create detailed implementation plans
3. **Implementation Phase** - Agents write code, run tests, and create pull requests

Each ticket is handled by AI personas with distinct roles (researcher, planner, developer, etc.), working collaboratively like a real development team. Bonsai integrates with GitHub for automated workflows and uses an encrypted vault for secure credential storage.

**Key capabilities:**
- 🤖 **Autonomous execution** via Claude Agent SDK
- 📋 **Three-phase ticket workflow** with human approval gates
- 🔐 **Encrypted credential vault** using age-encryption
- 💾 **SQLite-based project state** for reliable persistence
- 🔄 **Heartbeat-based automation** for continuous progress
- 👥 **Multi-persona agent teams** with specialized skills
- 🔗 **GitHub integration** for repository operations

---

## Quick Start

**Prerequisites:** Node.js 22.x+, Claude CLI, Anthropic API key

```bash
# Clone and navigate to webapp
git clone <repository-url>
cd development/bonsai/webapp

# Build agent package (required dependency)
cd ../agent && npm install && npm run build && npm link

# Setup webapp
cd ../webapp
npm install
npm link @bonsai/agent

# Configure environment
cp .env.development .env.local
# Edit .env.local - add your ANTHROPIC_API_KEY

# Initialize database
npm run db:push
npm run db:reset-test

# Start development server
npm run dev
```

**For detailed setup instructions**, see [DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md) (recommended for first-time setup).

---

## Documentation

### Getting Started
- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** - Complete first-time setup guide with troubleshooting
- **[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md)** - System architecture and design overview
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflow and coding guidelines
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

### Architecture Documentation
The `docs/` directory contains detailed technical specifications:

- **[docs/02-technical-architecture.md](./docs/02-technical-architecture.md)** - System design rationale
- **[docs/12-technology-stack.md](./docs/12-technology-stack.md)** - Technology decisions and tradeoffs
- **[docs/13-agent-runtime.md](./docs/13-agent-runtime.md)** - How agents execute and communicate
- **[docs/15-agent-teams.md](./docs/15-agent-teams.md)** - Multi-agent coordination patterns
- **[docs/05-onboarding-wizard.md](./docs/05-onboarding-wizard.md)** - User onboarding flow (end-users)

Browse `docs/` for 15+ additional architecture documents covering every aspect of the system.

---

## Technology Stack

### Core Framework
- **Next.js 16** (App Router) - Full-stack React framework
- **React 19** - UI library with React Compiler for optimizations
- **TypeScript 5** - Type-safe development with strict mode

### Data & State
- **Drizzle ORM** - Type-safe SQL query builder
- **better-sqlite3** - Fast, embedded SQLite database
- **SQLite** - Local-first database for projects, tickets, and state

### AI & Agents
- **Anthropic Claude SDK** - Claude API integration
- **Claude Agent SDK** - Agent execution runtime
- **Claude CLI** - Command-line interface for agent dispatch

### Security
- **age-encryption** - Public-key cryptography for credential vault
- **Encrypted vault** - Secure storage for API keys and tokens

### Styling & UI
- **Tailwind CSS 4** - Utility-first CSS framework
- **Geist Font** - Typography optimized for code and interfaces

For detailed technology decisions and rationale, see [docs/12-technology-stack.md](./docs/12-technology-stack.md).

---

## Project Structure

```
webapp/
├── src/
│   ├── app/              # Next.js App Router pages and API routes
│   │   ├── api/          # Backend API endpoints
│   │   │   ├── tickets/  # Ticket management and agent dispatch
│   │   │   └── settings/ # API key and vault management
│   │   ├── onboard/      # User onboarding wizard
│   │   └── tickets/      # Ticket UI pages
│   ├── components/       # React components
│   ├── db/               # Database schema, migrations, seed data
│   │   ├── schema.ts     # Drizzle ORM schema definitions
│   │   ├── index.ts      # Database connection
│   │   └── seed.ts       # Sample data for development
│   └── lib/              # Shared utilities
│       ├── vault.ts      # Encrypted credential storage
│       └── prompt-builder.ts # Agent prompt construction
├── scripts/              # Automation scripts
│   └── heartbeat-dispatch.ts # Automated three-phase workflow
└── public/               # Static assets

agent/                    # Separate package (@bonsai/agent)
├── src/
│   └── roles/            # Agent role definitions
│       ├── researcher.ts # Research phase agent
│       ├── planner.ts    # Planning phase agent
│       └── developer.ts  # Implementation phase agent
└── dist/                 # Compiled TypeScript

docs/                     # Architecture documentation (15+ docs)
```

---

## Development Commands

```bash
# Development server with hot reload
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Database operations
npm run db:push        # Apply schema changes
npm run db:seed        # Add sample data
npm run db:reset-test  # Full reset with comprehensive test data

# Build for production
npm run build

# Start production server
npm start
```

---

## Database Management

Bonsai uses SQLite with environment-based file selection:

- **Development:** `bonsai-dev.db` (when `BONSAI_ENV=dev`)
- **Production:** `bonsai.db` (when `BONSAI_ENV=production`)

**Inspect database:**
```bash
# Web UI (Drizzle Studio)
npx drizzle-kit studio

# CLI
sqlite3 bonsai-dev.db
.tables
SELECT * FROM tickets;
```

---

## Agent Execution

Agents run as detached processes using the Claude CLI:

1. **Dispatch** - User triggers agent via UI or API
2. **Session creation** - Directory created at `~/.bonsai/sessions/{ticketId}-agent-{timestamp}/`
3. **Execution** - Agent runs autonomously with phase-specific tool restrictions
4. **Progress updates** - Agent posts updates via webhook to `/api/tickets/[id]/report`
5. **Completion** - Final output posted to `/api/tickets/[id]/agent-complete`

**Watch agent progress:**
```bash
# List session directories
ls -la ~/.bonsai/sessions/

# Read agent output
cat ~/.bonsai/sessions/tkt_*-agent-*/output.md

# Check error logs
cat ~/.bonsai/sessions/tkt_*-agent-*/stderr.log
```

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development workflow
- How to add features (with file locations)
- Testing strategy
- Code style and patterns
- Pull request guidelines

**Found a bug or have a question?**
- File an issue: [GitHub Issues](https://github.com/coderaugment/bonsai-app/issues)
- Check existing documentation: `docs/` directory
- Review troubleshooting guide: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## License

[License information here]

---

## Links

- **Documentation:** [docs/](./docs/)
- **Claude CLI:** https://claude.ai/cli
- **Anthropic Console:** https://console.anthropic.com/
- **Repository:** https://github.com/coderaugment/bonsai-app

---

**Last updated:** February 2026

If you find errors or outdated information, please update this document and submit a pull request. Documentation is most valuable when it's accurate and current.
