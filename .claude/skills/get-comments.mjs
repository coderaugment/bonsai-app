#!/usr/bin/env node
/**
 * Claude Code skill: get-comments
 * Retrieves all comments for a ticket
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'get-comments',
  description: 'Get all comments for a ticket in a project',
  instructions: `Usage: /get-comments <project-slug> <ticket-id>

Example: /get-comments digitalworker-ai-demo 41

This retrieves all comments (human, agent, system) for the specified ticket and displays them chronologically.`,
};

export async function run(args) {
  const [projectSlug, ticketId] = args.split(/\s+/).filter(Boolean);

  if (!projectSlug || !ticketId) {
    return {
      error: 'Usage: /get-comments <project-slug> <ticket-id>'
    };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'get-comments', projectSlug, ticketId], {
      cwd: webappRoot,
      env: { ...process.env, BONSAI_ENV: 'dev' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: stderr || `Command failed with code ${code}` });
      } else {
        resolve({ output: stdout });
      }
    });

    proc.on('error', (err) => {
      resolve({ error: err.message });
    });
  });
}
