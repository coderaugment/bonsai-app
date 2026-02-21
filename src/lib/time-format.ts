/**
 * Format a timestamp as relative time (e.g., "just now", "2m ago", "5h ago")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const now = Date.now();

  // SQLite returns timestamps like "2026-02-21 20:25:30" which are UTC
  // We need to append 'Z' to treat them as UTC, or JavaScript will interpret as local time
  let then: number;
  if (typeof timestamp === "string") {
    // If no timezone info, assume UTC and append 'Z'
    const timestampStr = timestamp.includes('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z';
    then = new Date(timestampStr).getTime();
  } else {
    then = timestamp.getTime();
  }

  const diffMs = now - then;

  if (diffMs < 0) return "just now"; // Future timestamp (clock skew)

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  // For older timestamps, show the date
  const date = new Date(then);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
