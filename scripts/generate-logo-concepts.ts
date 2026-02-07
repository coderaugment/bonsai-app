/**
 * Generate 10 distinct logo concept images for Bonsai.
 * Run: npx tsx scripts/generate-logo-concepts.ts
 * Saves to public/logo-concepts/concept-{n}.png
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

interface LogoConcept {
  id: number;
  name: string;
  prompt: string;
  description: string;
}

const LOGO_CONCEPTS: LogoConcept[] = [
  {
    id: 1,
    name: "Minimalist Bonsai Tree",
    prompt: "Minimalist logo design of a stylized bonsai tree. Clean geometric shapes, simple curved trunk with 2-3 foliage clouds. Flat design aesthetic. Primary color: deep teal/cyan. Accent color: soft pink/magenta for foliage highlights. White/light gray background. Square format, logo centered. Vector-style illustration with smooth curves and balanced composition. Professional, zen aesthetic.",
    description: "Evolution of current logo — refined minimalist bonsai tree with teal/pink color palette, emphasizing zen simplicity and growth."
  },
  {
    id: 2,
    name: "Geometric Branch Network",
    prompt: "Abstract geometric logo design representing interconnected branches or nodes. Angular lines forming a network tree structure that suggests both circuit boards and organic branches. Isometric or angular perspective. Color palette: electric blue, cyan, and white on dark navy background. Sharp clean edges, technical aesthetic. Square format, centered composition. Modern tech brand feel.",
    description: "Network of branches as code architecture — represents distributed AI agents working together in a structured system."
  },
  {
    id: 3,
    name: "Cultivation Cycle Icon",
    prompt: "Circular logo design showing the growth cycle of a plant. Simple icon-style illustration with a seedling sprouting, growing into a small plant, then a stylized tree — all within a circular flow. Line art style with subtle gradient fills. Color palette: fresh green, earthy brown, and sky blue. Circular badge format. Clean, modern, approachable aesthetic. White background.",
    description: "Iterative growth metaphor — represents the continuous development cycle and nurturing process of software cultivation."
  },
  {
    id: 4,
    name: "Code Branch Hybrid",
    prompt: "Logo design merging a git branch diagram with organic tree branches. Left side shows angular code-style brackets and branching lines (like {}), right side transitions into organic flowing tree branches with leaves. Gradient transition from tech blue/purple on left to natural green on right. Square format, centered. Modern flat design style with subtle depth.",
    description: "Literal fusion of code branching and botanical branches — bridges developer tools with organic growth metaphor."
  },
  {
    id: 5,
    name: "Pruning Shears Icon",
    prompt: "Clean icon-style logo of stylized pruning shears or garden scissors. Simplified geometric shapes forming recognizable garden shears. Bold solid color (deep teal or forest green) on light background. Minimal details, easily recognizable at small sizes. Circular badge background in soft cream/beige. Square format, icon centered. Friendly, approachable illustration style.",
    description: "Tool of cultivation — represents intentional pruning, refinement, and careful shaping inherent in both bonsai care and code quality."
  },
  {
    id: 6,
    name: "Terminal Sprout",
    prompt: "Logo design combining a command line terminal window with a sprouting plant. Dark terminal window frame (like VS Code or iTerm) with green text prompt '>_' and a small vibrant green plant sprout growing up from the prompt line. Playful but professional. Color palette: terminal dark gray/black, matrix green for text and sprout. Square format, centered composition.",
    description: "Developer environment meets organic growth — represents code coming to life through AI cultivation in the terminal."
  },
  {
    id: 7,
    name: "Nested Circles Growth",
    prompt: "Abstract logo design using concentric circles or rings that gradually increase in complexity. Inner circle is simple, outer rings have increasingly detailed organic patterns (like tree rings or growth patterns). Color palette: warm gradient from coral/pink center to deep purple outer rings. Flat modern design. Square format, perfectly centered. Hypnotic, balanced composition.",
    description: "Organic growth rings — symbolizes layered complexity, incremental development, and the expanding scope of cultivated projects."
  },
  {
    id: 8,
    name: "Pixel Bonsai",
    prompt: "Pixel art logo of a bonsai tree in retro 8-bit or 16-bit video game style. Chunky pixels, limited color palette (5-6 colors max). Tiny stylized bonsai in a small pot. Color palette: forest green for foliage, brown trunk, terracotta orange pot, with bright cyan and magenta pixel highlights. Black or dark navy background. Square format, centered. Crisp pixel edges, no anti-aliasing.",
    description: "Retro game aesthetic — appeals to developer nostalgia while representing building block nature of code and agents."
  },
  {
    id: 9,
    name: "Abstract 'B' Monogram",
    prompt: "Modern minimalist monogram logo using the letter 'B' for Bonsai. The negative space within the 'B' forms a subtle tree or branch silhouette. Clean sans-serif letterform. Single bold color (deep indigo or forest green) on white background. Geometric precision with organic hidden detail. Square format, monogram centered. Professional, versatile, scalable design.",
    description: "Typographic solution with hidden meaning — clean brand mark that works at any size while subtly encoding the bonsai metaphor."
  },
  {
    id: 10,
    name: "Japanese Hanko Seal",
    prompt: "Logo design inspired by traditional Japanese hanko stamp seals. Square red stamp with stylized bonsai tree icon in white/cream negative space. Bold brushstroke aesthetic, calligraphic energy. Deep vermillion red background (like traditional cinnabar ink), cream/white icon. Subtle texture suggesting carved stone or wood. Square format filling entire frame. Traditional meets modern aesthetic.",
    description: "Cultural homage to bonsai origins — evokes authenticity, craftsmanship, and the deliberate mark of ownership/authorship."
  }
];

async function generateLogo(concept: LogoConcept): Promise<Buffer | null> {
  console.log(`\nGenerating Concept ${concept.id}: ${concept.name}`);
  console.log(`Description: ${concept.description}`);

  const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: concept.prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!res.ok) {
    console.error(`  ❌ API error: ${res.status} ${await res.text()}`);
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
    console.error("❌ GEMINI_API_KEY required in .env.development");
    process.exit(1);
  }

  console.log("🎨 Bonsai Logo Concept Generator");
  console.log("================================\n");
  console.log(`Generating ${LOGO_CONCEPTS.length} distinct logo concepts...\n`);

  const outDir = path.join(__dirname, "../public/logo-concepts");
  fs.mkdirSync(outDir, { recursive: true });

  for (const concept of LOGO_CONCEPTS) {
    const filename = `concept-${concept.id}.png`;
    const filepath = path.join(outDir, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  ⏭️  Skipping ${filename} (already exists)`);
      continue;
    }

    const buf = await generateLogo(concept);
    if (buf) {
      fs.writeFileSync(filepath, buf);
      console.log(`  ✅ Saved ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
    } else {
      console.error(`  ❌ Failed to generate ${filename}`);
    }

    // Rate limit: 2 second delay between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n✨ Done! Logo concepts saved to public/logo-concepts/");
  console.log("\nConcept Summary:");
  console.log("================");
  LOGO_CONCEPTS.forEach((c) => {
    console.log(`\n${c.id}. ${c.name}`);
    console.log(`   ${c.description}`);
  });
}

main();
