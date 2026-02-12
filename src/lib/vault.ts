/**
 * Encrypted credential vault using age-encryption (public-key cryptography).
 *
 * Provides secure storage for API keys, tokens, and other sensitive data.
 * Auto-generates keypair at ~/.bonsai/vault-key.txt on first use.
 * Encrypted data stored at ~/.bonsai/vault.age.
 *
 * Security model:
 * - Private key never leaves local machine
 * - Secrets encrypted at rest using age-encryption standard
 * - Automatic migration from plaintext SQLite storage
 * - File permissions set to 0o600 (user read/write only)
 *
 * @module vault
 */

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

/**
 * Vault class manages encrypted credential storage.
 * Uses age-encryption for secure, local credential management.
 */
class Vault {
  private identity: string | null = null;
  private recipient: string | null = null;

  /**
   * Initialize the vault by loading or generating encryption keys.
   *
   * On first run:
   * - Generates new ed25519 keypair
   * - Saves private key to ~/.bonsai/vault-key.txt (mode 0o600)
   * - Creates empty encrypted vault at ~/.bonsai/vault.age
   * - Creates ~/.bonsai directory with mode 0o700 if needed
   *
   * On subsequent runs:
   * - Loads existing private key from ~/.bonsai/vault-key.txt
   * - Derives public key (recipient) from private key
   *
   * @throws {Error} If key generation or file operations fail
   */
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

  /**
   * Retrieve a secret value from the vault.
   *
   * @param key - The secret identifier (e.g., "github", "anthropic_api_key")
   * @returns The decrypted secret value, or null if key doesn't exist
   */
  async get(key: string): Promise<string | null> {
    const data = await this.load();
    return data.entries[key]?.value ?? null;
  }

  /**
   * Store a secret in the vault.
   *
   * If the key already exists, it will be overwritten.
   * The vault is encrypted and saved to disk after each set operation.
   *
   * @param key - The secret identifier
   * @param value - The secret value to encrypt and store
   * @param type - The secret type ("session" | "api_key" | "token" | "custom")
   * @param metadata - Optional metadata to store with the secret
   */
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

  /**
   * Delete a secret from the vault.
   *
   * @param key - The secret identifier to delete
   */
  async delete(key: string): Promise<void> {
    const data = await this.load();
    delete data.entries[key];
    await this.save(data);
  }

  /**
   * List all secrets in the vault (without revealing values).
   *
   * @returns Array of secret metadata (key, type, createdAt) without values
   */
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

  /**
   * Load and decrypt vault data from disk.
   *
   * @returns Decrypted vault data, or empty vault if file doesn't exist
   * @private
   */
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

  /**
   * Encrypt and save vault data to disk.
   *
   * Sets file permissions to 0o600 (user read/write only).
   *
   * @param data - The vault data to encrypt and save
   * @private
   */
  private async save(data: VaultData): Promise<void> {
    const e = new Encrypter();
    e.addRecipient(this.recipient!);
    const encrypted = await e.encrypt(JSON.stringify(data, null, 2));
    await fs.writeFile(VAULT_PATH, encrypted, { mode: 0o600 });
  }
}

let vault: Vault | null = null;

/**
 * Get the singleton vault instance.
 *
 * On first call, initializes the vault (loads or generates keys).
 * Subsequent calls return the cached instance.
 *
 * @returns The initialized vault instance
 */
export async function getVault(): Promise<Vault> {
  if (!vault) {
    vault = new Vault();
    await vault.init();
  }
  return vault;
}

/**
 * Get the GitHub token, migrating from plaintext SQLite if needed.
 *
 * Migration flow:
 * 1. Check encrypted vault for "github" key
 * 2. If not found, check legacy plaintext storage in SQLite
 * 3. If found in SQLite, migrate to vault and mark as migrated
 * 4. Return the token from vault or null if not found
 *
 * After migration, the SQLite entry is overwritten with the marker
 * string "__migrated_to_vault__" to prevent re-migration.
 *
 * @returns The GitHub token, or null if not configured
 */
export async function getGithubToken(): Promise<string | null> {
  const v = await getVault();
  const token = await v.get("github");
  if (token) return token;

  // Migration: check old plaintext storage
  const { getSetting, setSetting } = await import("@/db/data/settings");
  const legacy = await getSetting("github_token");
  if (legacy) {
    await v.set("github", legacy, "token");
    // Remove plaintext — overwrite with empty marker
    await setSetting("github_token", "__migrated_to_vault__");
    return legacy;
  }

  return null;
}
