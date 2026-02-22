import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { zodToJsonSchema } from '../schema-converter.js';

// file_read
const readFileSchema = z.object({
  path: z.string().describe('Relative path from project root'),
});

export const readFileTool: ToolDefinition = {
  name: 'file_read',
  description: 'Read the contents of a file. Returns the file content as a string. Use this to examine source code, configuration files, or documentation.',
  parameters: zodToJsonSchema(readFileSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { path } = readFileSchema.parse(params);
    try {
      const content = await ctx.workspace.executor.readFile(path);
      return { output: content };
    } catch (err) {
      return { output: '', error: `Failed to read file: ${err}` };
    }
  },
};

// file_write
const writeFileSchema = z.object({
  path: z.string().describe('Relative path from project root'),
  content: z.string().describe('Complete file contents to write'),
});

export const writeFileTool: ToolDefinition = {
  name: 'file_write',
  description: 'Create a new file or completely overwrite an existing file with the provided content. Use this to create new source files or replace entire files.',
  parameters: zodToJsonSchema(writeFileSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { path, content } = writeFileSchema.parse(params);
    try {
      await ctx.workspace.executor.writeFile(path, content);
      return { output: `Successfully wrote ${content.length} bytes to ${path}` };
    } catch (err) {
      return { output: '', error: `Failed to write file: ${err}` };
    }
  },
};

// file_edit
const editFileSchema = z.object({
  path: z.string().describe('Relative path from project root'),
  search: z.string().describe('Exact text to search for (must match exactly)'),
  replace: z.string().describe('Text to replace the search string with'),
});

export const editFileTool: ToolDefinition = {
  name: 'file_edit',
  description: 'Make a targeted edit to a file by searching for an exact string and replacing it. The search string must match exactly (including whitespace). Use file_read first to see the exact content.',
  parameters: zodToJsonSchema(editFileSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { path, search, replace } = editFileSchema.parse(params);
    try {
      // Read current content
      const content = await ctx.workspace.executor.readFile(path);

      // Check if search string exists
      if (!content.includes(search)) {
        return {
          output: '',
          error: `Search string not found in ${path}. Make sure the search string matches exactly (including whitespace).`
        };
      }

      // Check if search string is unique
      const occurrences = content.split(search).length - 1;
      if (occurrences > 1) {
        return {
          output: '',
          error: `Search string appears ${occurrences} times in ${path}. Please make the search string more specific to match exactly once.`
        };
      }

      // Perform replacement
      const newContent = content.replace(search, replace);
      await ctx.workspace.executor.writeFile(path, newContent);

      return { output: `Successfully edited ${path}` };
    } catch (err) {
      return { output: '', error: `Failed to edit file: ${err}` };
    }
  },
};

// file_list
const listFilesSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "src/**/*.ts", "*.json")'),
});

export const listFilesTool: ToolDefinition = {
  name: 'file_list',
  description: 'List files matching a glob pattern. Returns a list of file paths relative to the project root. Useful for discovering source files, finding test files, or exploring directory structure.',
  parameters: zodToJsonSchema(listFilesSchema),
  async handle(params, ctx): Promise<ToolResult> {
    const { pattern } = listFilesSchema.parse(params);
    try {
      const files = await ctx.workspace.executor.listFiles(pattern);
      return { output: files.join('\n') };
    } catch (err) {
      return { output: '', error: `Failed to list files: ${err}` };
    }
  },
};

export const fileTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
];
