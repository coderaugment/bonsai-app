import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// field: "title" | "criteria" | "enhance"
export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { description, field } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const prompts: Record<string, { text: string; tokens: number }> = {
    title: {
      text: `Generate a short ticket title (max 8 words) for this task description. Return ONLY the title, no quotes, no punctuation at the end, no explanation.\n\nDescription:\n${description.trim()}`,
      tokens: 1024,
    },
    criteria: {
      text: `Generate acceptance criteria for this task as a markdown checklist. Each item should be a concrete, testable condition. Use "- [ ]" format. Return 3-6 items, ONLY the checklist, no other text.\n\nDescription:\n${description.trim()}`,
      tokens: 1024,
    },
    enhance: {
      text: `Improve this task description to be clearer and more detailed for a developer. Keep the same intent but add specificity, technical context, and clear scope. Return ONLY the improved description, no preamble.\n\nOriginal:\n${description.trim()}`,
      tokens: 2048,
    },
    massage: {
      text: `Fix any typos, spelling errors, grammar issues, and bad formatting in this text. Keep the meaning, tone, and length exactly the same — only correct obvious mistakes. If the text is already clean, return it unchanged. Return ONLY the corrected text, nothing else.\n\nText:\n${description.trim()}`,
      tokens: 2048,
    },
  };

  const config = prompts[field || "title"];
  if (!config) {
    return NextResponse.json({ error: "invalid field" }, { status: 400 });
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: config.text }] }],
        generationConfig: { maxOutputTokens: config.tokens },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return NextResponse.json({ [field || "title"]: text });
  } catch {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
