import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/db/queries";

const PROMPT_KEYS = ["prompt_avatar_style"] as const;
type PromptKey = (typeof PROMPT_KEYS)[number];

const DEFAULTS: Record<PromptKey, string> = {
  prompt_avatar_style: `A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.`,
};

export async function GET() {
  const prompts: Record<string, { value: string; isDefault: boolean }> = {};

  for (const key of PROMPT_KEYS) {
    const stored = getSetting(key);
    prompts[key] = {
      value: stored ?? DEFAULTS[key],
      isDefault: !stored,
    };
  }

  return NextResponse.json({ prompts, defaults: DEFAULTS });
}

export async function POST(req: Request) {
  const { key, value } = await req.json();

  if (!PROMPT_KEYS.includes(key as PromptKey)) {
    return NextResponse.json({ error: "Invalid prompt key" }, { status: 400 });
  }

  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Value required" }, { status: 400 });
  }

  // If value matches default, remove it from settings (use default)
  const trimmed = (value as string).trim();
  if (trimmed === DEFAULTS[key as PromptKey]) {
    // Store it anyway so "isDefault" stays false if they explicitly saved
    setSetting(key, trimmed);
  } else {
    setSetting(key, trimmed);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { key } = await req.json();

  if (!PROMPT_KEYS.includes(key as PromptKey)) {
    return NextResponse.json({ error: "Invalid prompt key" }, { status: 400 });
  }

  // Reset to default by removing from settings
  const { db } = await import("@/db");
  const { settings } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  db.delete(settings).where(eq(settings.key, key)).run();

  return NextResponse.json({ success: true, value: DEFAULTS[key as PromptKey] });
}
