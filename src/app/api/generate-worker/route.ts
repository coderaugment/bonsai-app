import { NextResponse } from "next/server";
import type { WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  // name + gender provided by user, field: "all" (default), "appearance", "style"
  const { role, field, name, gender } = await req.json();
  if (!role || !workerRoles[role as WorkerRole]) {
    return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
  }

  const config = workerRoles[role as WorkerRole];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const g = gender || "male";
  const age = pick(["early 20s", "late 20s", "early 30s", "late 30s", "early 40s", "late 40s", "50s"]);
  const hair = pick(["short cropped", "long flowing", "buzzcut", "curly", "braided", "shaved sides with top knot", "shoulder-length wavy", "afro", "slicked back", "messy bedhead"]);
  const clothingStyle = pick(["streetwear", "minimalist", "vintage", "athletic", "punk-influenced", "preppy", "bohemian", "workwear", "techwear", "classic professional"]);
  const commStyle = pick(["direct and blunt", "warm and encouraging", "dry and witty", "casual and laid-back", "precise and methodical", "energetic and enthusiastic"]);

  const rerollField = field || "all";
  let prompt: string;

  if (rerollField === "appearance") {
    prompt = `Generate a visual description for a ${g} ${config.label.toLowerCase()} named ${name || "unknown"} on a software team.
Traits: ${age}, ${hair} hair, ${clothingStyle} clothing.
Appearance: 1-2 sentences describing what they look like. Use their name. Include the traits above plus build, accessories, or distinguishing features. This drives their avatar image.
Return ONLY valid JSON: {"appearance": "..."}`;
  } else if (rerollField === "style") {
    prompt = `Write a 1-2 sentence communication style for a ${config.label.toLowerCase()} on a software team. They are ${commStyle}. They are a competent professional, not a joke character. Do NOT use any name — describe the style generically.
Return ONLY valid JSON: {"style": "..."}`;
  } else {
    prompt = `Generate a ${g} ${config.label.toLowerCase()} character for a software team named ${name || "unknown"}.

REQUIRED TRAITS (use these exactly):
- Gender: ${g}
- Age: ${age}
- Hair: ${hair}
- Clothing style: ${clothingStyle}
- Communication: ${commStyle}

Appearance: 1-2 sentences incorporating ALL the traits above. Use their name "${name || "unknown"}". Add build, accessories, or distinguishing features. This drives their avatar image.

Style: 1-2 sentences about their ${commStyle} communication style in work chat. They are a competent professional, not a joke character. Do NOT reference the name in the style — keep it generic.

Return ONLY valid JSON:
{"appearance": "...", "style": "..."}`;
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 1.0,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const parsed = JSON.parse(text);
    const result: Record<string, unknown> = { success: true };
    if (parsed.name) result.name = parsed.name;
    if (parsed.appearance) result.appearance = parsed.appearance;
    if (parsed.style) result.style = parsed.style;
    // For backwards compat: combined personality field
    if (parsed.appearance || parsed.style) {
      result.personality = [parsed.appearance, parsed.style].filter(Boolean).join("\n\n");
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Worker generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
