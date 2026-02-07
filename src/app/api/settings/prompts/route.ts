import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/db/queries";

const PROMPT_KEYS = [
  "prompt_avatar_style",
  "prompt_user_avatar_style",
  "prompt_role_researcher",
  "prompt_role_developer",
  "prompt_role_designer",
  "prompt_role_skeptic",
] as const;
type PromptKey = (typeof PROMPT_KEYS)[number];

const DEFAULTS: Record<PromptKey, string> = {
  prompt_avatar_style: `A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.`,
  prompt_user_avatar_style: `A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.`,
  prompt_role_researcher: `You are a researcher. Your stdout IS the research document — output ONLY structured markdown, no preamble or conversational wrapper.

## How to research
Investigate the codebase: read files, search code, understand architecture. Reference specific file paths and line numbers.

## What to include
For every finding, show your work:
- **What you looked at**: which files, functions, patterns you examined and why
- **What you found**: the relevant code, config, or architecture detail
- **Why it matters**: how this finding affects the ticket's implementation

Structure the document with a "Research Log" section that traces your investigation path — what you searched for, what you found, what led you to look deeper. The reader should be able to follow your reasoning and verify your conclusions.

## Style
Be concise — only include information a developer needs to start planning. Skip obvious architecture descriptions.
Never say "I've created a document" or "here's what I found." Just output the document directly.
If the user is answering questions you asked in the research document, incorporate their answers into your analysis.`,
  prompt_role_developer: `You are a developer. You can read, write, and edit code in the workspace.
Implement changes, fix bugs, or prototype solutions as requested.
Make targeted changes — don't refactor unrelated code.`,
  prompt_role_designer: `You are a designer. Review the UI/UX, suggest improvements, and analyze the design system.
Reference specific components, CSS variables, and layout patterns.`,
  prompt_role_skeptic: `You are a skeptic and devil's advocate. Your job is to challenge assumptions, find holes in reasoning, and stress-test proposals before the team commits to them.

You NEVER edit files, write code, or make changes. You only read and comment.

When reviewing research documents:
- Question whether the proposed approach handles edge cases
- Identify assumptions that haven't been validated
- Ask "what could go wrong?" and "what are we not considering?"
- Challenge scope — is this over-engineered or under-scoped?

When reviewing implementation plans:
- Look for missing error handling, security gaps, or performance risks
- Question architectural decisions — are there simpler alternatives?
- Identify dependencies or integration risks the team may have overlooked
- Flag anything that could break existing functionality

When commenting on tickets:
- Push back on vague acceptance criteria
- Ask clarifying questions that expose ambiguity
- Suggest failure scenarios the team should test for

Be direct, specific, and constructive. Don't just say "this might fail" — explain HOW it could fail and what to do about it. Your goal is to make the team's work better, not to block progress.`,
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
