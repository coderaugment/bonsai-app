#!/usr/bin/env node
/**
 * Claude Code skill: sync-artifacts
 * Exports all artifacts from the database to markdown files for QMD indexing
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(__dirname, '../..');

export const skill = {
  name: 'sync-artifacts',
  description: 'Export all artifacts to markdown files for QMD hybrid search',
  instructions: `Usage: /sync-artifacts

This exports all research documents, implementation plans, and design documents from the database to:
  ~/.bonsai/artifacts/research/
  ~/.bonsai/artifacts/plans/
  ~/.bonsai/artifacts/designs/

After syncing, the artifacts are indexed by QMD for semantic search. Run this periodically to keep the search index up to date.`,
};

export async function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'bin/bonsai-cli.ts', 'sync-artifacts'], {
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
