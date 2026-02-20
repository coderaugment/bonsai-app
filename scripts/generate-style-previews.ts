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
  // Retro & Game
  pixel:
    "Pixel art character portrait in 16-bit retro game style. Crisp pixel edges, limited color palette, no anti-aliasing. Think SNES/GBA era character select screen. Square format, centered for circular crop. Vibrant colors on dark background.",
  action:
    "1980s retro airbrush character portrait painting. Bold dramatic lighting with warm orange and magenta rim lights against a dark gradient background. Stylized and slightly exaggerated features with confident expression. Smooth airbrushed skin, vivid saturated colors, subtle lens flare accents. Retro sci-fi or action aesthetic without any text, titles, or logos. Painterly illustration with visible brushwork and soft glowing highlights. Head and shoulders composition, square format, centered for circular crop.",
  baseball:
    "Vintage baseball card style portrait illustration. Bold outlines, slightly exaggerated features, warm retro color palette. Painted illustration style like classic Topps or Upper Deck trading cards from the 80s-90s. Textured card stock background with subtle grain. Square format, centered for circular crop. Heroic confident pose, dramatic lighting.",
  atari:
    "Atari 2600 era box art portrait painting. Dramatic cosmic background — deep space purple and electric blue gradient. Slightly idealized heroic figure, early home computer era illustration quality, warm golden lighting on face. Flat areas of acrylic paint with hard-edge shadows. Dynamic energetic composition centered for circular crop. Square format.",

  // Photography & Film
  hollywood:
    "A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.",
  noir:
    "Black and white film noir portrait. High contrast dramatic lighting with deep shadows and bright highlights. 1940s detective movie aesthetic. Venetian blind shadow patterns. Cigarette smoke wisps optional. Moody, atmospheric, cinematic. Grainy film texture. Square format, centered for circular crop.",
  polaroid:
    "Film Polaroid SX-70 portrait aesthetic. Warm yellow-shifted tones, soft swirling optical blur from folding SX-70 optics, characteristic Polaroid color rendering — deep saturated shadows, blown-out highlights. Slight horizontal banding from uneven development. Square format centered for circular crop.",
  cyanotype:
    "Cyanotype photographic portrait. Prussian blue and white only — the entire tonal range rendered in Prussian blue on cream cotton rag paper. Slight bleed at edges, variation in the blue field, botanical print texture. Anna Atkins early photography romanticism. Square format, centered for circular crop.",
  daguerreotype:
    "Daguerreotype portrait aesthetic. Silvery grey tonality with mirror-like ground quality, slight warm sepia tone in highlights. Extraordinarily fine mid-tone detail, soft edge fall-off to vignette. Formal dignified pose of long-exposure necessity, the slightly haunted quality of the very first portraits. Square format, centered for circular crop.",

  // Print & Graphic
  popart:
    "Bold Pop Art portrait in the style of Roy Lichtenstein and Andy Warhol. Ben-Day halftone dots, thick black outlines, limited flat color palette of primary colors (red, blue, yellow) plus black and white. Comic book printing style. Graphic and punchy. Square format, centered for circular crop.",
  risograph:
    "Risograph-printed editorial illustration. Limited to 3 spot colors (fluorescent pink, process blue, sunflower yellow) with visible halftone grain and deliberate misregistration overlap. Flat graphic shapes, minimal detail, bold silhouette-forward design. Indie zine aesthetics. Square format, centered for circular crop.",
  constructivist:
    "Soviet Constructivist propaganda poster style portrait. Bold diagonal composition, restricted palette of revolutionary red, black, and cream. Rodchenko geometric energy, photomontage texture suggestion, strong graphic silhouette. Dynamic tension in every mark. Square format, centered for circular crop.",
  psychedelic:
    "1960s psychedelic concert poster portrait. Swirling organic lines and fluid Art Nouveau revival forms. Vibrating complementary color clash — electric purple against chartreuse, hot orange against cerulean. Victor Moscoso visual language, letterform-dissolution aesthetic. Square format, centered for circular crop.",
  wpa:
    "WPA Federal Art Project silkscreen portrait. Deep forest green, brick red, and cream on rough newsprint stock. Dignified subject, labor movement humanism, visible screen texture and ink bleed. 1930s American social realism. Square format, centered for circular crop.",

  // Classical Art
  ukiyoe:
    "Japanese ukiyo-e woodblock print style portrait. Bold black outlines, flat color areas, traditional Japanese aesthetic. Inspired by Hokusai and Hiroshige. Subtle wood grain texture in the background. Muted earth tones with accent colors of indigo blue and vermillion red. Square format, centered for circular crop.",
  flemish:
    "Flemish Renaissance oil portrait in the style of Jan van Eyck. Luminous glazed layers, meticulous fabric textures, jewel-tone palette of deep burgundy, emerald, and gold. Soft diffused window light from the left. Rich chiaroscuro with a dark umber background. Square format, centered for circular crop.",
  byzantine:
    "Byzantine icon portrait rendered in egg tempera on gold leaf ground. Hieratic frontal pose, elongated proportions, flat dimensionless drapery in vermillion and cobalt. Stylized almond eyes with spiritual gravity. Reverse perspective, sacred geometry. Square format, centered for circular crop.",
  baroque:
    "Baroque Caravaggio-style portrait. Tenebrism at full intensity — single raking candlelight carving the face from absolute black. Oil on canvas with visible impasto highlights, muted earth tones of raw umber and lead white, dramatic foreshortening. Square format, centered for circular crop.",
  mughal:
    "Mughal miniature portrait painting on wasli paper. Delicate gouache layered to luminous finish, fine red squirrel brushwork at near-microscopic scale. Flattened perspective, jewel-bright lapis and saffron palette, intricate floral border in the Akbari court tradition. Square format, centered for circular crop.",

  // Drawing & Ink
  sumie:
    "Ink wash sumi-e portrait with controlled splatter accents. Monochromatic black ink on rice paper — varying from pale grey washes to rich saturated black. Loose, expressive brushstrokes with deliberate negative space. Zen calligraphic energy, wabi-sabi imperfection. Square format, centered for circular crop.",
  crosshatch:
    "Scratchy pen-and-ink crosshatch portrait with watercolor washes. Dense linework builds form and shadow, loose splashes of muted earth tones bleed outside the lines. Sketchbook quality — raw, immediate, imperfect. Influenced by Ralph Steadman and Quentin Blake. Square format, centered for circular crop.",
  woodcut:
    "Woodcut portrait in the German Expressionist tradition. Violent angular cuts, aggressive grain, limited tonal range between pure black and bare white paper. Ernst Ludwig Kirchner charged emotional directness, raw psychic energy. Square format, centered for circular crop.",
  linoclaire:
    "Ligne claire bande dessinée portrait in the style of Hergé and Moebius. Clean unvarying outline weight, flat local color, no hatching or shading — only cast shadows as flat shapes. Rational clear-line storytelling aesthetic. Square format, centered for circular crop.",

  // Anime & Animation
  ghibli:
    "Studio Ghibli inspired anime portrait. Soft watercolor textures, warm natural lighting, gentle expressive eyes, delicate linework. Hayao Miyazaki character design aesthetic — whimsical but grounded. Pastel sky background with soft clouds. Square format, centered for circular crop.",
  cyberpunk:
    "Cyberpunk character portrait. Neon-lit, futuristic aesthetic with glowing accents, holographic elements, and tech implants. Dark moody background with neon color splashes — hot pink, electric cyan, amber. Digital painting style with lens flare and rain. Square format, centered for circular crop.",

  // Contemporary & Experimental
  artnouveau:
    "Art Nouveau portrait illustration inspired by Alphonse Mucha. Ornate decorative borders, flowing organic linework, muted pastel palette with gold accents. Elegant floral motifs framing the subject. Lithographic print quality with subtle color gradients. Square format, centered for circular crop.",
  malika:
    "Bold graphic editorial portrait in the style of Malika Favre. Absolute flat color, zero gradients, optical illusion negative space. Two colors maximum — deep navy and cream — with one small accent. Hard geometric shapes carving out the face. Square format, centered for circular crop.",
  tarot:
    "Mystical tarot card style portrait. Ornate gold borders with esoteric symbols — stars, moons, geometric sacred patterns. Rich jewel-tone colors — deep purple, midnight blue, gold leaf. Detailed symbolic illustrations surrounding the figure. Hand-drawn engraving quality with fine linework. Square format, centered for circular crop.",
  memphis:
    "Memphis Design Group portrait illustration. Postmodern squiggles, polka dots, and geometric forms overlaid on the figure. Candy-bright palette — primary yellow, red, turquoise, black. Ettore Sottsass visual grammar applied to the human face. Square format, centered for circular crop.",

  // Illustration & Comic Realism
  bowater:
    "A vibrant headshot in the style of Charlie Bowater. Dark blue and dark black color palette, comic art with a realistic color palette, dark black and beige tones, soft-focused realism. Painterly illustration with clean linework and rich shadows. Head and shoulders portrait, square format, centered for circular crop.",
  sony_portrait:
    "Close-up headshot of a stunning fashion model. Ultra-realistic photograph, NOT an illustration, NOT a cartoon, NOT digital art. Shot on a Sony A7III mirrorless camera with a 85mm portrait lens. High quality, sharp focus on the face, shallow depth of field with a soft blurred background. Professional fashion photography lighting. Square format, centered for circular crop.",

  // Cultural & Regional
  retablo:
    "Mexican retablo ex-voto portrait. Bright enamel paint on tin, naive proportions with frontal gravity. Vivid saturated folk palette — hot pink, cobalt, chrome yellow — set against a tiled architectural backdrop. Sacred humble beauty of votive offering art. Square format, centered for circular crop.",
  persian:
    "Persian miniature manuscript illustration style. Fine brushwork in pure mineral pigments — lapis lazuli, malachite, red lead, and gold. Flattened isometric space, intricate pattern-on-pattern background, delicate arabesque borders. Safavid court opulence. Square format, centered for circular crop.",
  kente:
    "West African adinkra-inspired portrait. Geometric symbolic shapes in deep indigo on woven ground, sacred motifs surrounding the figure. Bold graphic palette of black, gold, and terracotta with the warmth and authority of traditional ceremony. Square format, centered for circular crop.",

  // Materials & Texture
  mosaic:
    "Byzantine mosaic portrait. Thousands of glass smalti tesserae — gold ground, rich lapis, turquoise, vermillion. The slight irregularity of hand-set tiles creates shimmer and life. Sacred golden light radiating from within the portrait. Square format, centered for circular crop.",
  stainedglass:
    "Stained glass portrait aesthetic. Leaded came lines defining strong cloisonné-like divisions between flat saturated color fields. Backlit jewel tones — ruby red, cobalt, amber — with the characteristic color transparency of Chartres Cathedral glass. Square format, centered for circular crop.",
  batik:
    "Batik portrait on hand-waxed cotton cloth. Bold irregular wax-resist outlines, characteristic crackle bleeding of dye through wax cracks, deep indigo and soga brown palette of Javanese batik tradition. The deliberate imprecision of wax and dye chemistry. Square format, centered for circular crop.",
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
