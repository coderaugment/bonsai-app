#!/usr/bin/env node

/**
 * nano-banana — Gemini AI image & code generation CLI
 *
 * Image generation (default):
 *   nano-banana "iPhone contacts list UI, dark theme"
 *   nano-banana "sombrero icon" --transparent
 *   nano-banana "dashboard mockup" --output designs/dash.png
 *   nano-banana "login screen" --ticket tkt_04 --persona p01
 *
 * Code generation:
 *   nano-banana --text "React component for a contact card with hover effects"
 *
 * Flags:
 *   --output FILE      Save image to specific path (default: designs/nano-{timestamp}.png)
 *   --transparent      Make 50% gray background transparent (for cut-out images)
 *   --text PROMPT      Generate code/text instead of an image
 *   --ticket ID        Auto-attach generated image to a Bonsai ticket
 *   --persona ID       Tag attachment with persona ID
 *   --help             Show this help
 *
 * Requires GEMINI_API_KEY environment variable.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const TEXT_MODEL = "gemini-3-pro-preview";
const API_BASE = process.env.BONSAI_API_BASE || "http://localhost:3000";

// ── Parse CLI args ──────────────────────────────
function parseArgs(argv) {
  const a = { imagePrompt: null, textPrompt: null, output: null, ticket: null, persona: null, transparent: false, help: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") { a.help = true; }
    else if (arg === "--transparent" || arg === "-t") { a.transparent = true; }
    else if (arg === "--text" && rest[i + 1]) { a.textPrompt = rest[++i]; }
    else if (arg === "--output" && rest[i + 1]) { a.output = rest[++i]; }
    else if (arg === "--ticket" && rest[i + 1]) { a.ticket = rest[++i]; }
    else if (arg === "--persona" && rest[i + 1]) { a.persona = rest[++i]; }
    else if (!arg.startsWith("--") && !a.imagePrompt) { a.imagePrompt = arg; }
  }
  return a;
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log(`nano-banana — Gemini AI generation tool

Image (default):  nano-banana "prompt describing the UI"
Code/text:        nano-banana --text "prompt for code generation"

Options:
  --output FILE     Save image path (default: designs/nano-<ts>.png)
  --transparent     Make 50% gray background transparent (for cut-outs)
  --ticket ID       Auto-attach image to Bonsai ticket
  --persona ID      Tag the attachment with a persona
  --help            Show this help`);
  process.exit(0);
}

if (!args.imagePrompt && !args.textPrompt) {
  console.error("Error: provide an image prompt or --text prompt. Run with --help for usage.");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable not set");
  process.exit(1);
}

// ── Make 50% gray transparent ───────────────────
async function makeGrayTransparent(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Use ImageMagick to convert 50% gray (#808080, rgb(128,128,128)) to transparent
    // -fuzz allows for slight variations in the gray color
    const magick = spawn("magick", [
      inputPath,
      "-fuzz", "5%",
      "-transparent", "rgb(128,128,128)",
      outputPath
    ]);

    let stderr = "";
    magick.stderr.on("data", (data) => { stderr += data.toString(); });

    magick.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ImageMagick failed (${code}): ${stderr}`));
      } else {
        console.log(`Transparency applied: ${path.resolve(outputPath)}`);
        resolve(outputPath);
      }
    });

    magick.on("error", (err) => {
      reject(new Error(`Failed to run ImageMagick (is it installed?): ${err.message}`));
    });
  });
}

// ── Attach image to ticket ──────────────────────
async function attachToTicket(filePath, ticketId, personaId) {
  const abs = path.resolve(filePath);
  const buf = fs.readFileSync(abs);
  const filename = path.basename(abs);
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
  const mimeType = mimeMap[ext] || "image/png";
  const dataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;

  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, mimeType, data: dataUrl, createdByType: "agent", createdById: personaId || null }),
  });
  if (!res.ok) {
    console.error(`ATTACH FAILED (${res.status}): ${await res.text()}`);
    return false;
  }
  const result = await res.json();
  console.log(`Attached to ticket ${ticketId}: ${filename} (attachment ${result.id})`);
  return true;
}

// ── Generate image ──────────────────────────────
async function generateImage(prompt, outputPath, makeTransparent = false) {
  // Enforce 50% gray background for all images
  const enhancedPrompt = `${prompt}\n\nIMPORTANT: The background MUST be a solid 50% gray color (RGB 128,128,128 or hex #808080). No gradients, no other colors in the background.`;

  console.log(`Generating image: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);
  if (makeTransparent) {
    console.log("Note: 50% gray background will be made transparent");
  }

  const res = await fetch(`${ENDPOINT}/${IMAGE_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: enhancedPrompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini API error (${res.status}): ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const buf = Buffer.from(part.inlineData.data, "base64");
      const dir = path.dirname(outputPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, buf);
      console.log(`Image saved: ${path.resolve(outputPath)} (${(buf.length / 1024).toFixed(0)}KB)`);
      return path.resolve(outputPath);
    }
    if (part.text) {
      console.log(`Gemini note: ${part.text}`);
    }
  }

  console.error("No image data in Gemini response");
  process.exit(1);
}

// ── Generate text/code ──────────────────────────
async function generateText(prompt) {
  console.log(`Generating text: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);

  const res = await fetch(`${ENDPOINT}/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini API error (${res.status}): ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) {
    console.log(text);
  } else {
    console.error("No text in Gemini response");
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────
if (args.imagePrompt) {
  const outputPath = args.output || `designs/nano-${Date.now()}.png`;
  let saved = await generateImage(args.imagePrompt, outputPath, args.transparent);

  // Apply transparency if requested
  if (args.transparent && saved) {
    const transparentPath = outputPath.replace(/\.(png|jpg|jpeg)$/i, "-transparent.png");
    try {
      await makeGrayTransparent(saved, transparentPath);
      saved = transparentPath;
    } catch (err) {
      console.error(`Transparency processing failed: ${err.message}`);
      console.log("Continuing with original image (with gray background)");
    }
  }

  if (args.ticket && saved) {
    await attachToTicket(saved, args.ticket, args.persona);
  }
}

if (args.textPrompt) {
  await generateText(args.textPrompt);
}
