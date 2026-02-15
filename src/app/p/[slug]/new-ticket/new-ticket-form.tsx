"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { TicketType } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";

interface NewTicketFormProps {
  projectId: string;
  projectSlug: string;
  leadAvatar?: string;
  leadName?: string;
}

export function NewTicketForm({ projectId, projectSlug, leadAvatar, leadName }: NewTicketFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType | null>(null);
  const [isEpic, setIsEpic] = useState(false);
  const [epicAutoSelected, setEpicAutoSelected] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [enhancingDescription, setEnhancingDescription] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [images, setImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
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

  function addImageFiles(files: File[]) {
    files.filter((f) => f.type.startsWith("image/")).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDescDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDragOver(false);
    addImageFiles(Array.from(e.dataTransfer.files));
  }

  function handleDescPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
    if (items.length === 0) return;
    e.preventDefault();
    const files = items.map((i) => i.getAsFile()).filter(Boolean) as File[];
    addImageFiles(files);
  }

  // Auto-select Epic when total content is long (likely a large, multi-part ticket)
  const EPIC_THRESHOLD = 500;
  useEffect(() => {
    const totalLen = (description + title + acceptanceCriteria).length;
    if (totalLen >= EPIC_THRESHOLD && !isEpic && !epicAutoSelected) {
      setIsEpic(true);
      setType(null);
      setEpicAutoSelected(true);
    }
  }, [description, title, acceptanceCriteria, isEpic, epicAutoSelected]);

  const accent = isEpic ? "#f97316" : type ? ticketTypes[type].color : "var(--badge-feature)";

  async function generateFromDescription(opts?: { skipEnhance?: boolean }) {
    if (!description.trim()) return;
    const jobs: Promise<void>[] = [];
    if (!opts?.skipEnhance) {
      jobs.push((async () => {
        setEnhancingDescription(true);
        try {
          const res = await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "enhance" }),
          });
          const data = await res.json();
          if (data.enhance) setDescription(data.enhance);
        } catch {} finally { setEnhancingDescription(false); }
      })());
    }
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

  useEffect(() => {
    if (pendingVoiceBlurRef.current && description.trim()) {
      pendingVoiceBlurRef.current = false;
      generateFromDescription({ skipEnhance: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        type: type || "feature",
        description: description.trim() || undefined,
        acceptanceCriteria: acceptanceCriteria.trim() || undefined,
        projectId,
        isEpic: isEpic || undefined,
      }),
    });
    const data = await res.json();
    const ticketId = data.ticket?.id;
    // Upload attached images
    if (ticketId && images.length > 0) {
      await Promise.all(images.map(async (img) => {
        try {
          const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: img.name,
              mimeType: img.dataUrl.split(";")[0].split(":")[1] || "image/png",
              data: img.dataUrl,
              createdByType: "human",
            }),
          });
          if (!res.ok) {
            console.error(`Failed to upload attachment ${img.name}:`, res.status, await res.text());
          }
        } catch (err) {
          console.error(`Failed to upload attachment ${img.name}:`, err);
        }
      }));
    }
    router.push(`/p/${projectSlug}${ticketId ? `?openTicket=${ticketId}` : ""}`);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="grid grid-cols-3 items-center px-10 py-6 border-b"
        style={{ borderBottomColor: "var(--border-subtle)" }}
      >
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            New ticket
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {leadName ? `Tell ${leadName} what to work on` : "What should your team work on?"}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 justify-self-center">
          {leadAvatar ? (
            <img
              src={leadAvatar}
              alt={leadName || "Lead"}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-[var(--border-medium)]"
            />
          ) : (
            <Image
              src="/bonsai-os-logo-d.png"
              alt="Bonsai"
              width={56}
              height={56}
              className="rounded-full"
            />
          )}
          {leadName && (
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{leadName}</span>
          )}
        </div>
        <button
          onClick={() => router.push(`/p/${projectSlug}`)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5 justify-self-end"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
      </div>

      {/* Body — two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: main content */}
        <div className="flex-1 flex flex-col px-10 py-8 gap-6 overflow-y-auto">
          {/* Description */}
          <div className="flex flex-col" style={{ height: "50vh" }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Description</label>
              <VoiceButton voice={voice} />
            </div>
            <div className="relative flex-1 min-h-0">
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => generateFromDescription()}
                onDrop={handleDescDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onPaste={handleDescPaste}
                placeholder={voice.isRecording ? voice.interimTranscript || "Listening..." : ticketTypes[type || "feature"].placeholder}
                autoFocus
                disabled={voice.isProcessingAI || enhancingDescription}
                className="w-full h-full px-5 py-4 rounded-lg text-base leading-relaxed outline-none transition-all resize-none bg-[var(--bg-input)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                style={{ borderColor: dragOver ? "var(--accent-blue)" : undefined }}
              />
              {(voice.isProcessingAI || enhancingDescription) && (
                <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {voice.isProcessingAI ? "Cleaning up your description..." : "Enhancing description..."}
                  </div>
                </div>
              )}
            </div>
            {/* Image thumbnails */}
            {images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group rounded-md overflow-hidden border border-[var(--border-medium)]"
                    style={{ width: 72, height: 72, flexShrink: 0 }}
                  >
                    <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
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
              className="w-full px-5 py-4 rounded-lg text-lg outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-semibold focus:border-[var(--accent-blue)]"
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
                placeholder={criteriaVoice.isRecording ? criteriaVoice.interimTranscript || "Listening..." : generatingCriteria ? "Generating criteria..." : ticketTypes[type || "feature"].criteriaPlaceholder}
                disabled={criteriaVoice.isProcessingAI}
                className="flex-1 w-full h-full px-5 py-4 rounded-lg text-base leading-relaxed outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[120px] focus:border-[var(--accent-blue)]"
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
          style={{ borderLeftColor: "var(--border-subtle)", backgroundColor: "var(--bg-secondary)" }}
        >
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">Type</label>
            <div className="flex flex-col gap-2">
              {/* Epic option */}
              <button
                onClick={() => { setIsEpic(true); setType(null); setEpicAutoSelected(true); }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left border"
                style={{
                  backgroundColor: isEpic ? "color-mix(in srgb, #f97316 15%, transparent)" : "transparent",
                  borderColor: isEpic ? "#f97316" : "var(--border-medium)",
                  color: isEpic ? "#f97316" : "var(--text-secondary)",
                }}
              >
                Epic
              </button>
              {(Object.keys(ticketTypes) as TicketType[]).map((key) => {
                const opt = ticketTypes[key];
                const selected = type === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setType(key); setIsEpic(false); }}
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

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">Artifacts</label>
            <div className="rounded-lg px-4 py-3 text-xs bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              No artifacts yet. Research and plan docs will appear here.
            </div>
          </div>

          <div className="mt-auto pt-6">
            <button
              onClick={handleCreate}
              disabled={!title.trim() || saving}
              className="w-full px-8 py-3 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {saving ? "Creating..." : isEpic ? "Create epic" : `Create ${ticketTypes[type || "feature"].label.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
