/**
 * Fire-and-forget agent dispatch with retry.
 * Used by approve-research, approve-plan, agent-complete, and ticket creation
 * to trigger the dispatch API route without blocking the response.
 *
 * If the first attempt fails (e.g., server restarting during hot reload),
 * retries once after a short delay. The heartbeat dispatcher is the ultimate
 * safety net for any dispatch that slips through.
 */

const RETRY_DELAY_MS = 2000;

interface DispatchParams {
  commentContent?: string;
  targetRole?: string;
  targetPersonaName?: string;
  targetPersonaId?: string;
  team?: boolean;
  silent?: boolean;
  conversational?: boolean;
  documentId?: number;
}

export function fireDispatch(
  origin: string,
  ticketId: number,
  params: DispatchParams,
  label: string = "dispatch"
): void {
  const url = `${origin}/api/tickets/${ticketId}/dispatch`;
  const body = JSON.stringify(params);
  const headers = { "Content-Type": "application/json" };

  fetch(url, { method: "POST", headers, body })
    .then((res) => {
      if (!res.ok) {
        console.error(`[${label}] Dispatch returned ${res.status} for ${ticketId}, retrying...`);
        return retryOnce(url, headers, body, ticketId, label);
      }
    })
    .catch(() => {
      console.error(`[${label}] Dispatch failed for ${ticketId}, retrying in ${RETRY_DELAY_MS}ms...`);
      setTimeout(() => retryOnce(url, headers, body, ticketId, label), RETRY_DELAY_MS);
    });
}

function retryOnce(
  url: string,
  headers: Record<string, string>,
  body: string,
  ticketId: number,
  label: string
): void {
  fetch(url, { method: "POST", headers, body })
    .then((res) => {
      if (!res.ok) console.error(`[${label}] Retry also failed (${res.status}) for ${ticketId} — heartbeat will catch it`);
    })
    .catch(() => {
      console.error(`[${label}] Retry also failed for ${ticketId} — heartbeat will catch it`);
    });
}
