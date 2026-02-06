"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { Project } from "@/types";

interface ProjectSettingsModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
}

export function ProjectSettingsModal({ open, onClose, project }: ProjectSettingsModalProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [repoName, setRepoName] = useState(project.githubRepo ?? "");
  const [githubUser, setGithubUser] = useState(project.githubOwner ?? "");
  const [repoExists, setRepoExists] = useState<boolean | null>(
    project.githubRepo ? true : null
  );
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setRepoName(project.githubRepo ?? "");
    setGithubUser(project.githubOwner ?? "");
    setRepoExists(project.githubRepo ? true : null);
    setError("");

    fetch("/api/github/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.login) setGithubUser(data.login);
      })
      .catch(() => {});
  }, [open, project]);

  // Debounced repo check when repoName changes
  useEffect(() => {
    if (!repoName.trim()) {
      setRepoExists(null);
      return;
    }
    setChecking(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/github/repo?name=${encodeURIComponent(repoName.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          setRepoExists(data.exists);
          setChecking(false);
        })
        .catch(() => {
          setRepoExists(null);
          setChecking(false);
        });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [repoName]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string | undefined> = {};

      if (name.trim() !== project.name) {
        body.name = name.trim();
      }

      const newRepo = repoName.trim() || undefined;
      const newOwner = githubUser || undefined;
      if (newRepo !== (project.githubRepo ?? undefined) || newOwner !== (project.githubOwner ?? undefined)) {
        body.githubRepo = newRepo ?? "";
        body.githubOwner = newOwner ?? "";
      }

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch("/api/settings/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  if (!open || !mounted) return null;

  const owner = githubUser || "you";
  const slug = repoName.trim().toLowerCase().replace(/\s+/g, "-");
  const hasChanges =
    name.trim() !== project.name ||
    repoName.trim() !== (project.githubRepo ?? "") ||
    githubUser !== (project.githubOwner ?? "");

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
            Project settings
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
          {/* Project name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* GitHub repo */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              GitHub repository
            </label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="repo-name"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
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
                  <span className="text-xs" style={{ color: "#22c55e" }}>found</span>
                )}
                {!checking && repoExists === false && (
                  <span className="text-xs" style={{ color: "var(--accent-red, #ef4444)" }}>not found</span>
                )}
              </div>
            )}
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
            onClick={handleSave}
            disabled={!name.trim() || saving || !hasChanges}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
