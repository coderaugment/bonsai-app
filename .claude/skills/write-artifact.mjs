#!/usr/bin/env node
/**
 * Claude Code skill: write-artifact
 * Saves a document artifact (research, implementation_plan, design) to the ticket system
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'write-artifact',
  description: 'Save a document artifact to the ticket system',
  instructions: `Usage: /write-artifact <ticket-id> <type> <file-path>

Types: research, implementation_plan, design

Example: /write-artifact 41 research /tmp/research.md

This saves the artifact to the ticket_documents table, creates a comment, triggers auto-dispatch chains (e.g., critic review after research v1), and logs an audit event.

IMPORTANT: Use this to save research documents, implementation plans, and design documents. Do NOT post these as comments — save them as artifacts so they appear in the Documents section of the ticket.`,
};

export async function run(args) {
  const parts = args.split(/\s+/).filter(Boolean);
  const [ticketId, type, filePath] = parts;

  if (!ticketId || !type || !filePath) {
    return {
      error: 'Usage: /write-artifact <ticket-id> <type> <file-path>\nTypes: research, implementation_plan, design'
    };
  }

  const validTypes = ['research', 'implementation_plan', 'design'];
  if (!validTypes.includes(type)) {
    return {
      error: `Invalid type '${type}'. Must be one of: ${validTypes.join(', ')}`
    };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'write-artifact', ticketId, type, filePath], {
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
