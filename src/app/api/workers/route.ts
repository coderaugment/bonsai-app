import { NextResponse } from "next/server";
import { getWorkerActivity } from "@/db/data";

// Returns personas with activity data for the workers view, scoped by project.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const workers = await getWorkerActivity(projectId ? Number(projectId) : undefined);

  return NextResponse.json({ workers });
}
