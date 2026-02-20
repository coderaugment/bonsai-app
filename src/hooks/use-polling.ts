import { useEffect, useRef } from "react";

/**
 * Poll a callback at the given interval (ms).
 * Pass `null` as interval to pause.
 * Calls the callback immediately on first activation, then every interval.
 */
export function usePolling(callback: () => void, intervalMs: number | null) {
  const callbackRef = useRef(callback);

  // Keep callback ref updated without accessing during render
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (intervalMs === null) return;

    // Fire immediately
    callbackRef.current();

    const id = setInterval(() => callbackRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
