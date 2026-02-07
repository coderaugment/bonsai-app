/**
 * Generate preview avatar images for each art style.
 * Run: npx tsx scripts/generate-style-previews.ts
 * Saves to public/styles/{style}-{n}.png
 */

import fs from "fs";
import path from "path";

// Load env from .env.development
const envPath = path.join(__dirname, "../.env.development");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-pro-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const STYLES: Record<string, string> = {
  pixel:
    "Pixel art character portrait in 16-bit retro game style. Crisp pixel edges, limited color palette, no anti-aliasing. Think SNES/GBA era character select screen. Square format, centered for circular crop. Vibrant colors on dark background.",
  cyberpunk:
    "Cyberpunk character portrait. Neon-lit, futuristic aesthetic with glowing accents, holographic elements, and tech implants. Dark moody background with neon color splashes. Digital painting style. Square format, centered for circular crop.",
  hollywood:
    "A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.",
  baseball:
    "Vintage baseball card style portrait illustration. Bold outlines, slightly exaggerated features, warm retro color palette. Painted illustration style like classic Topps or Upper Deck trading cards from the 80s-90s. Textured card stock background with subtle grain. Square format, centered for circular crop. Heroic confident pose, dramatic lighting.",
  ghibli:
    "Studio Ghibli inspired anime portrait. Soft watercolor textures, warm natural lighting, gentle expressive eyes, delicate linework. Hayao Miyazaki character design aesthetic — whimsical but grounded. Pastel sky background with soft clouds. Square format, centered for circular crop.",
  noir:
    "Black and white film noir portrait. High contrast dramatic lighting with deep shadows and bright highlights. 1940s detective movie aesthetic. Venetian blind shadow patterns. Cigarette smoke wisps optional. Moody, atmospheric, cinematic. Grainy film texture. Square format, centered for circular crop.",
  popart:
    "Bold Pop Art portrait in the style of Roy Lichtenstein and Andy Warhol. Ben-Day halftone dots, thick black outlines, limited flat color palette of primary colors (red, blue, yellow) plus black and white. Comic book printing style. Graphic and punchy. Square format, centered for circular crop.",
  ukiyoe:
    "Japanese ukiyo-e woodblock print style portrait. Bold black outlines, flat color areas, traditional Japanese aesthetic. Inspired by Hokusai and Hiroshige. Subtle wood grain texture in the background. Muted earth tones with accent colors of indigo blue and vermillion red. Square format, centered for circular crop.",
  action:
    "1980s retro airbrush character portrait painting. Bold dramatic lighting with warm orange and magenta rim lights against a dark gradient background. Stylized and slightly exaggerated features with confident expression. Smooth airbrushed skin, vivid saturated colors, subtle lens flare accents. Retro sci-fi or action aesthetic without any text, titles, or logos. Painterly illustration with visible brushwork and soft glowing highlights. Head and shoulders composition, square format, centered for circular crop.",
};

const SAMPLE_CHARACTERS = [
  { desc: "a female software developer in her late 20s with short cropped hair and streetwear clothing", role: "developer" },
  { desc: "a male designer in his early 30s with curly hair and minimalist clothing", role: "designer" },
  { desc: "a female project manager in her 40s with braided hair and classic professional attire", role: "manager" },
];

async function generateAvatar(characterDesc: string, stylePrompt: string): Promise<Buffer | null> {
  const prompt = `Portrait of ${characterDesc}.\n\n${stylePrompt}`;

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

  const outDir = path.join(__dirname, "../public/styles");
  fs.mkdirSync(outDir, { recursive: true });

  for (const [styleName, stylePrompt] of Object.entries(STYLES)) {
    for (let i = 0; i < SAMPLE_CHARACTERS.length; i++) {
      const char = SAMPLE_CHARACTERS[i];
      const filename = `${styleName}-${i + 1}.png`;
      const filepath = path.join(outDir, filename);

      if (fs.existsSync(filepath)) {
        console.log(`  skip ${filename} (exists)`);
        continue;
      }

      console.log(`  generating ${filename}...`);
      const buf = await generateAvatar(char.desc, stylePrompt);
      if (buf) {
        fs.writeFileSync(filepath, buf);
        console.log(`  saved ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
      } else {
        console.error(`  FAILED ${filename}`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("Done!");
}

main();
