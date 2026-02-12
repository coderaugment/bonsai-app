#!/usr/bin/env node
/**
 * attach-file.mjs — Agent tool for uploading file attachments to tickets
 *
 * Usage:
 *   ./attach-file.mjs <ticketId> <filePath> [personaId]
 *
 * Examples:
 *   ./attach-file.mjs tkt_01 ./logo.png persona_dev_123
 *   ./attach-file.mjs tkt_02 ./design-mockup.pdf
 *
 * The file will be read, base64-encoded, and uploaded to the ticket via the API.
 * Supports images, PDFs, and other file types.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse args ──────────────────────────────────
const [ticketId, filePath, personaId] = process.argv.slice(2);

if (!ticketId || !filePath) {
  console.error("Usage: attach-file.mjs <ticketId> <filePath> [personaId]");
  console.error("Example: attach-file.mjs tkt_01 ./logo.png persona_dev_123");
  process.exit(1);
}

// ── Validate file exists ────────────────────────
const absolutePath = path.resolve(filePath);
if (!fs.existsSync(absolutePath)) {
  console.error(`Error: File not found: ${absolutePath}`);
  process.exit(1);
}

// ── Read and encode file ────────────────────────
const fileBuffer = fs.readFileSync(absolutePath);
const filename = path.basename(absolutePath);
const ext = path.extname(filename).toLowerCase();

// Detect MIME type based on extension
const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

const mimeType = mimeTypes[ext] || "application/octet-stream";

// Encode as base64 data URL
const base64Data = fileBuffer.toString("base64");
const dataUrl = `data:${mimeType};base64,${base64Data}`;

// ── Upload to API ───────────────────────────────
const API_BASE = process.env.BONSAI_API_BASE || "http://localhost:3000";
const url = `${API_BASE}/api/tickets/${ticketId}/attachments`;

const payload = {
  filename,
  mimeType,
  data: dataUrl,
  createdByType: "agent",
  createdById: personaId || null,
};

try {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Failed to upload attachment (${response.status})`);
    console.error(errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`✓ Uploaded: ${filename} (${mimeType}) → attachment ID ${result.id}`);
  console.log(`  View at: ${API_BASE}/api/tickets/${ticketId}/attachments/${result.id}`);
} catch (error) {
  console.error(`Error: Failed to upload attachment:`, error.message);
  process.exit(1);
}
