import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 65536;

// field: "title" | "criteria" | "enhance"
export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const { description, field } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const prompts: Record<string, { text: string }> = {
    title: {
      text: `Generate a short ticket title (max 8 words) for this task description. Return ONLY the title, no quotes, no punctuation at the end, no explanation.\n\nDescription:\n${description.trim()}`,
    },
    criteria: {
      text: `Generate acceptance criteria for this task as a markdown checklist. Each item should be a concrete, testable condition. Use "- [ ]" format. Return 3-6 items, ONLY the checklist, no other text.\n\nDescription:\n${description.trim()}`,
    },
    enhance: {
      text: `Fix typos and grammar in this task description. Do NOT change the length, add markdown, add headers, add bullet points, add quotes around it, or rewrite it. Keep the exact same words and structure — only fix obvious errors. If it's already fine, return it unchanged. Return ONLY the raw text with no wrapping quotes.\n\nText:\n${description.trim()}`,
    },
    massage: {
      text: `Fix any typos, spelling errors, grammar issues, and bad formatting in this text. Keep the meaning, tone, and length exactly the same — only correct obvious mistakes. If the text is already clean, return it unchanged. Return ONLY the corrected text, nothing else.\n\nText:\n${description.trim()}`,
    },
    massage_criteria: {
      text: `Convert this spoken voice transcript into a clean markdown checklist of acceptance criteria. Each item should be a concrete, testable condition using "- [ ]" format. Fix any typos, spelling errors, and grammar. Interpret the speaker's intent and break it into clear, separate checklist items. Return ONLY the checklist, no other text.\n\nVoice transcript:\n${description.trim()}`,
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
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    // Strip wrapping quotes the model sometimes adds
    if ((field === "enhance" || field === "massage") && text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    }
    return NextResponse.json({ [field || "title"]: text });
  } catch {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
