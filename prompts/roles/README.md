# Role System Prompts

This directory contains the system prompts for each agent role in Bonsai.

## Enabled Roles

The following roles are currently enabled and actively used:

- **[lead.md](./lead.md)** - Project orchestrator and quality gatekeeper
- **[researcher.md](./researcher.md)** - Web research and documentation analysis
- **[developer.md](./developer.md)** - Code implementation and technical work

## Disabled Roles

These roles are defined but not currently dispatched:

- **designer.md** - UI/UX design and visual assets
- **critic.md** - Code review and security analysis
- **hacker.md** - Security testing and penetration testing

## How Prompts Work

1. **Source of Truth**: Markdown files in this directory are the canonical source
2. **Database Sync**: Run `npm run prompts:sync` to load prompts from files into the database
3. **Runtime**: Agents receive prompts from the database (loaded from these files)
4. **Version Control**: All prompt changes are tracked in git

## Prompt Structure

Each role prompt should include:

1. **Role Identity** - Who this agent is and what they do
2. **Responsibilities** - Clear list of duties and scope
3. **Tools Available** - What commands/tools they can use
4. **Workflow** - How they interact with other agents and humans
5. **Quality Standards** - What "done" looks like
6. **Examples** - Sample workflows and decision trees

## Editing Prompts

To modify a role's behavior:

1. Edit the markdown file in this directory
2. Run `npm run prompts:sync` to update the database
3. Test with a new agent dispatch
4. Commit changes to git

## Fallback Behavior

If a role has no prompt in the database, the system uses this default:
```
You are a {role}. Follow your role's responsibilities for this project.
```

This is intentionally minimal to ensure prompts are explicitly defined.
