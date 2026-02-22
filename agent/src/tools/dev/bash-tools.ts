import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

const bashSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments as array'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
});

export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command in the project workspace. Returns stdout/stderr. Use this for running tests, builds, linters, git commands, or any CLI tool. The command runs in the project root directory.',
  parameters: zodToJsonSchema(bashSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { command, args = [], timeout = 30000 } = bashSchema.parse(params);
    try {
      const result = await ctx.workspace.executor.run(command, args, {
        cwd: ctx.workspace.rootPath,
        timeout
      });

      // Combine stdout and stderr
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

      if (result.exitCode !== 0) {
        return {
          output,
          error: `Command exited with code ${result.exitCode}`,
          metadata: { exitCode: result.exitCode },
        };
      }

      return { output, metadata: { exitCode: 0 } };
    } catch (err) {
      return { output: '', error: `Failed to execute command: ${err}` };
    }
  },
};

export const bashTools: ToolDefinition[] = [bashTool];
