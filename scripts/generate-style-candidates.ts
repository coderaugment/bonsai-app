/**
 * Generate one sample avatar per candidate art style for comparison.
 * Run: npx tsx scripts/generate-style-candidates.ts
 * Saves to public/styles/candidates/
 */

import fs from "fs";
import path from "path";

const envPath = path.join(__dirname, "../.env.development");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.0-flash-exp";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CHARACTER = "a female software developer named Nano Banana in her late 20s with short messy hair dyed lavender at the tips, oversized hoodie, headphones around neck, confident smirk";

const CANDIDATE_STYLES: Record<string, string> = {
  ukiyoe:
    "Japanese ukiyo-e woodblock print style portrait. Bold black outlines, flat color areas, traditional Japanese aesthetic. Inspired by Hokusai and Hiroshige. Subtle wood grain texture in the background. Muted earth tones with accent colors of indigo blue and vermillion red. Square format, centered for circular crop.",
  renaissance:
    "Renaissance oil painting portrait in the style of Vermeer and Rembrandt. Rich warm chiaroscuro lighting, dramatic contrast between light and shadow. Visible oil paint brushstrokes and craquelure texture. Deep burgundy and gold color palette. Classical composition with dark moody background. Museum quality. Square format, centered for circular crop.",
  artnouveau:
    "Art Nouveau portrait in the style of Alphonse Mucha. Ornate flowing organic lines, decorative floral borders, elegant curves. Muted jewel-tone palette — gold, teal, dusty rose, sage green. Flat decorative background with intricate botanical patterns. Poster art quality with hand-drawn feel. Square format, centered for circular crop.",
  noir:
    "Black and white film noir portrait. High contrast dramatic lighting with deep shadows and bright highlights. 1940s detective movie aesthetic. Venetian blind shadow patterns. Moody, atmospheric, cinematic. Grainy film texture. Square format, centered for circular crop.",
  lowpoly:
    "Low-poly 3D geometric portrait. Faceted polygonal mesh style with flat-shaded triangular faces. Clean modern aesthetic with bold color gradients across the geometric planes. Soft ambient lighting with subtle edge highlights. Minimalist background. Think Monument Valley game aesthetic. Square format, centered for circular crop.",
  tarot:
    "Mystical tarot card style portrait. Ornate gold borders with esoteric symbols — stars, moons, geometric sacred patterns. Rich jewel-tone colors — deep purple, midnight blue, gold leaf accents. Detailed symbolic illustrations surrounding the figure. Hand-drawn engraving quality with fine linework. Square format, centered for circular crop.",
  cyberpunk:
    "Cyberpunk character portrait. Neon-lit, futuristic aesthetic with glowing accents, holographic elements, and tech implants. Dark moody background with neon color splashes — hot pink, electric cyan, amber. Digital painting style with lens flare and rain. Square format, centered for circular crop.",
  baseball:
    "Vintage baseball card style portrait illustration. Bold outlines, slightly exaggerated features, warm retro color palette. Painted illustration style like classic Topps or Upper Deck trading cards from the 80s-90s. Textured card stock background with subtle grain. Square format, centered for circular crop. Heroic confident pose, dramatic lighting.",
};

async function generateAvatar(stylePrompt: string): Promise<Buffer | null> {
  const prompt = `Portrait of ${CHARACTER}.\n\n${stylePrompt}`;

  const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    console.error(`  API error: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }
  }
  return null;
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY required");
    process.exit(1);
  }

  const outDir = path.join(__dirname, "../public/styles/candidates");
  fs.mkdirSync(outDir, { recursive: true });

  for (const [styleName, stylePrompt] of Object.entries(CANDIDATE_STYLES)) {
    const filename = `${styleName}.png`;
    const filepath = path.join(outDir, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  skip ${filename} (exists)`);
      continue;
    }

    console.log(`  generating ${filename}...`);
    const buf = await generateAvatar(stylePrompt);
    if (buf) {
      fs.writeFileSync(filepath, buf);
      console.log(`  saved ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
    } else {
      console.error(`  FAILED ${filename}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nDone! Check public/styles/candidates/");
}

main();
