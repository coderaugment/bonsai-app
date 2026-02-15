import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Guardrails appended to every generated style
const STYLE_SUFFIX = "No text, no watermarks, no logos. Square format, centered for circular crop.";

const EXAMPLES = [
  "Ukiyo-e woodblock print portrait. Bold black outlines, flat areas of rich color — indigo, vermillion, gold leaf accents. Washi paper texture visible through the ink. Influenced by Hokusai and Sharaku's kabuki actor prints. Dramatic composition with decorative patterns in clothing.",
  "Risograph-printed editorial illustration. Limited to 3 spot colors (teal, coral, mustard) with visible halftone grain and slight misregistration overlap. Flat graphic shapes, minimal detail, bold silhouette-forward design. Inspired by modern indie zine aesthetics.",
  "Flemish Renaissance oil portrait in the style of Jan van Eyck. Luminous glazed layers, meticulous fabric textures, jewel-tone palette of deep burgundy, emerald, and gold. Soft diffused window light from the left. Rich chiaroscuro with a dark umber background.",
  "Vintage 1950s travel poster illustration. Gouache on board with bold simplified shapes, limited palette of 4-5 flat colors, strong geometric composition. Inspired by the TWA and Air France poster era. Clean vector-like edges with subtle paper grain texture.",
  "Ink wash sumi-e portrait with controlled splatter accents. Monochromatic black ink on rice paper — varying from pale grey washes to rich saturated black. Loose, expressive brushstrokes with deliberate negative space. Zen calligraphic energy, wabi-sabi imperfection.",
  "Art Nouveau portrait illustration inspired by Alphonse Mucha. Ornate decorative borders, flowing organic linework, muted pastel palette with gold accents. Elegant floral motifs framing the subject. Lithographic print quality with subtle color gradients.",
  "Scratchy pen-and-ink crosshatch portrait with watercolor washes. Dense linework builds form and shadow, loose splashes of muted earth tones bleed outside the lines. Sketchbook quality — raw, immediate, imperfect. Influenced by Ralph Steadman and Quentin Blake.",
];

export async function POST() {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Here are examples of richly detailed avatar art style prompts. Notice how each one specifies a medium, names specific colors, describes textures, references real artists or movements, and paints a vivid picture:\n\n${EXAMPLES.map((e, i) => `${i + 1}. ${e}`).join("\n\n")}\n\nNow generate one new art style prompt that is DIFFERENT from all of the above. Match the same level of specificity and richness — name exact colors, describe textures, reference specific artists or art movements, specify the rendering medium. 3-5 sentences. Do NOT mention pixel art, anime, synthwave, pop art, claymation, or chibi. Output ONLY the style description, nothing else.` }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[generate-style] Gemini ${res.status}:`, err);
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      return NextResponse.json({ error: "No text in response" }, { status: 502 });
    }

    // Strip any numbering prefix like "8." or "1."
    text = text.replace(/^\d+\.\s*/, "");

    // If response was truncated (doesn't end with punctuation), trim to last complete sentence
    if (!/[.!]$/.test(text)) {
      const lastPeriod = text.lastIndexOf(".");
      if (lastPeriod > 50) {
        text = text.slice(0, lastPeriod + 1);
      }
    }

    // Append guardrails if not already present
    if (!text.includes("Square format")) {
      text = `${text} ${STYLE_SUFFIX}`;
    }

    return NextResponse.json({ style: text });
  } catch (err) {
    console.error("[generate-style] failed:", err);
    return NextResponse.json({ error: "Style generation failed" }, { status: 500 });
  }
}
