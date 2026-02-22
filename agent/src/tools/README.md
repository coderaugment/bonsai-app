# Bonsai Agent Tool System

## Overview

The tool system provides a registry-based architecture for defining actions that agents can take. Tools are defined with Zod schemas for type safety and validation, converted to JSON Schema for Anthropic SDK compatibility, and assembled per-run based on role profiles.

## Architecture

### Tool Definition

Each tool has:
- **name**: Unique identifier
- **description**: Human-readable explanation for the LLM
- **parameters**: JSON Schema (converted from Zod)
- **handle**: Async function that executes the action

### Tool Categories

1. **Dev Tools** (`tools/dev/`) - File operations, bash, git commands
   - Use ToolExecutor abstraction for all operations
   - Respect workspace isolation (no `../` traversal)

2. **Bonsai Tools** (`tools/bonsai/`) - Ticket and comment operations
   - Use BonsaiDbOperations interface for database access
   - Validate state transitions

3. **Future: CLI Tools** - Wrapper pattern for external commands

### Tool Profiles

- **researcher**: Read-only access (file_read, git_status, ticket_read)
- **developer**: Full access (all file ops, git commit/push)
- **reviewer**: Read + limited write (can update ticket state, post comments)

## Usage

```typescript
import { toolRegistry, type ToolContext } from '@bonsai/agent';

// Get tools for a specific profile
const tools = toolRegistry.getToolsForProfile('developer');

// Execute a tool
const context: ToolContext = {
  projectId: 'proj_123',
  ticketId: 'tkt_456',
  workspace: {
    rootPath: '/path/to/workspace',
    executor: new LocalToolExecutor('/path/to/workspace'),
    branch: 'main',
    remote: 'origin',
    personaId: 'persona_789',
  },
  db: myDatabaseOperations,
};

const tool = toolRegistry.getTool('file_read');
const result = await tool.handle({ path: 'src/index.ts' }, context);
```

## Adding New Tools

1. Create tool definition with Zod schema
2. Implement handle function
3. Register in registry.ts
4. Add to appropriate tool profiles
5. Export from module

See existing tools for examples.

## Tool Profiles

### Researcher Profile
Read-only tools for discovery and analysis:
- `file_read` - Read file contents
- `file_list` - List files by pattern
- `bash` - Execute commands (use for read-only operations)
- `git_status` - View repository status
- `git_diff` - View changes
- `ticket_read` - Read ticket details
- `comment_post` - Post comments

### Developer Profile
Full access to all operations:
- All researcher tools, plus:
- `file_write` - Create/overwrite files
- `file_edit` - Targeted file edits
- `git_commit` - Create commits
- `git_push` - Push to remote
- `ticket_update_state` - Update ticket status

### Reviewer Profile
Read access plus state updates:
- `file_read`, `file_list`, `bash`
- `git_status`, `git_diff`
- `ticket_read`, `ticket_update_state`
- `comment_post`

## State Transitions

Valid ticket state transitions:
- `backlog` → `research`
- `research` → `plan_approval` or `backlog` (back)
- `plan_approval` → `in_progress` or `research` (back)
- `in_progress` → `verification` or `research` (back)
- `verification` → `done` or `in_progress` (back)
- `done` → (terminal, no transitions)

## Error Handling

All tools return a `ToolResult` with:
```typescript
{
  output: string;      // Success output or partial results
  error?: string;      // Error message if operation failed
  metadata?: object;   // Additional structured data (e.g., exitCode)
}
```

Tools should catch exceptions and return structured errors rather than throwing.
