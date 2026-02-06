import {
  Encrypter,
  Decrypter,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";
import * as fs from "fs/promises";
import * as path from "path";

const BONSAI_DIR = path.join(process.env.HOME!, ".bonsai");
const VAULT_PATH = path.join(BONSAI_DIR, "vault.age");
const KEY_PATH = path.join(BONSAI_DIR, "vault-key.txt");

interface VaultEntry {
  type: "session" | "api_key" | "token" | "custom";
  value: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface VaultData {
  version: number;
  entries: Record<string, VaultEntry>;
}

class Vault {
  private identity: string | null = null;
  private recipient: string | null = null;

  async init(): Promise<void> {
    try {
      const keyContent = await fs.readFile(KEY_PATH, "utf-8");
      this.identity = keyContent.trim();
      this.recipient = await identityToRecipient(this.identity);
    } catch {
      // Generate new keypair
      this.identity = await generateIdentity();
      this.recipient = await identityToRecipient(this.identity);

      await fs.mkdir(BONSAI_DIR, { recursive: true, mode: 0o700 });
      await fs.writeFile(KEY_PATH, this.identity + "\n", { mode: 0o600 });

      // Create empty vault
      await this.save({ version: 1, entries: {} });
    }
  }

  async get(key: string): Promise<string | null> {
    const data = await this.load();
    return data.entries[key]?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    type: VaultEntry["type"],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const data = await this.load();
    data.entries[key] = {
      type,
      value,
      createdAt: new Date().toISOString(),
      metadata,
    };
    await this.save(data);
  }

  async delete(key: string): Promise<void> {
    const data = await this.load();
    delete data.entries[key];
    await this.save(data);
  }

  async list(): Promise<
    Array<{ key: string; type: string; createdAt: string }>
  > {
    const data = await this.load();
    return Object.entries(data.entries).map(([key, entry]) => ({
      key,
      type: entry.type,
      createdAt: entry.createdAt,
    }));
  }

  private async load(): Promise<VaultData> {
    try {
      const encrypted = await fs.readFile(VAULT_PATH);
      const d = new Decrypter();
      d.addIdentity(this.identity!);
      const plaintext = await d.decrypt(encrypted, "text");
      return JSON.parse(plaintext);
    } catch {
      return { version: 1, entries: {} };
    }
  }

  private async save(data: VaultData): Promise<void> {
    const e = new Encrypter();
    e.addRecipient(this.recipient!);
    const encrypted = await e.encrypt(JSON.stringify(data, null, 2));
    await fs.writeFile(VAULT_PATH, encrypted, { mode: 0o600 });
  }
}

let vault: Vault | null = null;

export async function getVault(): Promise<Vault> {
  if (!vault) {
    vault = new Vault();
    await vault.init();
  }
  return vault;
}

/**
 * Get the GitHub token, migrating from plaintext SQLite if needed.
 * After migration, the plaintext token is removed from settings.
 */
export async function getGithubToken(): Promise<string | null> {
  const v = await getVault();
  const token = await v.get("github");
  if (token) return token;

  // Migration: check old plaintext storage
  const { getSetting, setSetting } = await import("@/db/queries");
  const legacy = getSetting("github_token");
  if (legacy) {
    await v.set("github", legacy, "token");
    // Remove plaintext — overwrite with empty marker
    setSetting("github_token", "__migrated_to_vault__");
    return legacy;
  }

  return null;
}
