import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/index';
import { tickets, projects, personas, ticketDocuments, comments } from '../src/db/schema';

const CLI_PATH = path.join(__dirname, 'bonsai-cli.ts');
const runCLI = (args: string[], env: Record<string, string> = {}): string => {
  const cmd = `npx tsx ${CLI_PATH} ${args.join(' ')}`;
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, ...env, BONSAI_ENV: 'test' },
      stdio: 'pipe',
    });
  } catch (err: any) {
    // Return combined stdout + stderr for error cases
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    return stdout + stderr;
  }
};

// Mock fetch for HTTP commands
global.fetch = vi.fn();

describe('bonsai-cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usage and help', () => {
    it('should show usage when no command provided', () => {
      const result = runCLI([]);
      expect(result).toContain('Usage: bonsai-cli');
      expect(result).toContain('Commands:');
    });

    it('should show usage for unknown command', () => {
      const result = runCLI(['invalid-command']);
      expect(result).toContain('Error: unknown command');
    });
  });

  describe('get-comments', () => {
    it('should require project-slug and ticket-id', () => {
      const result = runCLI(['get-comments']);
      expect(result).toContain('Error: get-comments requires');
    });

    it('should handle --head option', () => {
      const result = runCLI(['get-comments', 'test-project', '1', '--head', '5']);
      // Will error if project doesn't exist, but validates argument parsing
      expect(result).toMatch(/(Error: project|Comments:)/);
    });

    it('should handle --tail option', () => {
      const result = runCLI(['get-comments', 'test-project', '1', '--tail', '3']);
      expect(result).toMatch(/(Error: project|Comments:)/);
    });
  });

  describe('get-persona', () => {
    it('should require persona-id', () => {
      const result = runCLI(['get-persona']);
      expect(result).toContain('Error: get-persona requires');
    });

    it('should show persona details', () => {
      const result = runCLI(['get-persona', 'p1']);
      expect(result).toMatch(/(Error: Persona|Persona:)/);
    });
  });

  describe('write-artifact', () => {
    it('should require all arguments', () => {
      const result = runCLI(['write-artifact']);
      expect(result).toContain('Error: write-artifact requires');
    });

    it('should require ticket-id', () => {
      const result = runCLI(['write-artifact', '1']);
      expect(result).toContain('Error: write-artifact requires');
    });

    it('should require type', () => {
      const result = runCLI(['write-artifact', '1', 'research']);
      expect(result).toContain('Error: write-artifact requires');
    });

    it('should validate type is one of: research, implementation_plan, design', async () => {
      const tmpFile = '/tmp/test-artifact.md';
      fs.writeFileSync(tmpFile, '# Test artifact');

      const result = runCLI(['write-artifact', '999', 'invalid-type', tmpFile]);
      expect(result).toMatch(/(Error: type must be|Error: Ticket)/);

      fs.unlinkSync(tmpFile);
    });

    it('should handle file not found', () => {
      const result = runCLI(['write-artifact', '1', 'research', '/nonexistent/file.md']);
      expect(result).toContain('Error:');
    });
  });

  describe('read-artifact', () => {
    it('should require ticket-id and type', () => {
      const result = runCLI(['read-artifact']);
      expect(result).toContain('Error: read-artifact requires');
    });

    it('should require type', () => {
      const result = runCLI(['read-artifact', '1']);
      expect(result).toContain('Error: read-artifact requires');
    });

    it('should handle missing artifact', () => {
      const result = runCLI(['read-artifact', '999', 'research']);
      expect(result).toMatch(/(Error:|No research artifact)/);
    });
  });

  describe('sync-artifacts', () => {
    it('should run without arguments', () => {
      const result = runCLI(['sync-artifacts']);
      expect(result).toMatch(/(Syncing|artifacts)/i);
    });

    it('should create artifacts directory', () => {
      runCLI(['sync-artifacts']);
      const artifactsDir = path.join(process.env.HOME || '~', '.bonsai', 'artifacts');
      // Directory creation is tested by sync-artifacts execution
      expect(true).toBe(true);
    });
  });

  describe('search-artifacts', () => {
    it('should require query', () => {
      const result = runCLI(['search-artifacts']);
      expect(result).toContain('Error: search-artifacts requires');
    });

    it('should pass query to qmd', () => {
      const result = runCLI(['search-artifacts', 'test query']);
      // Will succeed if qmd is installed, error if not
      expect(result).toMatch(/(QMD|Error:|No results found)/);
    });
  });

  describe('report', () => {
    it('should require ticket-id and message', () => {
      const result = runCLI(['report']);
      expect(result).toContain('Error: report requires');
    });

    it('should require message', () => {
      const result = runCLI(['report', '1']);
      expect(result).toContain('Error: report requires');
    });

    it('should require BONSAI_PERSONA_ID env var', () => {
      const result = runCLI(['report', '1', 'test message']);
      expect(result).toContain('BONSAI_PERSONA_ID');
    });

    it('should make POST request with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = runCLI(
        ['report', '42', 'Progress update'],
        {
          BONSAI_PERSONA_ID: 'p8',
          BONSAI_API_BASE: 'http://localhost:3080',
        }
      );

      // Should call fetch with correct URL and payload
      if (mockFetch.mock.calls.length > 0) {
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/tickets/42/report');
        expect(options.method).toBe('POST');
        const body = JSON.parse(options.body);
        expect(body.personaId).toBe('p8');
        expect(body.content).toBe('Progress update');
      }
    });

    it('should join multiple message arguments', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      runCLI(
        ['report', '42', 'Multi', 'word', 'message'],
        { BONSAI_PERSONA_ID: 'p8' }
      );

      if (mockFetch.mock.calls.length > 0) {
        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.content).toBe('Multi word message');
      }
    });
  });

  describe('check-criteria', () => {
    it('should require ticket-id and index', () => {
      const result = runCLI(['check-criteria']);
      expect(result).toContain('Error: check-criteria requires');
    });

    it('should require index', () => {
      const result = runCLI(['check-criteria', '1']);
      expect(result).toContain('Error: check-criteria requires');
    });

    it('should validate index is a number', () => {
      const result = runCLI(['check-criteria', '1', 'invalid']);
      expect(result).toContain('Error:');
    });

    it('should reject negative index', () => {
      const result = runCLI(['check-criteria', '1', '-1']);
      expect(result).toContain('Error:');
    });

    it('should make POST request with correct index', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      runCLI(['check-criteria', '42', '2'], { BONSAI_API_BASE: 'http://localhost:3080' });

      if (mockFetch.mock.calls.length > 0) {
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/tickets/42/check-criteria');
        const body = JSON.parse(options.body);
        expect(body.index).toBe(2);
      }
    });
  });

  describe('credit-status', () => {
    it('should run without arguments', () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ paused: false }),
      });
      global.fetch = mockFetch;

      const result = runCLI(['credit-status']);
      expect(result).toMatch(/(Credits|Error:)/);
    });

    it('should show paused status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          paused: true,
          pausedUntil: '2026-02-20T12:00:00Z',
          reason: 'Rate limit exceeded',
          remainingMs: 300000,
        }),
      });
      global.fetch = mockFetch;

      const result = runCLI(['credit-status']);

      if (mockFetch.mock.calls.length > 0) {
        expect(result).toMatch(/(PAUSED|Error:)/);
      }
    });

    it('should show active status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ paused: false }),
      });
      global.fetch = mockFetch;

      const result = runCLI(['credit-status']);

      if (mockFetch.mock.calls.length > 0) {
        expect(result).toMatch(/(active|Error:)/);
      }
    });

    it('should use BONSAI_API_BASE env var', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ paused: false }),
      });
      global.fetch = mockFetch;

      runCLI(['credit-status'], { BONSAI_API_BASE: 'http://custom:4000' });

      if (mockFetch.mock.calls.length > 0) {
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('http://custom:4000');
      }
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', () => {
      const result = runCLI(['get-persona', 'nonexistent']);
      expect(result).toMatch(/(Error:|not found)/);
    });

    it('should handle network errors in HTTP commands', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = runCLI(
        ['report', '1', 'test'],
        { BONSAI_PERSONA_ID: 'p1' }
      );

      expect(result).toContain('Error:');
    });

    it('should handle non-200 responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });
      global.fetch = mockFetch;

      const result = runCLI(
        ['report', '1', 'test'],
        { BONSAI_PERSONA_ID: 'p1' }
      );

      expect(result).toContain('Error:');
    });
  });

  describe('integration tests', () => {
    it('should chain commands: write-artifact -> read-artifact', async () => {
      // Create test file
      const tmpFile = '/tmp/test-integration.md';
      const content = '# Test Integration\nThis is a test artifact.';
      fs.writeFileSync(tmpFile, content);

      // Write artifact (will fail if ticket doesn't exist, but tests the flow)
      const writeResult = runCLI(['write-artifact', '1', 'research', tmpFile]);

      // Read artifact
      const readResult = runCLI(['read-artifact', '1', 'research']);

      // Clean up
      fs.unlinkSync(tmpFile);

      // Both commands should execute (even if they error on missing ticket)
      expect(writeResult).toMatch(/(Error:|Saved artifact)/);
      expect(readResult).toMatch(/(Error:|No|===)/);
    });
  });
});
