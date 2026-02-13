import { NextResponse } from "next/server";
import { getAgentRuns } from "@/db/data/agent-runs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  const runs = await getAgentRuns(limit);
  return NextResponse.json(runs);
}
