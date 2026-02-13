"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { StepHeader } from "@/components/ui/step-header";

export default function ProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [repoExists, setRepoExists] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    fetch("/api/github/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.login) setGithubUser(data.login);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) {
      queueMicrotask(() => setRepoExists(null));
      return;
    }

    queueMicrotask(() => setChecking(true));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/github/repo?name=${encodeURIComponent(name.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          setRepoExists(data.exists);
          if (data.exists) {
            if (data.description) setDescription(data.description);
            setVisibility(data.private ? "private" : "public");
          }
          setChecking(false);
        })
        .catch(() => {
          setRepoExists(null);
          setChecking(false);
        });
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/onboard/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          visibility,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create project");
        setSaving(false);
        return;
      }

      router.push(`/p/${data.project.slug}/onboard/team`);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const owner = githubUser || "you";

  return (
    <div className="flex flex-col h-full">
      <StepHeader title="Create your first project" />

      <div className="flex-1 flex flex-col px-10 pt-4 gap-6">
        <p className="text-base" style={{ color: "var(--text-secondary)" }}>
          This will create a new GitHub repository and set it up as a Bonsai project.
          Your agents will work in this repo.
        </p>

        <div className="space-y-5">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              autoFocus
              className="w-full max-w-lg px-4 py-3 rounded-lg text-base outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
              }}
            />
            {slug && (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  github.com/{owner}/{slug}
                </p>
                {checking && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>checking...</span>
                )}
                {!checking && repoExists === true && (
                  <span className="text-xs" style={{ color: "var(--accent-green, #22c55e)" }}>
                    exists — will connect
                  </span>
                )}
                {!checking && repoExists === false && (
                  <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
                    new repo
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Visibility
              {repoExists === true && (
                <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>
                  (from existing repo)
                </span>
              )}
            </label>
            <div className="flex gap-3">
              {(["private", "public"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  disabled={repoExists === true}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      visibility === v
                        ? "rgba(91, 141, 249, 0.1)"
                        : "transparent",
                    border:
                      visibility === v
                        ? "1px solid var(--accent-blue)"
                        : "1px solid var(--border-medium)",
                    color:
                      visibility === v
                        ? "var(--accent-blue)"
                        : "var(--text-secondary)",
                    opacity: repoExists === true ? 0.6 : 1,
                  }}
                >
                  {v === "private" ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.059a.956.956 0 01-1.652.928l-.679-.906a1.125 1.125 0 00-1.906.172L4.5 15.75l-.612.153M12.75 3.031a9 9 0 00-8.862 12.872M12.75 3.031a9 9 0 016.69 14.036m0 0l-.177-.529A2.25 2.25 0 0017.128 15H16.5l-.324-.324a1.453 1.453 0 00-2.328.377l-.036.073a1.586 1.586 0 01-.982.816l-.99.282c-.55.157-.894.702-.8 1.267l.073.438c.08.474.49.821.97.821.846 0 1.598.542 1.865 1.345l.215.643m5.276-3.67a9.012 9.012 0 01-5.276 3.67" />
                    </svg>
                  )}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Description {repoExists === true
                ? <span style={{ color: "var(--text-muted)" }}>(from existing repo)</span>
                : <span style={{ color: "var(--text-muted)" }}>(optional)</span>
              }
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your project"
              readOnly={repoExists === true}
              className="w-full max-w-lg px-4 py-3 rounded-lg text-base outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
                opacity: repoExists === true ? 0.6 : 1,
                cursor: repoExists === true ? "not-allowed" : undefined,
              }}
            />
          </div>
        </div>
      </div>

      <div className="px-10 pb-10">
        {error && (
          <p className="text-sm mb-3" style={{ color: "var(--accent-red, #ef4444)" }}>
            {error}
          </p>
        )}
        <div className="flex justify-between items-center">
          <button
            onClick={() => router.push("/onboard/github")}
            className="px-6 py-3 rounded-lg text-base font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="px-8 py-3 rounded-lg text-base font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {saving
              ? repoExists
                ? "Connecting..."
                : "Creating on GitHub..."
              : repoExists
                ? "Connect project"
                : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
