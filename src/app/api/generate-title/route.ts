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
      text: `You are a copy editor for kanban tickets. Reorganize and clean up the messy text below into a well-structured ticket description.

What to fix:
- Turn bare word lists into inline comma-separated mentions within sentences
- Turn sentence fragments into complete sentences
- Group related ideas into short paragraphs
- Fix typos, spelling, grammar
- Strip filler words ("so basically", "like", "I think", "right")

What to keep:
- ALL details, requirements, and specifics — never drop information
- The author's casual/developer voice — don't make it sound corporate
- No "please", "utilize", "including but not limited to", or other formal padding
- Plain text only, no markdown, no headers, no bullet points, no quotes

The goal is: messy notes in, organized readable ticket out. Same info, same voice, better structure.

Return ONLY the cleaned text, nothing else.

Raw input:
${description.trim()}`,
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

  console.log(`[generate-title] field=${field}, description length=${description.trim().length}`);

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
    console.log(`[generate-title] field=${field}, result length=${text.length}, result=${text.slice(0, 100)}`);
    return NextResponse.json({ [field || "title"]: text });
  } catch {
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
