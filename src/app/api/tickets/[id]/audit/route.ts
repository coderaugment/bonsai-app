import { NextResponse } from "next/server";
import { getAuditLog } from "@/db/data/audit";

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
