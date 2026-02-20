# Role Prompts System - Implementation Summary

## ✅ What Was Built

A version-controlled role prompts system with markdown source files that sync to the database.

## File Structure

```
webapp/
├── prompts/
│   └── roles/
│       ├── README.md          # System documentation
│       ├── lead.md            # ✅ Lead agent prompt (159 lines)
│       ├── researcher.md      # ✅ Researcher agent prompt (199 lines)
│       ├── developer.md       # ✅ Developer agent prompt (311 lines)
│       └── SUMMARY.md         # This file
├── scripts/
│   └── sync-role-prompts.ts   # Sync script (loads MD → DB)
└── package.json               # Added: npm run prompts:sync
```

## The 3 Enabled Roles

### 1. Lead (`lead.md`)
**Role**: Project orchestrator and quality gatekeeper
**Key Responsibilities**:
- Dispatch agents (@researcher, @developer)
- Verify artifacts are saved (not posted in chat)
- Gate transitions between planning/building/preview
- Report to @human at key milestones
- NO file access tools (orchestrates only)

**Tools**: Bash, ./bonsai-cli (report, credit-status), @mentions

### 2. Researcher (`researcher.md`)
**Role**: Web research and documentation analysis
**Key Responsibilities**:
- Search web, GitHub, docs for solutions
- Evaluate 2-3 options with pros/cons
- Save research artifacts using bonsai-cli
- Provide clear recommendation with rationale
- Address security considerations

**Tools**: Read, Grep, Glob (read-only), Bash (read-only), ./bonsai-cli (report, write-artifact)

### 3. Developer (`developer.md`)
**Role**: Code implementation and testing
**Key Responsibilities**:
- Execute approved plans (no redesign)
- Write clean, tested code
- Follow project conventions
- Check off acceptance criteria
- Git commits with clear messages

**Tools**: Read, Write, Edit, Grep, Glob, Bash (full), Git, ./bonsai-cli (report, check-criteria, write-artifact)

## How It Works

### 1. Source of Truth: Markdown Files

```bash
webapp/prompts/roles/lead.md        # Edit this to change lead behavior
webapp/prompts/roles/researcher.md  # Edit this to change researcher behavior
webapp/prompts/roles/developer.md   # Edit this to change developer behavior
```

### 2. Sync to Database

```bash
npm run prompts:sync
```

Output:
```
🔄 Syncing role prompts from markdown files to database...

✅ developer.md → database (311 lines, 8651 chars)
✅ lead.md → database (159 lines, 5970 chars)
✅ researcher.md → database (199 lines, 5938 chars)

✨ Role prompts synced successfully!
```

### 3. Runtime: Agents Use Database Prompts

When agents are dispatched:
1. Dispatch route reads `roles.system_prompt` from database
2. Builds complete system prompt with role instructions
3. Agent receives prompt and executes accordingly

## Workflow: Modifying Agent Behavior

```bash
# 1. Edit the markdown file
vim webapp/prompts/roles/developer.md

# 2. Sync to database
npm run prompts:sync

# 3. Test with new agent dispatch
# (dispatch developer agent on a ticket)

# 4. Verify behavior changed
# (check agent's actions in ticket comments)

# 5. Commit to git
git add webapp/prompts/roles/developer.md
git commit -m "Update developer prompt: add TDD requirement"
```

## Benefits

✅ **Version Control** - All prompt changes tracked in git
✅ **Reviewable** - Diffs show exactly what changed
✅ **Readable** - Markdown is easier to edit than SQL
✅ **Testable** - Can preview prompts without DB access
✅ **Portable** - Prompts live with code, not just in DB
✅ **Documented** - Each role prompt explains its purpose

## Database Schema

```sql
-- roles table
CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  system_prompt TEXT,  -- ← Synced from markdown files
  ...
);
```

After sync:
```sql
SELECT slug, LENGTH(system_prompt) FROM roles;

-- critic     | NULL (not synced, no .md file)
-- designer   | NULL (not synced, no .md file)
-- developer  | 8651 ← from developer.md
-- hacker     | NULL (not synced, no .md file)
-- lead       | 5970 ← from lead.md
-- researcher | 5938 ← from researcher.md
```

## Prompt Structure (All 3 Roles)

Each prompt includes:

1. **Identity** - "You are a [role] responsible for..."
2. **Responsibilities** - Clear list of duties
3. **Scope** - When/where this role operates
4. **Tools** - What commands are available
5. **Workflow** - How to interact with team/human
6. **Quality Standards** - Definition of "done"
7. **Examples** - Sample workflows
8. **Common Mistakes** - What to avoid

## Key Differences Between Roles

| Aspect | Lead | Researcher | Developer |
|--------|------|------------|-----------|
| **File Access** | None | Read-only | Full (R/W/E) |
| **Phase** | All | Planning | Building |
| **Artifacts** | Verifies | Creates research | Creates impl docs |
| **Tools** | Orchestration | Search/analysis | Code/test/commit |
| **Output** | @mentions + reports | Research artifact | Working code |
| **Quality Gate** | Yes (gates transitions) | No | No |

## Testing the Prompts

```bash
# 1. Create test ticket
# (via UI or API)

# 2. Dispatch lead
# (lead evaluates, dispatches researcher)

# 3. Check researcher behavior
# - Did they save artifact? (bonsai-cli write-artifact)
# - Did they post brief summary? (not full document)
# - Did they evaluate multiple options?

# 4. Check lead behavior
# - Did they verify artifact exists?
# - Did they notify @human?

# 5. Approve plan, move to building

# 6. Check developer behavior
# - Did they follow the plan?
# - Did they write tests?
# - Did they check criteria?
```

## Files Changed

1. ✅ `prompts/roles/README.md` - System documentation
2. ✅ `prompts/roles/lead.md` - Lead agent prompt (159 lines)
3. ✅ `prompts/roles/researcher.md` - Researcher agent prompt (199 lines)
4. ✅ `prompts/roles/developer.md` - Developer agent prompt (311 lines)
5. ✅ `scripts/sync-role-prompts.ts` - Sync script (loads MD → DB)
6. ✅ `package.json` - Added `prompts:sync` command
7. ✅ `CLAUDE.md` - Documented role prompts system

## Next Steps

Future improvements:

1. **Validation** - Check prompts against schema before sync
2. **Templates** - Add placeholder variables ({{ticket.id}}, {{persona.name}})
3. **Versioning** - Track which prompt version each dispatch used
4. **A/B Testing** - Compare prompt variations
5. **Metrics** - Track artifact save rate, quality scores by prompt version

## Quick Reference

```bash
# View prompts
ls -lh webapp/prompts/roles/*.md

# Sync prompts to database
npm run prompts:sync

# Read a role prompt
cat webapp/prompts/roles/lead.md

# Check what's in database
sqlite3 bonsai-dev.db "SELECT slug, LENGTH(system_prompt) FROM roles"

# View lead prompt from DB
sqlite3 bonsai-dev.db "SELECT system_prompt FROM roles WHERE slug='lead'"
```

All 3 enabled roles are now documented, version-controlled, and ready for inspection! 🎉
