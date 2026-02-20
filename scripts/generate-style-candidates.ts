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
  // Original candidates
  ukiyoe:
    "Japanese ukiyo-e woodblock print style portrait. Bold black outlines, flat color areas, traditional Japanese aesthetic. Inspired by Hokusai and Hiroshige. Subtle wood grain texture in the background. Muted earth tones with accent colors of indigo blue and vermillion red. Square format, centered for circular crop.",
  renaissance:
    "Renaissance oil painting portrait in the style of Vermeer and Rembrandt. Rich warm chiaroscuro lighting, dramatic contrast between light and shadow. Visible oil paint brushstrokes and craquelure texture. Deep burgundy and gold color palette. Classical composition with dark moody background. Museum quality. Square format, centered for circular crop.",
  artnouveau:
    "Art Nouveau portrait in the style of Alphonse Mucha. Ornate flowing organic lines, decorative floral borders, elegant curves. Muted jewel-tone palette — gold, teal, dusty rose, sage green. Flat decorative background with intricate botanical patterns. Poster art quality with hand-drawn feel. Square format, centered for circular crop.",
  noir:
    "Black and white film noir portrait. High contrast dramatic lighting with deep shadows and bright highlights. 1940s detective movie aesthetic. Venetian blind shadow patterns. Moody, atmospheric, cinematic. Grainy film texture. Square format, centered for circular crop.",
  lowpoly:
    "Low-poly 3D geometric portrait. Faceted polygonal mesh style with flat-shaded triangular faces. Clean modern aesthetic with bold color gradients across the geometric planes. Soft ambient lighting with subtle edge highlights. Minimalist background. Monument Valley game aesthetic. Square format, centered for circular crop.",
  tarot:
    "Mystical tarot card style portrait. Ornate gold borders with esoteric symbols — stars, moons, geometric sacred patterns. Rich jewel-tone colors — deep purple, midnight blue, gold leaf accents. Detailed symbolic illustrations surrounding the figure. Hand-drawn engraving quality with fine linework. Square format, centered for circular crop.",
  cyberpunk:
    "Cyberpunk character portrait. Neon-lit, futuristic aesthetic with glowing accents, holographic elements, and tech implants. Dark moody background with neon color splashes — hot pink, electric cyan, amber. Digital painting style with lens flare and rain. Square format, centered for circular crop.",
  baseball:
    "Vintage baseball card style portrait illustration. Bold outlines, slightly exaggerated features, warm retro color palette. Painted illustration style like classic Topps or Upper Deck trading cards from the 80s-90s. Textured card stock background with subtle grain. Square format, centered for circular crop. Heroic confident pose, dramatic lighting.",

  // Historical & Cultural
  byzantine:
    "Byzantine icon portrait rendered in egg tempera on gold leaf ground. Hieratic frontal pose, elongated proportions, flat dimensionless drapery in vermillion and cobalt. Stylized almond eyes with spiritual gravity. Reverse perspective and sacred geometry underlying the composition. Square format, centered for circular crop.",
  mughal:
    "Mughal miniature portrait painting on wasli paper. Delicate gouache layered to luminous finish, fine red squirrel brushwork at near-microscopic scale. Flattened perspective, jewel-bright lapis and saffron palette, intricate floral border in the Akbari court tradition. Square format, centered for circular crop.",
  retablo:
    "Mexican retablo ex-voto portrait. Bright enamel paint on tin, naive proportions with frontal gravity. Vivid saturated folk palette — hot pink, cobalt, chrome yellow — set against a tiled architectural backdrop. Sacred humble beauty of votive offering art. Square format, centered for circular crop.",
  persian:
    "Persian miniature manuscript illustration. Fine brushwork in pure mineral pigments — lapis lazuli, malachite, red lead, gold. Flattened isometric space, intricate arabesque border patterns, Safavid court opulence. Square format, centered for circular crop.",
  pictish:
    "Scottish Pictish stone carving aesthetic translated to illustration. Bold knotwork interlace borders, stylized zoomorphic forms, incised line quality with ochre and iron-oxide pigments. Worn stone texture beneath the composition, Iron Age sacred geometry. Square format, centered for circular crop.",
  aboriginal:
    "Aboriginal Australian dot painting portrait. Concentric circles and U-shaped forms describe the figure in the language of sacred site maps. Ochre, white, black, and terracotta earth pigments. Deep encoded meaning beneath the decorative surface. Square format, centered for circular crop.",

  // Print & Graphic
  risograph:
    "Risograph-printed editorial illustration. Limited to 3 spot colors (fluorescent pink, process blue, sunflower yellow) with visible halftone grain and deliberate misregistration overlap. Flat graphic shapes, minimal detail, bold silhouette-forward design. Square format, centered for circular crop.",
  constructivist:
    "Soviet Constructivist propaganda poster style portrait. Bold diagonal composition, restricted palette of revolutionary red, black, and cream. Rodchenko geometric energy, photomontage texture suggestion, strong graphic silhouette. Dynamic tension in every mark. Square format, centered for circular crop.",
  psychedelic:
    "1960s psychedelic concert poster portrait. Swirling organic lines and fluid Art Nouveau revival forms. Vibrating complementary color clash — electric purple against chartreuse, hot orange against cerulean. Victor Moscoso visual language. Square format, centered for circular crop.",
  woodcut:
    "Woodcut portrait in the German Expressionist tradition. Violent angular cuts, aggressive grain, limited tonal range between pure black and bare white paper. Ernst Ludwig Kirchner charged emotional directness, raw psychic energy. Square format, centered for circular crop.",

  // Photography
  cyanotype:
    "Cyanotype photographic portrait. Prussian blue and white only — the entire tonal range in Prussian blue on cream cotton rag paper. Slight bleed at edges, variation in the blue field. Anna Atkins early photography romanticism. Square format, centered for circular crop.",
  daguerreotype:
    "Daguerreotype portrait aesthetic. Silvery grey tonality with mirror-like ground quality, slight warm sepia tone in highlights. Extraordinarily fine mid-tone detail, soft vignette edge fall-off. Formal dignified pose of long-exposure necessity. Square format, centered for circular crop.",
  polaroid:
    "Film Polaroid SX-70 portrait. Warm yellow-shifted tones, soft swirling optical blur from folding optics, characteristic Polaroid color rendering. Slight horizontal banding from uneven development. Instant intimate snapshot energy. Square format, centered for circular crop.",

  // Drawing & Ink
  sumie:
    "Ink wash sumi-e portrait with controlled splatter accents. Monochromatic black ink on rice paper — varying from pale grey washes to rich saturated black. Loose, expressive brushstrokes with deliberate negative space. Zen calligraphic energy, wabi-sabi imperfection. Square format, centered for circular crop.",
  crosshatch:
    "Scratchy pen-and-ink crosshatch portrait with watercolor washes. Dense linework builds form and shadow, loose splashes of muted earth tones bleed outside the lines. Sketchbook quality — raw, immediate, imperfect. Ralph Steadman influenced. Square format, centered for circular crop.",
  pastel:
    "Soft pastel portrait on toned grey Canson paper. Layered chalky strokes blended with fingertip, warm flesh tones built from burnt sienna through pale Naples yellow. Loose hair and edges dissolving into the grey mid-tone ground. Degas-influenced intimacy. Square format, centered for circular crop.",

  // Illustration & Comic Realism
  bowater:
    "A vibrant headshot in the style of Charlie Bowater. Dark blue and dark black color palette, comic art with a realistic color palette, dark black and beige tones, soft-focused realism. Painterly illustration with clean linework and rich shadows. Head and shoulders portrait, square format, centered for circular crop.",
  sony_portrait:
    "Close-up headshot of a stunning fashion model. Ultra-realistic photograph, NOT an illustration, NOT a cartoon, NOT digital art. Shot on a Sony A7III mirrorless camera with a 85mm portrait lens. High quality, sharp focus on the face, shallow depth of field with a soft blurred background. Professional fashion photography lighting. Square format, centered for circular crop.",

  // Contemporary
  memphis:
    "Memphis Design Group portrait illustration. Postmodern squiggles, polka dots, and geometric forms overlaid on the figure. Candy-bright palette — primary yellow, red, turquoise, black. Ettore Sottsass visual grammar applied to the human face. Square format, centered for circular crop.",
  malika:
    "Bold graphic editorial portrait in the style of Malika Favre. Absolute flat color, zero gradients, optical illusion negative space. Deep navy and cream with one small accent color. Hard geometric shapes carving out the face. Square format, centered for circular crop.",
  hardedge:
    "Hard-edge painting portrait in the manner of Ellsworth Kelly. Precise geometric color fields define the face — no line, only edge. Saturated unmodulated hues of cadmium orange, cerulean, and viridian against pure white ground. Square format, centered for circular crop.",

  // Materials
  mosaic:
    "Byzantine mosaic portrait. Thousands of glass smalti tesserae — gold ground, rich lapis, turquoise, vermillion. The slight irregularity of hand-set tiles creates shimmer and life. Sacred golden light radiating from within. Square format, centered for circular crop.",
  stainedglass:
    "Stained glass portrait. Leaded came lines defining strong cloisonné-like divisions between flat saturated color fields. Backlit jewel tones — ruby red, cobalt, amber — with the characteristic color transparency of Chartres Cathedral glass. Square format, centered for circular crop.",
  batik:
    "Batik portrait on hand-waxed cotton cloth. Bold irregular wax-resist outlines, characteristic crackle bleeding of dye through wax cracks, deep indigo and soga brown palette of Javanese batik tradition. Square format, centered for circular crop.",
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
