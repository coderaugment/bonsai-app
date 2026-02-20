#!/usr/bin/env node
/**
 * Claude Code skill: read-artifact
 * Reads the latest version of a document artifact from the ticket system
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'read-artifact',
  description: 'Read the latest artifact of a given type from a ticket',
  instructions: `Usage: /read-artifact <ticket-id> <type>

Types: research, implementation_plan, design

Example: /read-artifact 41 research

This retrieves the latest version of the specified artifact type from the ticket_documents table and displays its content.`,
};

export async function run(args) {
  const [ticketId, type] = args.split(/\s+/).filter(Boolean);

  if (!ticketId || !type) {
    return {
      error: 'Usage: /read-artifact <ticket-id> <type>\nTypes: research, implementation_plan, design'
    };
  }

  const validTypes = ['research', 'implementation_plan', 'design'];
  if (!validTypes.includes(type)) {
    return {
      error: `Invalid type '${type}'. Must be one of: ${validTypes.join(', ')}`
    };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'read-artifact', ticketId, type], {
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
