import { NextResponse } from "next/server";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { getSetting, setSetting, deleteSetting } from "@/db/data/settings";

const HOME = process.env.HOME || "~";
const CLAUDE_CLI = path.join(HOME, ".local", "bin", "claude");
const CHROME_PROFILE = "Profile 10"; // michael@claimhawk.app

// GET — return current auth_expired status + whether an API key is configured
export async function GET() {
  const authExpired = await getSetting("auth_expired");
  return NextResponse.json({
    authExpired: authExpired === "true",
    hasApiKey: !!process.env.CLAUDE_REAUTH_KEY,
  });
}

/**
 * POST — trigger autonomous re-authentication:
 * 1. Read CLAUDE_REAUTH_KEY from env
 * 2. Open Chrome with the michael@claimhawk.app profile (Profile 10)
 * 3. Spawn `claude -p --chrome` using the API key with a task to complete OAuth
 * 4. Background-poll `claude auth status` and auto-clear auth_expired when done
 */
export async function POST() {
  await setSetting("auth_expired", "true");

  const apiKey = process.env.CLAUDE_REAUTH_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "No CLAUDE_REAUTH_KEY in environment. Add it to .env.development." },
      { status: 422 }
    );
  }

  // Step 1: Open Chrome with the right profile so --chrome connects to it
  try {
    execFileSync("open", ["-a", "Google Chrome", "--args", `--profile-directory=${CHROME_PROFILE}`]);
  } catch (e) {
    console.warn("[reauth] Could not open Chrome:", e instanceof Error ? e.message : String(e));
  }

  // Step 2: Short delay for Chrome to come up before claude --chrome connects
  await new Promise((r) => setTimeout(r, 2000));

  // Step 3: Spawn claude -p --chrome using API key to complete OAuth
  const task = [
    "The Claude CLI OAuth token has expired and needs to be refreshed.",
    "Please complete the following steps in Chrome:",
    "1. Navigate to https://claude.ai in the browser",
    "2. If prompted to log in, use the michael@claimhawk.app account",
    "3. Look for any OAuth authorization prompt for 'Claude Code' or 'Claude CLI' and approve it",
    "4. Once you see the claude.ai home page and the authorization is complete, say 'Done'",
    "The session will be saved automatically.",
  ].join(" ");

  const child = spawn(CLAUDE_CLI, ["-p", "--chrome", "--model", "haiku", "--output-format", "text", task], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: apiKey,
      CLAUDECODE: "",
    },
  });
  child.unref();

  console.log("[reauth] Spawned claude --chrome with API key to complete OAuth");

  // Step 4: Background-poll claude auth status and auto-clear flag when done
  pollForAuthRestore();

  return NextResponse.json({
    ok: true,
    message: "Re-auth process started. Chrome should open with the claude.ai login. Monitoring for completion…",
  });
}

// DELETE — manually clear the auth_expired flag (fallback for user-initiated clear)
export async function DELETE() {
  await deleteSetting("auth_expired");
  return NextResponse.json({ ok: true, cleared: true });
}

/** Poll claude auth status every 15s for up to 10 minutes, auto-clear on success */
function pollForAuthRestore() {
  const MAX_ATTEMPTS = 40; // 40 × 15s = 10 minutes
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;
    try {
      const status = await checkAuthStatus();
      if (status.loggedIn) {
        await deleteSetting("auth_expired");
        console.log("[reauth] Auth restored — cleared auth_expired flag");
        clearInterval(interval);
      } else if (attempts >= MAX_ATTEMPTS) {
        console.warn("[reauth] Timed out waiting for auth restore after 10 minutes");
        clearInterval(interval);
      }
    } catch {
      if (attempts >= MAX_ATTEMPTS) clearInterval(interval);
    }
  }, 15_000);
}

function checkAuthStatus(): Promise<{ loggedIn: boolean }> {
  return new Promise((resolve) => {
    let out = "";
    const proc = spawn(CLAUDE_CLI, ["auth", "status", "--json"], {
      env: { ...process.env, CLAUDECODE: "" },
    });
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => {
      try {
        const data = JSON.parse(out);
        resolve({ loggedIn: code === 0 && data.loggedIn === true });
      } catch {
        resolve({ loggedIn: false });
      }
    });
    proc.on("error", () => resolve({ loggedIn: false }));
    setTimeout(() => resolve({ loggedIn: false }), 5000);
  });
}
