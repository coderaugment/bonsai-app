import { NextResponse } from "next/server";
import { getAuditLog, clearAuditLog } from "@/db/data/audit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const entries = await getAuditLog(ticketId);

  const parsed = entries.map((e) => ({
    ...e,
    metadata: e.metadata ? JSON.parse(e.metadata) : null,
  }));

  return NextResponse.json({ audit: parsed });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await clearAuditLog(Number(id));
  return NextResponse.json({ ok: true });
}
