import { NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { logAuditEvent } from "@/db/data/audit";

// POST /api/tickets/[id]/check-criteria
// Body: { index: number } — 0-based index of the checkbox to mark done
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const { index } = await req.json();

  if (typeof index !== "number" || index < 0) {
    return NextResponse.json({ error: "index must be a non-negative number" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  if (!ticket.acceptanceCriteria) {
    return NextResponse.json({ error: "no acceptance criteria" }, { status: 400 });
  }

  // Find all checkboxes (checked or unchecked) and check off the one at the given index
  const lines = ticket.acceptanceCriteria.split("\n");
  let checkboxCount = 0;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const isUnchecked = /^(\s*)-\s*\[ \]/.test(lines[i]);
    const isChecked = /^(\s*)-\s*\[x\]/i.test(lines[i]);
    if (isUnchecked || isChecked) {
      if (checkboxCount === index) {
        if (isUnchecked) {
          lines[i] = lines[i].replace("- [ ]", "- [x]");
          updated = true;
        }
        // Already checked — treat as success (idempotent)
        break;
      }
      checkboxCount++;
    }
  }

  if (!updated && checkboxCount <= index) {
    return NextResponse.json({ error: `checkbox index ${index} not found` }, { status: 400 });
  }

  const newCriteria = lines.join("\n");

  // Check if ALL criteria are now checked off
  const hasUnchecked = lines.some((l) => /^(\s*)-\s*\[ \]/.test(l));
  const allChecked = !hasUnchecked;

  const updates: Record<string, unknown> = { acceptanceCriteria: newCriteria };
  if (allChecked && ticket.state === "build") {
    updates.state = "test";
  }

  await updateTicket(ticketId, updates);

  await logAuditEvent({
    ticketId,
    event: "criterion_checked",
    actorType: "system",
    actorName: "System",
    detail: `Checked off acceptance criterion #${index + 1}`,
    metadata: { index, allChecked },
  });

  if (allChecked && ticket.state === "build") {
    await logAuditEvent({
      ticketId,
      event: "state_changed",
      actorType: "system",
      actorName: "System",
      detail: "All criteria met — moved to test",
      metadata: { from: "build", to: "test" },
    });
  }

  return NextResponse.json({ ok: true, acceptanceCriteria: newCriteria, movedToTest: allChecked && ticket.state === "build" });
}
