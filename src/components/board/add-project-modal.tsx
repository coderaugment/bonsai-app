"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddProjectModal({ open, onClose }: AddProjectModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [repoExists, setRepoExists] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName("");
      setVisibility("private");
      setDescription("");
      setError("");
      setRepoExists(null);
    });
    fetch("/api/github/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.login) setGithubUser(data.login);
      })
      .catch(() => {});
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
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
      onClose();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  if (!open || !mounted) return null;

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const owner = githubUser || "you";

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-medium)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            New project
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
            />
            {slug && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  github.com/{owner}/{slug}
                </span>
                {checking && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>checking...</span>
                )}
                {!checking && repoExists === true && (
                  <span className="text-xs" style={{ color: "#22c55e" }}>exists — will connect</span>
                )}
                {!checking && repoExists === false && (
                  <span className="text-xs" style={{ color: "var(--accent-blue)" }}>new repo</span>
                )}
              </div>
            )}
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Visibility
              {repoExists === true && (
                <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>(from existing repo)</span>
              )}
            </label>
            <div className="flex gap-2">
              {(["private", "public"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  disabled={repoExists === true}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: visibility === v ? "rgba(91, 141, 249, 0.1)" : "transparent",
                    border: visibility === v ? "1px solid var(--accent-blue)" : "1px solid var(--border-medium)",
                    color: visibility === v ? "var(--accent-blue)" : "var(--text-secondary)",
                    opacity: repoExists === true ? 0.6 : 1,
                  }}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Description
              <span className="text-xs font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                {repoExists === true ? "(from existing repo)" : "(optional)"}
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description"
              readOnly={repoExists === true}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
                opacity: repoExists === true ? 0.6 : 1,
              }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--accent-red, #ef4444)" }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {saving
              ? repoExists ? "Connecting..." : "Creating..."
              : repoExists ? "Connect project" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
