"use client";

import { useState } from "react";

interface GeminiSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GeminiSetupModal({ open, onClose, onSuccess }: GeminiSetupModalProps) {
  const [key, setKey] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const isValid = key.trim().length > 10;

  async function handleVerify() {
    if (!isValid) return;
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/settings/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setKey("");
        onSuccess();
      } else {
        setError(data.error || "Key verification failed");
      }
    } catch {
      setError("Failed to verify key");
    }
    setVerifying(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-medium)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Gemini API Setup
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Bonsai uses Google Gemini to generate avatars, style prompts, and ticket suggestions.
            You need a Gemini API key with billing enabled.
          </p>

          {/* Step 1 */}
          <StepBlock number={1} title="Sign up for Google AI Studio">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Go to{" "}
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
                style={{ color: "var(--accent-blue)" }}
              >
                aistudio.google.com
              </a>{" "}
              and sign in with your Google account.
            </p>
          </StepBlock>

          {/* Step 2 */}
          <StepBlock number={2} title="Set up billing">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Open{" "}
              <a
                href="https://console.cloud.google.com/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
                style={{ color: "var(--accent-blue)" }}
              >
                Google Cloud Billing
              </a>{" "}
              and link a payment method. Image generation requires a pay-as-you-go account
              (~$0.04/avatar).
            </p>
          </StepBlock>

          {/* Step 3 */}
          <StepBlock number={3} title="Get an API key">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              In AI Studio, click{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
                style={{ color: "var(--accent-blue)" }}
              >
                Get API key
              </a>{" "}
              &rarr; <strong style={{ color: "var(--text-primary)" }}>Create API key</strong>.
              Copy it.
            </p>
          </StepBlock>

          {/* Step 4 — input */}
          <StepBlock number={4} title="Paste your API key">
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(""); }}
              placeholder="AIza..."
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none font-mono transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: `1px solid ${isValid ? "var(--accent-green)" : error ? "var(--accent-red)" : "var(--border-medium)"}`,
                color: "var(--text-primary)",
              }}
            />
            {error && (
              <p className="text-xs mt-1.5" style={{ color: "var(--accent-red)" }}>
                {error}
              </p>
            )}
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
              Saved to your local environment file.
            </p>
          </StepBlock>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-6 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={!isValid || verifying}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {verifying ? "Verifying..." : "Verify & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: "var(--accent-blue)", color: "white" }}
        >
          {number}
        </span>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
      </div>
      <div className="ml-8">
        {children}
      </div>
    </div>
  );
}
