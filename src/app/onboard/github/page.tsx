"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader } from "@/components/ui/step-header";

export default function GithubPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingUser, setExistingUser] = useState("");

  useEffect(() => {
    fetch("/api/github/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.login) setExistingUser(data.login);
      })
      .catch(() => {});
  }, []);

  const isValid = token.trim().startsWith("ghp_") && token.trim().length > 10;
  const canContinue = existingUser || isValid;

  async function handleContinue() {
    if (existingUser && !token.trim()) {
      router.push("/onboard/project");
      return;
    }
    if (!isValid) return;
    setSaving(true);
    await fetch("/api/onboard/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    router.push("/onboard/project");
  }

  return (
    <div className="flex flex-col h-full">
      <StepHeader title="GitHub setup" />

      <div className="flex-1 flex flex-col px-10 pt-4 gap-6 overflow-y-auto">
        <p className="text-base" style={{ color: "var(--text-secondary)" }}>
          Bonsai needs a GitHub token so agents can create repos, commit, and push code on your behalf.
        </p>

        {existingUser ? (
          /* Already connected — compact view */
          <div className="space-y-4">
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              <svg className="w-5 h-5 shrink-0" style={{ color: "#22c55e" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Connected as <strong>{existingUser}</strong>
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Replace token (optional)
              </h3>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste new token to replace"
                className="w-full max-w-lg px-4 py-2.5 rounded-lg text-sm outline-none font-mono transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
                style={{
                  backgroundColor: "var(--bg-input)",
                  border: `1px solid ${isValid ? "var(--accent-green)" : "var(--border-medium)"}`,
                  color: "var(--text-primary)",
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                This token is stored locally in your encrypted Bonsai vault.
              </p>
            </div>
          </div>
        ) : (
          /* Not connected — full setup instructions */
          <div className="space-y-4">
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>1</span>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  GitHub account
                </h3>
              </div>
              <p className="text-sm ml-[22px]" style={{ color: "var(--text-secondary)" }}>
                Already have one? Skip to step 2. Otherwise,{" "}
                <a
                  href="https://github.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors hover:text-white"
                  style={{ color: "var(--accent-blue)" }}
                >
                  create a GitHub account
                </a>
                .
              </p>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>2</span>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Create a personal access token
                </h3>
              </div>
              <div className="ml-[22px] space-y-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Open{" "}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline transition-colors hover:text-white"
                    style={{ color: "var(--accent-blue)" }}
                  >
                    github.com/settings/tokens
                  </a>
                </p>
                <ol className="text-sm space-y-1.5 list-decimal list-inside" style={{ color: "var(--text-secondary)" }}>
                  <li>
                    Click <strong style={{ color: "var(--text-primary)" }}>Generate new token</strong> →{" "}
                    <strong style={{ color: "var(--text-primary)" }}>Generate new token (classic)</strong>
                  </li>
                  <li>
                    Give it a name like{" "}
                    <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--bg-input)" }}>
                      bonsai
                    </code>
                  </li>
                  <li>
                    Set expiration to <strong style={{ color: "var(--text-primary)" }}>No expiration</strong> (or your preference)
                  </li>
                  <li>
                    Select scopes:{" "}
                    <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--bg-input)" }}>repo</code>{" "}
                    and{" "}
                    <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "var(--bg-input)" }}>workflow</code>
                  </li>
                  <li>
                    Click <strong style={{ color: "var(--text-primary)" }}>Generate token</strong> and copy it
                  </li>
                </ol>
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>3</span>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Paste your token
                </h3>
                {isValid && (
                  <svg className="w-4 h-4 ml-auto" style={{ color: "var(--accent-green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <div className="ml-[22px]">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full max-w-lg px-4 py-2.5 rounded-lg text-sm outline-none font-mono transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    border: `1px solid ${isValid ? "var(--accent-green)" : "var(--border-medium)"}`,
                    color: "var(--text-primary)",
                  }}
                />
                <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                  This token is stored locally in your encrypted Bonsai vault.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center px-10 pb-10 pt-4">
        <button
          onClick={() => router.push("/onboard/welcome")}
          className="px-6 py-3 rounded-lg text-base font-medium transition-colors hover:bg-white/5"
          style={{ color: "var(--text-secondary)" }}
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!canContinue || saving}
          className="px-8 py-3 rounded-lg text-base font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
