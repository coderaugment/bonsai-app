#!/usr/bin/env node
/**
 * Gemini UI Generation Tool (nano banana)
 *
 * Usage:
 *   node gemini-generate.mjs --text "Generate a React component for a login form"
 *   node gemini-generate.mjs --image "A modern dark-themed dashboard with charts" --output dashboard.png
 *   node gemini-generate.mjs --image "iPhone contacts UI mockup" --output mockup.png --text "Also describe the layout"
 *
 * Modes:
 *   --text "prompt"   Generate text (code, design specs, etc.) using gemini-3-pro-preview
 *   --image "prompt"  Generate an image using gemini-3-pro-image-preview (nano banana)
 *   --output file     Save image to file (default: generated-{timestamp}.png)
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY not set");
  process.exit(1);
}

import fs from "fs";
import path from "path";

// Parse args
const args = process.argv.slice(2);
let textPrompt = null;
let imagePrompt = null;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--text" && args[i + 1]) textPrompt = args[++i];
  else if (args[i] === "--image" && args[i + 1]) imagePrompt = args[++i];
  else if (args[i] === "--output" && args[i + 1]) outputFile = args[++i];
  else if (!textPrompt && !imagePrompt) textPrompt = args[i]; // bare arg = text prompt
}

if (!textPrompt && !imagePrompt) {
  console.error("Usage: gemini-generate.mjs --text 'prompt' | --image 'prompt' [--output file.png]");
  process.exit(1);
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

async function generateText(prompt) {
  const model = "gemini-3-pro-preview"; // nano banana - text mode
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini text API error (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) {
    console.log(text);
  } else {
    console.error("No text in response:", JSON.stringify(data, null, 2));
  }
}

async function generateImage(prompt, outPath) {
  const model = "gemini-3-pro-image-preview"; // nano banana - image mode
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Gemini image API error (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  let savedImage = false;
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const ext = part.inlineData.mimeType.split("/")[1] || "png";
      const finalPath = outPath || `generated-${Date.now()}.${ext}`;
      const buf = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(finalPath, buf);
      console.log(`Image saved: ${path.resolve(finalPath)} (${buf.length} bytes)`);
      savedImage = true;
    } else if (part.text) {
      console.log(part.text);
    }
  }

  if (!savedImage) {
    console.error("No image data in response. Parts received:", parts.map(p => p.text ? "text" : p.inlineData?.mimeType || "unknown").join(", "));
  }
}

// Run
if (imagePrompt) {
  await generateImage(imagePrompt, outputFile);
}
if (textPrompt) {
  await generateText(textPrompt);
}
