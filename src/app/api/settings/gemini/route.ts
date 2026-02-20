import { NextResponse } from "next/server";
import { hasGeminiKey, setGeminiKeyRuntime } from "@/lib/gemini";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ENV_FILE = join(process.cwd(), ".env.development");

/** Verify a Gemini API key by making a lightweight POST request */
async function verifyKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say hi" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      },
    );
    if (res.ok) return { valid: true };
    const data = await res.json().catch(() => null);
    const msg = data?.error?.message || `HTTP ${res.status}`;
    return { valid: false, error: msg };
  } catch (err) {
    return { valid: false, error: String(err) };
  }
}

/** Save GEMINI_API_KEY to .env.development */
function saveToEnvFile(key: string) {
  try {
    let content = readFileSync(ENV_FILE, "utf-8");
    if (content.match(/^GEMINI_API_KEY=/m)) {
      content = content.replace(/^GEMINI_API_KEY=.*/m, `GEMINI_API_KEY=${key}`);
    } else {
      content = content.trimEnd() + `\nGEMINI_API_KEY=${key}\n`;
    }
    writeFileSync(ENV_FILE, content);
  } catch {
    writeFileSync(ENV_FILE, `GEMINI_API_KEY=${key}\n`);
  }
}

/** GET — check if a Gemini key is configured (never returns the key) */
export async function GET() {
  return NextResponse.json({ configured: hasGeminiKey() });
}

/** POST — verify and save a Gemini API key */
export async function POST(req: Request) {
  const { key } = await req.json();
  if (!key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const result = await verifyKey(key.trim());
  if (!result.valid) {
    return NextResponse.json(
      { error: result.error, valid: false },
      { status: 422 },
    );
  }

  setGeminiKeyRuntime(key.trim());
  saveToEnvFile(key.trim());
  return NextResponse.json({ valid: true, success: true });
}
