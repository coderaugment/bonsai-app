const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// In-memory override set via the settings API (survives until server restart)
let runtimeKey: string | null = null;

export function setGeminiKeyRuntime(key: string) {
  runtimeKey = key;
  process.env.GEMINI_API_KEY = key;
}

export function getGeminiKey(): string | null {
  return runtimeKey || process.env.GEMINI_API_KEY || null;
}

export function hasGeminiKey(): boolean {
  return !!(runtimeKey || process.env.GEMINI_API_KEY);
}

export class GeminiKeyError extends Error {
  code = "gemini_key_missing" as const;
  constructor(message: string) {
    super(message);
  }
}

function isKeyError(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  return body.includes("API_KEY_INVALID") || body.includes("API key expired") || body.includes("API key not valid");
}

export async function geminiRequest(
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const key = getGeminiKey();
  if (!key) throw new GeminiKeyError("GEMINI_API_KEY not configured");

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[gemini] ${model} FAILED ${res.status}: ${err.slice(0, 300)}`);
    if (isKeyError(res.status, err)) throw new GeminiKeyError("Gemini API key invalid or expired");
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  return res;
}

/** Extract the first text candidate from a Gemini response */
export function extractText(data: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

/** JSON response helper for GeminiKeyError */
export function geminiErrorResponse(err: unknown) {
  if (err instanceof GeminiKeyError) {
    return { json: { error: err.message, code: err.code }, status: 401 };
  }
  return null;
}
