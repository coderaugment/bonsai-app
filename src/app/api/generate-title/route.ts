import { NextResponse } from "next/server";
import { geminiRequest, extractText, GeminiKeyError } from "@/lib/gemini";

const MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 65536;

// field: "title" | "criteria" | "enhance"
export async function POST(req: Request) {
  const { description, field } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }

  const prompts: Record<string, { text: string }> = {
    title: {
      text: `You are a software project manager writing a concise ticket title.

Read the description below and extract the MAIN task or feature being requested. Return a clear, actionable title (max 8 words).

CRITICAL RULES:
- Return ONLY the title text itself, nothing else
- No quotes, no punctuation at the end, no preamble
- NEVER return meta-text like "Task description missing" or "Error" or "No description" - if the description is unclear, make your best guess at what they want
- Focus on the PRIMARY action/feature, ignore tangents or background
- Use imperative form: "Add X", "Fix Y", "Build Z", "Implement W"
- If description is long, extract the core request

Description:
${description.trim()}`,
    },
    criteria: {
      text: `Generate acceptance criteria for this task as a markdown checklist. Each item should be a concrete, testable condition. Use "- [ ]" format. Return 3-6 items, ONLY the checklist, no other text.\n\nDescription:\n${description.trim()}`,
    },
    enhance: {
      text: `Fix typos, spelling, and grammar in the text below. Keep the EXACT same content, meaning, and structure — do not rewrite, rephrase, or reorganize sentences. Do not add any information that isn't already there. Do not remove any information. Do not change technical terms, tool names, or stack choices.

Rules:
- ONLY fix typos, spelling, grammar, and obvious formatting issues
- Keep every detail, number, URL, and technical term exactly as written
- Keep the author's voice — do not make it formal or corporate
- Keep all image references ![...](...) exactly as-is
- Do NOT add new content, explanations, or details the author didn't write
- Do NOT rewrite sentences — only fix errors within them
- Do NOT summarize or restructure

Return ONLY the cleaned text, nothing else.

Text:
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
    const res = await geminiRequest(MODEL, {
      contents: [{ parts: [{ text: config.text }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    });

    const data = await res.json();
    let text = extractText(data);
    if ((field === "enhance" || field === "massage") && text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    }
    console.log(`[generate-title] field=${field}, result length=${text.length}, result=${text.slice(0, 100)}`);
    return NextResponse.json({ [field || "title"]: text });
  } catch (err) {
    if (err instanceof GeminiKeyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
