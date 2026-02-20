"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { TicketType } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export default function OnboardTicketPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [projectSlug, setProjectSlug] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceBlurRef = useRef(false);

  const voice = useVoiceInput({
    onTranscript: useCallback((text: string) => {
      setDescription(text);
      pendingVoiceBlurRef.current = true;
    }, []),
  });

  const criteriaVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setAcceptanceCriteria(text), []),
    aiField: "massage_criteria",
  });

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const p = Array.isArray(data) ? data[0] : data;
        if (p?.slug) setProjectSlug(p.slug);
      })
      .catch(() => {});
  }, []);

  const accent = ticketTypes[type].color;
  const titleSlug = slugify(title);
  const ticketBranch = titleSlug ? `${type}/${titleSlug}` : "";
  const worktreePath = titleSlug
    ? `~/development/bonsai/projects/${projectSlug}/worktrees/tkt_##`
    : "";

  async function onDescriptionBlur(opts?: { skipEnhance?: boolean }) {
    if (!description.trim()) return;
    const jobs: Promise<void>[] = [];
    // Enhance: fix errors + improve clarity
    if (!opts?.skipEnhance) jobs.push((async () => {
      try {
        const res = await fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: description.trim(), field: "enhance" }),
        });
        const data = await res.json();
        if (data.enhance && data.enhance !== description.trim()) setDescription(data.enhance);
      } catch {}
    })());
    if (!title.trim()) {
      jobs.push((async () => {
        setGeneratingTitle(true);
        try {
          const res = await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "title" }),
          });
          const data = await res.json();
          if (data.title) setTitle(data.title);
        } catch {}
        setGeneratingTitle(false);
      })());
    }
    if (!acceptanceCriteria.trim()) {
      jobs.push((async () => {
        setGeneratingCriteria(true);
        try {
          const res = await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "criteria" }),
          });
          const data = await res.json();
          if (data.criteria) setAcceptanceCriteria(data.criteria);
        } catch {}
        setGeneratingCriteria(false);
      })());
    }
    await Promise.all(jobs);
  }

  // After voice populates description, auto-generate title + criteria (skip enhance — voice already cleaned it)
  useEffect(() => {
    if (pendingVoiceBlurRef.current && description.trim()) {
      pendingVoiceBlurRef.current = false;
      onDescriptionBlur({ skipEnhance: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

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
    router.push("/board");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-10 py-6 border-b"
        style={{ borderBottomColor: "var(--border-subtle)" }}
      >
        <Image
          src="/bonsai-os-logo-d.png"
          alt="Bonsai"
          width={40}
          height={40}
          className="rounded-full"
        />
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Create your first ticket
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            What should your team work on first?
          </p>
        </div>
      </div>

      {/* Body — two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: main content */}
        <div className="flex-1 flex flex-col px-10 py-8 gap-6 overflow-y-auto">
          {/* Description — primary input, enhanced on blur */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <VoiceButton voice={voice} />
            </div>
            <div className="relative flex-1">
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => onDescriptionBlur()}
                placeholder={voice.isRecording ? voice.interimTranscript || "Listening..." : ticketTypes[type].placeholder}
                autoFocus
                disabled={voice.isProcessingAI}
                className="flex-1 w-full h-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)]"
              />
              {voice.isProcessingAI && (
                <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Cleaning up your description...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Title — auto-generated from description on blur */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
              Title
              {generatingTitle && (
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">generating...</span>
              )}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={generatingTitle ? "Generating title..." : "Auto-generated from description"}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-semibold focus:border-[var(--accent-blue)]"
            />
          </div>

          {/* Acceptance Criteria */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Acceptance criteria
                {generatingCriteria && (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">generating...</span>
                )}
              </label>
              <VoiceButton voice={criteriaVoice} />
            </div>
            <div className="relative flex-1">
              <textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder={criteriaVoice.isRecording ? criteriaVoice.interimTranscript || "Listening..." : generatingCriteria ? "Generating criteria..." : ticketTypes[type].criteriaPlaceholder}
                disabled={criteriaVoice.isProcessingAI}
                className="flex-1 w-full h-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[120px] focus:border-[var(--accent-blue)]"
              />
              {criteriaVoice.isProcessingAI && (
                <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Formatting criteria...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: metadata sidebar */}
        <div
          className="w-72 flex flex-col px-6 py-8 gap-6 border-l overflow-y-auto"
          style={{
            borderLeftColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
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
                      backgroundColor: selected
                        ? `color-mix(in srgb, ${opt.color} 15%, transparent)`
                        : "transparent",
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

          {/* Artifacts placeholder */}
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
      <div
        className="flex items-center justify-end px-10 py-5 border-t"
        style={{ borderTopColor: "var(--border-subtle)" }}
      >
        <button
          onClick={handleCreate}
          disabled={!title.trim() || saving}
          className="px-8 py-3 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          {saving ? "Creating..." : `Create ${ticketTypes[type].label.toLowerCase()} & enter board`}
        </button>
      </div>
    </div>
  );
}
