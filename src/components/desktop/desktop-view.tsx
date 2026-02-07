"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";
import type { ProjectNote, ExtractedItem, TicketType } from "@/types";

// ── Type badge colors ────────────────────────────
const typeBadge: Record<TicketType, { bg: string; label: string }> = {
  feature: { bg: "#22c55e22", label: "Feature" },
  bug: { bg: "#ef444422", label: "Bug" },
  chore: { bg: "#eab30822", label: "Chore" },
};

const typeColor: Record<TicketType, string> = {
  feature: "#22c55e",
  bug: "#ef4444",
  chore: "#eab308",
};

// ── Note Card ────────────────────────────────────
function NoteCard({
  note,
  onDelete,
}: {
  note: ProjectNote;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="relative group rounded-lg border p-3 transition-colors"
      style={{
        borderColor: "var(--border-medium)",
        backgroundColor: "var(--bg-input)",
      }}
    >
      {/* Delete button */}
      <button
        onClick={() => onDelete(note.id)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
        style={{ color: "var(--text-muted)" }}
        title="Delete note"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {note.type === "image" ? (
        <img
          src={note.content}
          alt="Note image"
          className="w-full h-32 object-cover rounded"
          style={{ backgroundColor: "#1a1a1a" }}
        />
      ) : (
        <p
          className="text-sm whitespace-pre-wrap pr-6"
          style={{ color: "var(--text-primary)" }}
        >
          {note.content}
        </p>
      )}

      <span
        className="block mt-2 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {new Date(note.createdAt).toLocaleString()}
      </span>
    </div>
  );
}

// ── Extraction Item Row ──────────────────────────
function ExtractionRow({
  item,
  onAction,
}: {
  item: ExtractedItem;
  onAction: (id: number, status: "approved" | "rejected") => void;
}) {
  const badge = typeBadge[item.type];
  const color = typeColor[item.type];

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--border-medium)" }}
    >
      {/* Type badge */}
      <span
        className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium mt-0.5"
        style={{ backgroundColor: badge.bg, color }}
      >
        {badge.label}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {item.title}
        </p>
        {item.description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onAction(item.id, "approved")}
          className="p-1.5 rounded transition-colors hover:bg-green-500/20"
          style={{ color: "#22c55e" }}
          title="Approve — create ticket"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onClick={() => onAction(item.id, "rejected")}
          className="p-1.5 rounded transition-colors hover:bg-red-500/20"
          style={{ color: "#ef4444" }}
          title="Reject"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Desktop View ────────────────────────────
interface DesktopViewProps {
  projectId: number;
}

export function DesktopView({ projectId }: DesktopViewProps) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [extractions, setExtractions] = useState<ExtractedItem[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input — raw capture, no AI cleanup
  const voice = useVoiceInput({
    aiCleanup: false,
    onTranscript: async (text) => {
      await saveNote("text", text);
    },
  });

  // Fetch notes + pending extractions on mount
  const fetchNotes = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/notes`);
    if (res.ok) setNotes(await res.json());
  }, [projectId]);

  const fetchExtractions = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/extractions`);
    if (res.ok) setExtractions(await res.json());
  }, [projectId]);

  useEffect(() => {
    fetchNotes();
    fetchExtractions();
  }, [fetchNotes, fetchExtractions]);

  // Focus textarea when text input opens
  useEffect(() => {
    if (showTextInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showTextInput]);

  // ── Helpers ──
  async function saveNote(type: "text" | "image", content: string) {
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content }),
    });
    if (res.ok) {
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
    }
  }

  async function deleteNote(noteId: number) {
    await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
      method: "DELETE",
    });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  function handleTextSubmit() {
    const trimmed = textDraft.trim();
    if (!trimmed) return;
    saveNote("text", trimmed);
    setTextDraft("");
    setShowTextInput(false);
  }

  function handleTextKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleTextSubmit();
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        saveNote("image", reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  }

  async function handleExtract() {
    setIsExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extract`, {
        method: "POST",
      });
      if (res.ok) {
        const items: ExtractedItem[] = await res.json();
        setExtractions(items);
      }
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleExtractionAction(
    itemId: number,
    status: "approved" | "rejected"
  ) {
    await fetch(`/api/projects/${projectId}/extractions/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setExtractions((prev) => prev.filter((e) => e.id !== itemId));
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* ── Input bar ────────────────────── */}
      <div
        className="rounded-lg border p-4 mb-6"
        style={{
          borderColor: "var(--border-medium)",
          backgroundColor: "var(--bg-input)",
        }}
      >
        {/* Voice transcript preview */}
        {voice.isRecording && voice.interimTranscript && (
          <div
            className="mb-3 p-3 rounded text-sm italic"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "var(--text-secondary)",
            }}
          >
            {voice.interimTranscript}
          </div>
        )}

        {/* Text input area */}
        {showTextInput && (
          <div className="mb-3">
            <textarea
              ref={textareaRef}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={handleTextKeyDown}
              placeholder="Type your note..."
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none border-0 outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                color: "var(--text-primary)",
              }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleTextSubmit}
                disabled={!textDraft.trim()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: "var(--accent-blue)" }}
              >
                Save Note
              </button>
              <button
                onClick={() => {
                  setShowTextInput(false);
                  setTextDraft("");
                }}
                className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                Cmd+Enter to save
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <VoiceButton voice={voice} />

          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors"
            style={{
              backgroundColor: showTextInput ? "var(--accent-blue)" : "transparent",
              borderColor: showTextInput ? "var(--accent-blue)" : "var(--border-medium)",
              color: showTextInput ? "white" : "var(--text-secondary)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Type Note
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors"
            style={{
              borderColor: "var(--border-medium)",
              color: "var(--text-secondary)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Add Image
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* ── Notes grid ───────────────────── */}
      {notes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={deleteNote} />
          ))}
        </div>
      )}

      {notes.length === 0 && extractions.length === 0 && (
        <div
          className="text-center py-16 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No notes yet. Record a voice note, type something, or add an image to get started.
        </div>
      )}

      {/* ── Extract Work button ──────────── */}
      {notes.length > 0 && (
        <div className="mb-6">
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {isExtracting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Extracting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Extract Work ({notes.length} note{notes.length !== 1 ? "s" : ""})
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Extraction results ───────────── */}
      {extractions.length > 0 && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            borderColor: "var(--border-medium)",
            backgroundColor: "var(--bg-input)",
          }}
        >
          <div
            className="px-4 py-2.5 border-b text-xs font-medium"
            style={{
              borderColor: "var(--border-medium)",
              color: "var(--text-secondary)",
            }}
          >
            Extracted Work Items ({extractions.length})
          </div>
          {extractions.map((item) => (
            <ExtractionRow
              key={item.id}
              item={item}
              onAction={handleExtractionAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
