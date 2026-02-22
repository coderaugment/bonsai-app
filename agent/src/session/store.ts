import * as fs from "fs";
import * as path from "path";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export class SessionStore {
  constructor(private readonly sessionDir: string) {}

  /**
   * Load conversation history from disk.
   * Returns empty array if session doesn't exist.
   */
  load(key: string): MessageParam[] {
    const filePath = this.resolvePath(key);

    // Return empty array if file doesn't exist
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      const messages: MessageParam[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          // Skip header lines (metadata, not messages)
          if (parsed.type === "session" || parsed.event) {
            continue;
          }
          messages.push(parsed as MessageParam);
        } catch (parseError) {
          console.warn(
            `[SessionStore] Skipping malformed line ${i + 1} in ${filePath}:`,
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          );
        }
      }

      return messages;
    } catch (error) {
      console.warn(
        `[SessionStore] Failed to load session from ${filePath}:`,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Overwrite entire session with new message history.
   */
  save(key: string, messages: MessageParam[]): void {
    const filePath = this.resolvePath(key);

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }

      // Write header line with metadata
      const header = {
        type: "session",
        version: 1,
        key,
        createdAt: new Date().toISOString(),
        messageCount: messages.length,
      };

      const lines = [
        JSON.stringify(header),
        ...messages.map((msg) => JSON.stringify(msg)),
      ];

      fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
    } catch (error) {
      console.warn(
        `[SessionStore] Failed to save session to ${filePath}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Non-fatal: log warning but don't throw
    }
  }

  /**
   * Append single message to end of session.
   * Creates session file if it doesn't exist.
   */
  append(key: string, message: MessageParam): void {
    const filePath = this.resolvePath(key);

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }

      // If file doesn't exist, write header first
      if (!fs.existsSync(filePath)) {
        const header = {
          type: "session",
          version: 1,
          key,
          createdAt: new Date().toISOString(),
        };
        fs.appendFileSync(filePath, JSON.stringify(header) + "\n", "utf-8");
      }

      // Append message
      fs.appendFileSync(filePath, JSON.stringify(message) + "\n", "utf-8");
    } catch (error) {
      console.warn(
        `[SessionStore] Failed to append to session ${filePath}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Non-fatal: log warning but don't throw
    }
  }

  private resolvePath(key: string): string {
    // Sanitize key: take basename only, replace invalid chars with underscore
    const safe = path.basename(key).replace(/[^a-z0-9_-]/gi, "_");
    return path.join(this.sessionDir, `${safe}.jsonl`);
  }
}
