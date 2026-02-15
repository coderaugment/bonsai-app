/**
 * Credit pause utilities — detect API credit exhaustion and pause dispatching.
 *
 * When Claude CLI returns a "hit your limit" error, we parse the reset time
 * and pause all agent dispatching until credits refresh. Uses the settings
 * table (key/value) — no schema changes needed.
 */

// Settings keys
export const CREDITS_PAUSED_UNTIL = "credits_paused_until";
export const CREDITS_PAUSE_REASON = "credits_pause_reason";

// Patterns that indicate a credit/rate limit error
const CREDIT_PATTERNS = [
  /hit your limit/i,
  /rate limit/i,
  /out of credits/i,
  /\b429\b/,
  /quota exceeded/i,
  /billing/i,
  /usage cap/i,
];

/** Returns true if stderr looks like a credit/rate limit error */
export function isCreditError(stderr: string): boolean {
  return CREDIT_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * Parse reset time from Claude CLI stderr.
 * Matches: "resets 9pm (America/Mexico_City)" or "resets 11am (US/Eastern)"
 * Returns ISO timestamp or null if not found.
 */
export function parseResetTime(stderr: string): string | null {
  const match = stderr.match(/resets\s+(\d{1,2})(am|pm)\s+\(([^)]+)\)/i);
  if (!match) return null;

  const [, hourStr, ampm, timezone] = match;
  let hour = parseInt(hourStr, 10);
  if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;

  // Build a date string for today in the given timezone, then convert to UTC
  const now = new Date();

  // Use Intl to get current date parts in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  try {
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")!.value;
    const month = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    const currentHour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);

    // If reset hour is earlier than current hour in that timezone, it means tomorrow
    const resetDate = new Date(`${year}-${month}-${day}T${String(hour).padStart(2, "0")}:00:00`);

    // Get the offset for this timezone by comparing to UTC
    const tzOffset = getTimezoneOffsetMs(timezone, resetDate);
    const utcMs = resetDate.getTime() + tzOffset;
    let result = new Date(utcMs);

    // If the reset time is in the past, bump to tomorrow
    if (result.getTime() <= now.getTime()) {
      result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
    }

    return result.toISOString();
  } catch {
    // Invalid timezone — fall back
    return null;
  }
}

/** Get timezone offset in milliseconds (positive = behind UTC) */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
  // Format the date in UTC and in the target timezone, then diff
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return utcDate.getTime() - tzDate.getTime();
}

/** Compute pause-until timestamp from stderr. Falls back to +1 hour. */
export function computePauseUntil(stderr: string): string {
  const parsed = parseResetTime(stderr);
  if (parsed) return parsed;
  // Fallback: pause for 1 hour
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

/** Returns true if the pause timestamp is in the future */
export function isPaused(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

/** Returns remaining pause time in milliseconds (0 if not paused) */
export function pauseRemainingMs(value: string | null): number {
  if (!value) return 0;
  const remaining = new Date(value).getTime() - Date.now();
  return remaining > 0 ? remaining : 0;
}
