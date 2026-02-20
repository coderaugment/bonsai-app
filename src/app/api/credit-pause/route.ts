import { NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";
import {
  CREDITS_PAUSED_UNTIL,
  CREDITS_PAUSE_REASON,
  isPaused,
  pauseRemainingMs,
  computePauseUntil,
} from "@/lib/credit-pause";

/** GET — returns current credit pause status */
export async function GET() {
  const resumesAt = await getSetting(CREDITS_PAUSED_UNTIL);
  const reason = await getSetting(CREDITS_PAUSE_REASON);
  const paused = isPaused(resumesAt);
  const remainingMs = pauseRemainingMs(resumesAt);

  // Auto-clear expired pause
  if (resumesAt && !paused) {
    await deleteSetting(CREDITS_PAUSED_UNTIL);
    await deleteSetting(CREDITS_PAUSE_REASON);
    return NextResponse.json({ paused: false, resumesAt: null, remainingMs: 0, reason: null });
  }

  return NextResponse.json({ paused, resumesAt, remainingMs, reason });
}

/** POST — set credit pause from stderr content */
export async function POST(req: Request) {
  const { reason } = await req.json();

  if (!reason || typeof reason !== "string") {
    return NextResponse.json({ error: "reason (stderr content) required" }, { status: 400 });
  }

  const resumesAt = computePauseUntil(reason);
  await setSetting(CREDITS_PAUSED_UNTIL, resumesAt);
  await setSetting(CREDITS_PAUSE_REASON, reason.slice(0, 500));

  console.log(`[credit-pause] Paused until ${resumesAt} — reason: ${reason.slice(0, 100)}`);

  return NextResponse.json({
    paused: true,
    resumesAt,
    remainingMs: pauseRemainingMs(resumesAt),
  });
}

/** PUT — manually pause indefinitely (until explicitly resumed) */
export async function PUT() {
  const resumesAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
  await setSetting(CREDITS_PAUSED_UNTIL, resumesAt);
  await setSetting(CREDITS_PAUSE_REASON, "manual");

  console.log("[credit-pause] Manually paused");

  return NextResponse.json({ paused: true, resumesAt, remainingMs: pauseRemainingMs(resumesAt) });
}

/** DELETE — manually resume (clear pause) */
export async function DELETE() {
  await deleteSetting(CREDITS_PAUSED_UNTIL);
  await deleteSetting(CREDITS_PAUSE_REASON);

  console.log("[credit-pause] Manually resumed — pause cleared");

  return NextResponse.json({ paused: false });
}
