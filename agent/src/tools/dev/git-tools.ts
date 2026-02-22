import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

// git_status
const gitStatusSchema = z.object({});

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: 'Show the working tree status. Returns information about staged, unstaged, and untracked files. Use this to see what changes exist before committing.',
  parameters: zodToJsonSchema(gitStatusSchema),
  async handle(params, ctx): Promise<ToolResult> {
    try {
      const result = await ctx.workspace.executor.run('git', ['status', '--porcelain'], {
        cwd: ctx.workspace.rootPath
      });
      return { output: result.stdout || 'No changes' };
    } catch (err) {
      return { output: '', error: `Failed to get git status: ${err}` };
    }
  },
};

// git_diff
const gitDiffSchema = z.object({
  staged: z.boolean().optional().describe('Show staged changes only (default: false)'),
});

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: 'Show changes to tracked files. By default shows unstaged changes. Set staged=true to see changes that will be committed. Use this to review modifications before committing.',
  parameters: zodToJsonSchema(gitDiffSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { staged = false } = gitDiffSchema.parse(params);
    try {
      const args = staged ? ['diff', '--cached'] : ['diff'];
      const result = await ctx.workspace.executor.run('git', args, {
        cwd: ctx.workspace.rootPath
      });
      return { output: result.stdout || 'No changes to show' };
    } catch (err) {
      return { output: '', error: `Failed to get git diff: ${err}` };
    }
  },
};

// git_commit
const gitCommitSchema = z.object({
  message: z.string().describe('Commit message'),
  files: z.array(z.string()).optional().describe('Specific files to stage and commit (default: all changes)'),
});

export const gitCommitTool: ToolDefinition = {
  name: 'git_commit',
  description: 'Stage changes and create a commit. You can specify individual files or commit all changes. Use git_status and git_diff first to review what will be committed.',
  parameters: zodToJsonSchema(gitCommitSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { message, files } = gitCommitSchema.parse(params);
    try {
      // Stage files
      const addArgs = files && files.length > 0
        ? ['add', ...files]
        : ['add', '-A'];

      await ctx.workspace.executor.run('git', addArgs, {
        cwd: ctx.workspace.rootPath
      });

      // Commit
      const result = await ctx.workspace.executor.run('git', ['commit', '-m', message], {
        cwd: ctx.workspace.rootPath
      });

      return { output: result.stdout };
    } catch (err) {
      return { output: '', error: `Failed to commit: ${err}` };
    }
  },
};

// git_push
const gitPushSchema = z.object({
  remote: z.string().optional().describe('Remote name (default: origin)'),
  branch: z.string().optional().describe('Branch name (default: current branch)'),
});

export const gitPushTool: ToolDefinition = {
  name: 'git_push',
  description: 'Push commits to remote repository. By default pushes current branch to origin. Use this after committing changes to share them with the team.',
  parameters: zodToJsonSchema(gitPushSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { remote = 'origin', branch } = gitPushSchema.parse(params);
    try {
      const args = branch ? ['push', remote, branch] : ['push'];
      const result = await ctx.workspace.executor.run('git', args, {
        cwd: ctx.workspace.rootPath
      });

      return { output: result.stdout + '\n' + result.stderr };
    } catch (err) {
      return { output: '', error: `Failed to push: ${err}` };
    }
  },
};

export const gitTools: ToolDefinition[] = [
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitPushTool,
];
