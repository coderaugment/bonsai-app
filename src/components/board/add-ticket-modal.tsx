"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { TicketType } from "@/types";

interface AddTicketModalProps {
  open: boolean;
  onClose: () => void;
  projectSlug: string;
}

import { ticketTypes } from "@/lib/ticket-types";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function AddTicketModal({ open, onClose, projectSlug }: AddTicketModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const accent = ticketTypes[type].color;
  const titleSlug = slugify(title);
  const ticketBranch = titleSlug ? `${type}/${titleSlug}` : "";
  const worktreePath = titleSlug
    ? `~/.bonsai/worktrees/${projectSlug}/${titleSlug}`
    : "";

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        acceptanceCriteria: acceptanceCriteria.trim() || undefined,
      }),
    });
    setSaving(false);
    setTitle("");
    setDescription("");
    setType("feature");
    setAcceptanceCriteria("");
    onClose();
    router.refresh();
  }

  // Set --accent as a CSS variable on the modal root so all children can use it
  const modalVars = { "--accent": accent } as React.CSSProperties;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)]"
      style={modalVars}
    >
      <div className="w-3/4 h-3/4 rounded-2xl flex flex-col overflow-hidden bg-[var(--bg-card)] border border-[var(--border-medium)]">
        {/* Header with accent stripe */}
        <div
          className="flex items-center justify-between px-8 py-4 border-b border-[var(--border-subtle)]"
          style={{ borderTopWidth: "3px", borderTopColor: "var(--accent)" }}
        >
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            New ticket
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: main content */}
          <div className="flex-1 flex flex-col px-8 py-6 gap-5 overflow-y-auto">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title for the ticket"
                autoFocus
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-semibold focus:border-[var(--accent)]"
                style={{ "--accent": accent } as React.CSSProperties}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    descRef.current?.focus();
                  }
                }}
              />
            </div>

            {/* Description */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                Description
              </label>
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={ticketTypes[type].placeholder}
                className="flex-1 w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                style={{ "--accent": accent } as React.CSSProperties}
              />
            </div>

            {/* Acceptance Criteria */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                Acceptance criteria
              </label>
              <textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder={ticketTypes[type].criteriaPlaceholder}
                className="flex-1 w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[120px] focus:border-[var(--accent)]"
                style={{ "--accent": accent } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Right: metadata sidebar */}
          <div className="w-72 flex flex-col px-6 py-6 gap-6 border-l border-[var(--border-subtle)] overflow-y-auto">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                Type
              </label>
              <div className="flex flex-col gap-2">
                {(Object.keys(ticketTypes) as TicketType[]).map((key) => {
                  const opt = ticketTypes[key];
                  const selected = type === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setType(key)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left border"
                      style={{
                        backgroundColor: selected ? `color-mix(in srgb, ${opt.color} 15%, transparent)` : "transparent",
                        borderColor: selected ? opt.color : "var(--border-medium)",
                        color: selected ? opt.color : "var(--text-secondary)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Artifacts */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                Artifacts
              </label>
              <div className="rounded-lg px-4 py-3 text-xs bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                No artifacts yet. Research and plan docs will appear here.
              </div>
            </div>

            {/* Calculated fields */}
            {titleSlug && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                    Git branch
                  </label>
                  <div className="font-mono text-xs px-3 py-2 rounded-lg break-all bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    {ticketBranch}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                    Worktree path
                  </label>
                  <div className="font-mono text-xs px-3 py-2 rounded-lg break-all bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    {worktreePath}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || saving}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            {saving ? "Creating..." : `Create ${ticketTypes[type].label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
