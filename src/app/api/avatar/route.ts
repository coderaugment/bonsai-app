import { NextResponse } from "next/server";
import { getSetting } from "@/db/queries";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-pro-image-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const DEFAULT_STYLE = `A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.`;

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { name, role, personality } = await req.json();

  if (!name || !role) {
    return NextResponse.json({ error: "name and role are required" }, { status: 400 });
  }

  const stylePrompt = getSetting("prompt_avatar_style") || DEFAULT_STYLE;
  console.log("[avatar] style prompt source:", getSetting("prompt_avatar_style") ? "custom" : "default");
  const prompt = buildAvatarPrompt(name, role, personality, stylePrompt);

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();

    // Extract inline image data from response
    const candidates = data.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData) {
          const { mimeType, data: b64 } = part.inlineData;
          const dataUrl = `data:${mimeType};base64,${b64}`;
          return NextResponse.json({ success: true, avatar: dataUrl });
        }
      }
    }

    return NextResponse.json({ error: "No image in response" }, { status: 502 });
  } catch (err) {
    console.error("Avatar generation failed:", err);
    return NextResponse.json({ error: "Avatar generation failed" }, { status: 500 });
  }
}

function buildAvatarPrompt(name: string, role: string, personality: string | undefined, stylePrompt: string): string {
  // The personality has two paragraphs: appearance (first) and communication style (second)
  // Use the appearance paragraph for the avatar. Fall back to a generic role description.
  const fallbacks: Record<string, string> = {
    developer: "a software developer wearing a hoodie, messy hair, glasses",
    researcher: "a research analyst with wire-frame glasses, button-down shirt",
    designer: "a UI/UX designer with stylish accessories, creative energy",
    manager: "a project manager, polished professional attire, confident smile",
  };

  let appearance = fallbacks[role] || fallbacks.developer;
  if (personality) {
    const firstParagraph = personality.split("\n\n")[0].trim();
    if (firstParagraph.length > 10) {
      appearance = firstParagraph;
    }
  }

  return `Portrait of ${appearance}.

${stylePrompt}`;
}
