import { NextResponse } from "next/server";
import type { WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function gemini(prompt: string, temperature = 1.0): Promise<Record<string, string>> {
  const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Gemini API error:", err);
    throw new Error("Gemini API error");
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
}

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { role, field, name, gender, existingNames } = await req.json();
  const takenNames: string[] = Array.isArray(existingNames) ? existingNames : [];
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  const config = workerRoles[role as WorkerRole] || { label: role.replace(/_/g, " ") };
  const g = gender || "male";
  const takenClause = takenNames.length > 0
    ? `\nIMPORTANT: Do NOT use any of these already-taken names: ${takenNames.join(", ")}. Pick something completely different.`
    : "";

  const rerollField = field || "all";
  let prompt: string;

  if (rerollField === "name") {
    prompt = `Generate a first name for a ${g} ${config.label.toLowerCase()} on a software team.

Pick a real human name — it should feel like a believable person you'd actually meet. Draw from any culture worldwide. Vary it: sometimes common (Mike, Sara, Tom, Priya), sometimes less common (Soren, Amara, Kenji, Lucia). Just make it sound like a real person, not a fantasy character.${takenClause}

Return ONLY valid JSON: {"name": "..."}`;
  } else if (rerollField === "appearance") {
    prompt = `Generate a 1-2 sentence visual description of a ${g} ${config.label.toLowerCase()} on a software team. Invent a believable, coherent person — their skin tone, hair, clothing style, and any accessories should all feel like they belong to the same real human being. Be specific and vivid. Do NOT use any name. Do NOT reference nationality or ethnicity by name. Do NOT use the word "lean". This description drives an AI avatar generator, so be visually descriptive.

Return ONLY valid JSON: {"appearance": "..."}`;
  } else {
    const hasName = name && name.trim();
    prompt = `Invent a ${g} ${config.label.toLowerCase()} character for a software team${hasName ? ` named ${name}` : ""}.

Create a coherent, believable person — someone you might actually work with. Their name, skin tone, hair, clothing, and accessories should all feel like they naturally belong to the same person. Be creative and diverse across generations. Vary widely: sometimes a 20-something in a hoodie, sometimes a 50-year-old in a tailored blazer, sometimes a punk rocker, sometimes buttoned-up preppy. Mix it up every time.

${hasName ? "" : `Name: A real first name that fits this person. Draw from any culture worldwide. Sometimes common, sometimes distinctive — just believable. No fantasy names.${takenClause}\n`}Appearance: 1-2 vivid sentences describing what they look like. Mention skin tone, hair (color, style, texture), clothing style, and optionally an accessory (glasses, headphones, piercings, hat, etc). Do NOT use any name — write in third person. Do NOT reference nationality or ethnicity by name. Do NOT use the word "lean". This drives an AI avatar generator.

Return ONLY valid JSON:
{${hasName ? "" : '"name": "...", '}"appearance": "..."}`;
  }

  try {
    const parsed = await gemini(prompt);
    const result: Record<string, unknown> = { success: true };
    if (parsed.appearance) result.appearance = parsed.appearance;

    // Enforce name uniqueness
    if (parsed.name) {
      const takenLower = takenNames.map((n: string) => n.toLowerCase());
      if (takenLower.includes(parsed.name.toLowerCase())) {
        console.log(`[generate-worker] Name "${parsed.name}" collides, retrying...`);
        try {
          const retry = await gemini(
            `Generate a single first name for a ${g} ${config.label.toLowerCase()} on a software team. Real name, any culture. Do NOT use ANY of these: ${takenNames.join(", ")}. Return ONLY valid JSON: {"name": "..."}`
          );
          if (retry.name && !takenLower.includes(retry.name.toLowerCase())) {
            result.name = retry.name;
          } else {
            result.name = parsed.name; // give up
          }
        } catch {
          result.name = parsed.name;
        }
      } else {
        result.name = parsed.name;
      }
    }

    // Backwards compat: personality field
    if (parsed.appearance) {
      result.personality = parsed.appearance;
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Worker generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
