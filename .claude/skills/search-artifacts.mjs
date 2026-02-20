#!/usr/bin/env node
/**
 * Claude Code skill: search-artifacts
 * Search artifacts using QMD hybrid search (BM25 + vector embeddings)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'search-artifacts',
  description: 'Search past research, plans, and designs using semantic search',
  instructions: `Usage: /search-artifacts <query>

Examples:
  /search-artifacts React 19 patterns
  /search-artifacts authentication flow
  /search-artifacts video playback API

This uses QMD hybrid search (BM25 keyword matching + vector embeddings) to find relevant artifacts from past tickets. Use this to:
- Find how similar problems were solved before
- Learn from past research and implementations
- Discover patterns and approaches used in previous work

IMPORTANT: Run /sync-artifacts first if this is your first time searching, or if new artifacts have been created since the last sync.`,
};

export async function run(args) {
  const query = args.trim();

  if (!query) {
    return {
      error: 'Usage: /search-artifacts <query>'
    };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'search-artifacts', query], {
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
