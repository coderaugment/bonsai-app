"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepHeader } from "@/components/ui/step-header";

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/onboard/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          router.replace("/onboard/github");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleContinue() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/onboard/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    router.push("/onboard/github");
  }

  if (checking) return null;

  return (
    <div className="flex flex-col h-full">
      <StepHeader title="Welcome to Bonsai!" />

      <div className="flex-1 flex flex-col items-center justify-center px-10 -mt-10">
        <p
          className="text-lg mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          How would you like to be addressed?
        </p>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
          className="w-full max-w-md px-4 py-3 rounded-lg text-base outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
          style={{
            backgroundColor: "var(--bg-input)",
            border: "1px solid var(--border-medium)",
            color: "var(--text-primary)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleContinue();
          }}
        />
      </div>

      <div className="flex justify-center px-10 pb-10">
        <button
          onClick={handleContinue}
          disabled={!name.trim() || saving}
          className="px-8 py-3 rounded-lg text-base font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
