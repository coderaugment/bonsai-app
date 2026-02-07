#!/usr/bin/env node

/**
 * nano-banana — CLI image generation tool using Gemini
 *
 * Usage:
 *   nano-banana.mjs --prompt "a minimalist bonsai logo" --output ./logo.png
 *   nano-banana.mjs --prompt "pixel art tree icon" --output ./icons/tree.png
 *
 * Requires GEMINI_API_KEY environment variable.
 */

const MODEL = "gemini-3-pro-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--prompt" && argv[i + 1]) {
      args.prompt = argv[++i];
    } else if (argv[i] === "--output" && argv[i + 1]) {
      args.output = argv[++i];
    } else if (argv[i] === "--ticket" && argv[i + 1]) {
      args.ticket = argv[++i];
    } else if (argv[i] === "--persona" && argv[i + 1]) {
      args.persona = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      args.help = true;
    }
  }
  return args;
}

async function attachToTicket(filePath, ticketId, personaId) {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const filename = path.basename(absolutePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/png";
  const base64Data = fileBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  const API_BASE = process.env.BONSAI_API_BASE || "http://localhost:3000";
  const url = `${API_BASE}/api/tickets/${ticketId}/attachments`;
  const payload = {
    filename, mimeType, data: dataUrl,
    createdByType: "agent", createdById: personaId || null,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  ATTACH ERROR (${response.status}): ${errorText}`);
    return false;
  }
  const result = await response.json();
  console.log(`  ✓ Attached to ticket ${ticketId}: ${filename} → attachment ID ${result.id}`);
  return true;
}

const args = parseArgs(process.argv);

if (args.help || !args.prompt || !args.output) {
  console.log(`Usage: nano-banana.mjs --prompt "description" --output path/to/image.png [--ticket tkt_XX] [--persona pXX]`);
  console.log(`\nGenerates an image using Gemini and saves it to disk.`);
  console.log(`When --ticket is provided, automatically attaches the image to the ticket.`);
  console.log(`Requires GEMINI_API_KEY environment variable.`);
  process.exit(args.help ? 0 : 1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERROR: GEMINI_API_KEY environment variable not set");
  process.exit(1);
}

try {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: args.prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini API error (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const candidates = data.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data: b64 } = part.inlineData;
        const ext = mimeType.includes("png") ? ".png" : mimeType.includes("jpeg") ? ".jpg" : ".png";
        const outputPath = args.output.match(/\.(png|jpg|jpeg|webp|gif)$/i)
          ? args.output
          : `${args.output}${ext}`;

        const dir = path.dirname(outputPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));

        const absPath = path.resolve(outputPath);
        console.log(`Image saved: ${absPath}`);

        // Auto-attach to ticket if --ticket was provided
        if (args.ticket) {
          const ok = await attachToTicket(absPath, args.ticket, args.persona);
          if (!ok) {
            console.error(`WARNING: Image saved but failed to attach to ticket ${args.ticket}`);
          }
        }

        process.exit(0);
      }
    }

    // Check for text-only response (generation refused or no image)
    for (const part of parts) {
      if (part.text) {
        console.log(`Gemini response (text only): ${part.text}`);
      }
    }
  }

  console.error("No image data in Gemini response");
  process.exit(1);
} catch (err) {
  console.error("Image generation failed:", err.message || err);
  process.exit(1);
}
