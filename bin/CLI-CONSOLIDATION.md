# Bonsai CLI Consolidation

## Summary

All agent helper scripts have been consolidated into a single unified CLI tool: **`bonsai-cli`**

## Before (Messy)

Agent sessions had multiple generated Node.js scripts:
```bash
~/.bonsai/sessions/tkt_106-agent-1234-p8/
├── report.sh              # 10 lines of Node.js fetch code
├── check-criteria.sh      # 12 lines of Node.js fetch code
├── credit-status.sh       # 15 lines of Node.js fetch code
└── save-document.sh       # 20 lines of Node.js fetch code (REMOVED)
```

Each script was a mini HTTP client duplicating logic.

## After (Clean)

**One unified CLI** with simple bash wrappers:
```bash
cli/bonsai-cli.ts          # 554 lines - unified CLI with all commands

~/.bonsai/sessions/tkt_106-agent-1234-p8/
├── bonsai-cli             # 4-line wrapper (makes CLI available)
├── report.sh              # 3-line wrapper → bonsai-cli report
├── check-criteria.sh      # 3-line wrapper → bonsai-cli check-criteria
└── credit-status.sh       # 3-line wrapper → bonsai-cli credit-status
```

## Unified CLI Commands

```bash
# Workflow commands (agents use these)
bonsai-cli report <ticket-id> "message"
bonsai-cli check-criteria <ticket-id> <index>
bonsai-cli write-artifact <ticket-id> <type> <file>
bonsai-cli read-artifact <ticket-id> <type>
bonsai-cli credit-status

# Database/query commands (humans use these)
bonsai-cli get-comments <project-slug> <ticket-id> [--head N | --tail N]
bonsai-cli get-persona <persona-id>
bonsai-cli sync-artifacts
bonsai-cli search-artifacts <query>
```

## Agent Usage

Agents can now use either:

### Option 1: Wrapper scripts (backward compatible)
```bash
./report.sh "Starting implementation"
./check-criteria.sh 0
./credit-status.sh
```

### Option 2: Direct CLI calls (cleaner, recommended)
```bash
bonsai-cli report 106 "Starting implementation"
bonsai-cli check-criteria 106 0
bonsai-cli write-artifact 106 research /tmp/research.md
bonsai-cli credit-status
```

Both work identically - wrappers call the CLI internally.

## Test Coverage

**37 comprehensive tests** covering:
- ✅ All command argument validation
- ✅ Error handling (network, database, validation)
- ✅ HTTP request payload correctness
- ✅ Environment variable handling
- ✅ Integration tests (write + read artifacts)
- ✅ Edge cases (missing files, invalid types, etc.)

Run tests:
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

## System Prompt Updates

Agent prompts now reference the unified CLI:

**Progress Reporting:**
```
./report.sh "your message"
Note: wrapper around bonsai-cli report
```

**Saving Documents:**
```
bonsai-cli write-artifact <ticket-id> <type> <file>
Types: research, implementation_plan, design
Note: bonsai-cli is pre-configured in your session
```

**Checking Criteria:**
```
./check-criteria.sh 0  # checks first criterion
Note: wrapper around bonsai-cli check-criteria
```

## Benefits

1. **Single source of truth** - All HTTP client logic in one place
2. **Easier maintenance** - Update one file, not 4 generated scripts
3. **Comprehensive tests** - 37 tests vs 0 before
4. **Consistent API** - All commands use same env var patterns
5. **Better errors** - Centralized error handling and messages
6. **Smaller footprint** - 4-line wrappers vs 10-20 line scripts
7. **Extensible** - Add new commands without touching dispatch route

## Environment Variables

The CLI uses these environment variables (auto-configured in wrappers):

```bash
BONSAI_ENV=dev              # dev or prod database
BONSAI_PERSONA_ID=p8        # Agent's persona ID (for report command)
BONSAI_API_BASE=http://...  # API endpoint (default: localhost:3080)
```

## Migration Notes

- ✅ All existing agent sessions continue to work (backward compatible)
- ✅ Old save-document.sh removed (replaced with bonsai-cli write-artifact)
- ✅ System prompts updated to reference unified CLI
- ✅ All tests passing (37/37)
- ✅ No breaking changes to agent workflows

## Files Modified

1. `cli/bonsai-cli.ts` - Added report, check-criteria, credit-status commands
2. `bin/bonsai-cli.test.ts` - Comprehensive test suite (37 tests)
3. `src/app/api/tickets/[id]/dispatch/route.ts` - Generate CLI wrappers instead of full scripts
4. `vitest.config.ts` - Test configuration
5. `package.json` - Added test scripts and vitest dependencies

## Next Steps

Future commands to add to unified CLI:
- `bonsai-cli get-ticket <ticket-id>` - Fetch ticket details
- `bonsai-cli list-tickets <project-slug>` - List tickets by project
- `bonsai-cli update-ticket <ticket-id> <field> <value>` - Update ticket fields
- `bonsai-cli dispatch <ticket-id> @persona` - Manually dispatch agents

## Example Session

```bash
# Agent working on ticket 106
cd ~/.bonsai/sessions/tkt_106-agent-1771567683051-p8

# Post progress updates
./report.sh "Starting research on Next.js 16 patterns"
./report.sh "Found 5 relevant examples on GitHub"

# Save research artifact
echo "# Research Findings..." > /tmp/research.md
bonsai-cli write-artifact 106 research /tmp/research.md

# Check acceptance criteria
./check-criteria.sh 0  # First criterion met
./check-criteria.sh 1  # Second criterion met

# Check credit status
./credit-status.sh
# Output: ✓ Credits are active (not paused)
```

All commands are unified, tested, and maintainable! 🎉
