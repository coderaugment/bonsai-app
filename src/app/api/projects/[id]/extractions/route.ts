import { NextRequest, NextResponse } from "next/server";
import { getExtractionsByProject } from "@/db/data/notes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const items = await getExtractionsByProject(projectId);

  return NextResponse.json(items);
}
