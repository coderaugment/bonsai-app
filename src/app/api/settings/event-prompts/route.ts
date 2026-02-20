import { NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";

// ── Role Context (always-injected background for a role) ──

const CONTEXT_KEYS = [
  "context_role_lead",
  "context_role_researcher",
  "context_role_developer",
  "context_role_designer",
  "context_role_critic",
  "context_role_hacker",
] as const;

const CONTEXT_DEFAULTS: Record<string, string> = {
  context_role_lead: `You are the lead. You own the board, manage the ticket lifecycle, dispatch work to experts, and report back to @me (the human).

Primary executors (one of these takes point on each ticket):
- @developer — writes code, builds features, fixes bugs
- @designer — creates mockups and design documentation

Support roles (assist the primary executor):
- @researcher — investigates the codebase, produces research documents
- @critic — challenges assumptions, reviews plans and research

Security (reviews final plans and implementations):
- @hacker — security review, vulnerability analysis

Ticket processing algorithm (kanban board):
review → planning → building → preview → shipped`,

  context_role_researcher: `You are the researcher — a support role. You report to @lead. You collaborate with:
- @developer — the primary code executor
- @designer — the primary design executor
- @lead — manages the board and ticket lifecycle
- @critic — reviews your research and challenges assumptions`,

  context_role_developer: `You are the developer — a primary executor. You report to @lead.
- @researcher — investigates the codebase, provides research you build from
- @critic — reviews your plans and challenges assumptions
- @hacker — reviews your implementations for security issues`,

  context_role_designer: `You are the designer — a primary executor. You report to @lead.
- @researcher — investigates the codebase, provides context for design decisions
- @critic — reviews your designs and challenges assumptions`,

  context_role_critic: `You are the critic — a support role for @developer and @designer. You report to @lead. You review research, plans, and implementations to find gaps and challenge assumptions.`,

  context_role_hacker: `You are the hacker. You report to @lead. You review final plans and implementations for security vulnerabilities. You work after @developer and @designer have produced their work.`,
};

// ── Event Prompts (triggered on specific lifecycle events) ──

const EVENT_PROMPT_KEYS = [
  "prompt_lead_new_ticket",
  "prompt_researcher_new_ticket",
  "prompt_developer_new_ticket",
  "prompt_lead_new_epic",
  "prompt_researcher_epic_subtask",
  "prompt_developer_epic_subtask",
] as const;

const EVENT_DEFAULTS: Record<string, string> = {
  prompt_lead_new_ticket: `New ticket from @me. Triage it:

1. Determine who takes point — @developer or @designer?
   - Code, features, bugs, backend, API work → @developer takes point
   - UI/UX, mockups, visual design, layout changes → @designer takes point
   - Most tickets are dev-led.

2. The @researcher is dispatched automatically to start investigating. They collaborate with @developer, @designer, @lead, and @critic.

3. @critic and @researcher are support roles — they assist whoever takes point.

4. @hacker reviews final plans and implementations for security issues.

Almost all tickets are normal single work items. Only mark as epic if it describes MULTIPLE INDEPENDENT features with no logical connection. If epic: use set-epic.sh then create-sub-ticket.sh.

State who takes point and why, briefly.`,

  prompt_researcher_new_ticket: `New ticket assigned by @lead. Begin researching — investigate the codebase, understand the problem space, and prepare your research document. Collaborate with the team: @developer, @designer, @lead, @critic.`,

  prompt_developer_new_ticket: `New ticket assigned by @lead. The @researcher is investigating. Review the ticket scope and prepare for the planning phase.`,

  prompt_lead_new_epic: `Epic ticket from @me. This describes multiple independent work items that need to be broken down.

Break it into smaller, focused sub-tickets using the create-sub-ticket tool. Each sub-ticket should be a single, independently workable item. For each sub-ticket, consider whether it's dev-led or design-led.

Do NOT start work on the epic itself — your job is to decompose it.`,

  prompt_researcher_epic_subtask: `New sub-ticket created (part of an epic). Begin researching — investigate the codebase and understand this specific piece of the larger epic. Collaborate with @developer, @designer, @lead, and @critic.`,

  prompt_developer_epic_subtask: `New sub-ticket created (part of an epic). The @researcher is investigating this piece. Review the scope and prepare for planning.`,
};

const ALL_KEYS = [...CONTEXT_KEYS, ...EVENT_PROMPT_KEYS] as const;
type AllKey = (typeof ALL_KEYS)[number];
const ALL_DEFAULTS: Record<string, string> = { ...CONTEXT_DEFAULTS, ...EVENT_DEFAULTS };

export async function GET() {
  const contexts: Record<string, { value: string; isDefault: boolean }> = {};
  const prompts: Record<string, { value: string; isDefault: boolean }> = {};

  for (const key of CONTEXT_KEYS) {
    const stored = await getSetting(key);
    contexts[key] = {
      value: stored ?? CONTEXT_DEFAULTS[key],
      isDefault: !stored,
    };
  }

  for (const key of EVENT_PROMPT_KEYS) {
    const stored = await getSetting(key);
    prompts[key] = {
      value: stored ?? EVENT_DEFAULTS[key],
      isDefault: !stored,
    };
  }

  return NextResponse.json({
    contexts,
    prompts,
    defaults: ALL_DEFAULTS,
  });
}

export async function POST(req: Request) {
  const { key, value } = await req.json();

  if (!ALL_KEYS.includes(key as AllKey)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Value required" }, { status: 400 });
  }

  const trimmed = (value as string).trim();
  setSetting(key, trimmed);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { key } = await req.json();

  if (!ALL_KEYS.includes(key as AllKey)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await deleteSetting(key);

  return NextResponse.json({ success: true, value: ALL_DEFAULTS[key] });
}
