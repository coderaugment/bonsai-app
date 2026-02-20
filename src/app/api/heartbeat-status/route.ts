import { NextResponse } from "next/server";
import { getSetting } from "@/db/data/settings";

export async function GET() {
  const lastPing = await getSetting("heartbeat_last_ping");
  const lastCompleted = await getSetting("heartbeat_last_completed");
  const status = await getSetting("heartbeat_status");
  const lastResultRaw = await getSetting("heartbeat_last_result");
  const authExpired = await getSetting("auth_expired");

  let lastResult: { dispatched: number; completed: number; skipped: number } | null = null;
  if (lastResultRaw) {
    try { lastResult = JSON.parse(lastResultRaw); } catch {}
  }

  return NextResponse.json({
    status: status || "unknown",
    lastPing,
    lastCompleted,
    lastResult,
    authExpired: authExpired === "true",
  });
}
