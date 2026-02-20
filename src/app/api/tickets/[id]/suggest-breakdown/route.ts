import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getSetting } from "@/db/data/settings";
import { geminiRequest, extractText, GeminiKeyError } from "@/lib/gemini";

const MODEL = "gemini-2.5-flash";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!ticketId) {
    return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const leadContext = await getSetting("context_role_lead") || "";
  const epicPrompt = await getSetting("prompt_lead_new_epic") || "You are breaking down an epic into smaller, actionable sub-tickets.";

  const ticketSummary = [
    `Title: ${ticket.title}`,
    ticket.description ? `Description: ${ticket.description}` : "",
    ticket.acceptanceCriteria ? `Acceptance Criteria: ${ticket.acceptanceCriteria}` : "",
  ].filter(Boolean).join("\n");

  const prompt = [
    leadContext,
    epicPrompt,
    "",
    "Break down this epic into 3-8 smaller, actionable sub-tickets. Each sub-ticket should be independently deliverable.",
    "",
    "IMPORTANT: The FIRST sub-ticket MUST be a project setup ticket (type: chore) that covers:",
    "- Initialize the repo with the correct framework (e.g. create-next-app, vite, etc.)",
    "- Install all dependencies from the tech stack mentioned in the epic",
    "- Set up database connections, ORM, environment config",
    "- Configure linting, TypeScript, formatting as described",
    "- Set up the folder/project structure",
    "- Get a basic hello-world page running in dev mode",
    "The setup ticket description MUST list every technology and tool mentioned in the epic. No feature work can start until this ticket is done.",
    "",
    "The remaining tickets should cover the actual features/functionality.",
    "",
    ticketSummary,
    "",
    'Return ONLY valid JSON in this exact format:',
    '{"suggestions": [{"title": "...", "description": "...", "type": "feature|bug|chore", "acceptanceCriteria": "- [ ] criterion 1\\n- [ ] criterion 2"}]}',
    "",
    "Each suggestion should have a clear, concise title and a description that provides enough context for a developer to work on it independently. Carry the tech stack details into each ticket's description where relevant.",
    "Acceptance criteria MUST use markdown checkbox format: each criterion on its own line starting with '- [ ] '.",
  ].filter(Boolean).join("\n");

  try {
    const res = await geminiRequest(MODEL, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
    });

    const data = await res.json();
    const text = extractText(data);
    const parsed = JSON.parse(text);

    return NextResponse.json({
      suggestions: parsed.suggestions || [],
      epicTitle: ticket.title,
      epicId: ticket.id,
    });
  } catch (err) {
    if (err instanceof GeminiKeyError) {
      return NextResponse.json({ error: err.message, code: err.code, suggestions: [] }, { status: 401 });
    }
    console.error("Epic breakdown generation failed:", err);
    return NextResponse.json({ suggestions: [] });
  }
}
