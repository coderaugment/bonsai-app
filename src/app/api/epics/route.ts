import { NextResponse } from "next/server";
import { getEpics } from "@/db/data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const epics = await getEpics(projectId ? Number(projectId) : undefined);
  return NextResponse.json(epics);
}
