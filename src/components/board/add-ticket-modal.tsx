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

// Web Speech API TypeScript declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
}

declare let _webkitSpeechRecognition: {
  new (): SpeechRecognition;
};

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
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceBlurRef = useRef(false);

  // Speech-to-text state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if Web Speech API is supported
  const isSpeechSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

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

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  // Trigger title/criteria generation after voice transcript sets description
  useEffect(() => {
    if (pendingVoiceBlurRef.current && description.trim()) {
      pendingVoiceBlurRef.current = false;
      generateFromDescription({ skipEnhance: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  if (!open) return null;

  const startRecording = () => {
    if (!isSpeechSupported) return;

    try {
      const SpeechRecognition = (window as unknown as Record<string, { new(): SpeechRecognition }>).webkitSpeechRecognition || (window as unknown as Record<string, { new(): SpeechRecognition }>).SpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(finalTranscript + interim);
      };

      recognition.onerror = (event: Event & { error?: string }) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setInterimTranscript('');
        // TODO: Show error toast to user
      };

      recognition.onend = () => {
        if (isRecording) {
          // Recording was stopped, process the transcript
          processTranscript(finalTranscript.trim());
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);

      // Safety timeout: auto-stop after 2 minutes
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 120000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      // TODO: Show error toast
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setIsRecording(false);
    setInterimTranscript('');
  };

  const processTranscript = async (transcript: string) => {
    if (!transcript) {
      setInterimTranscript('');
      return;
    }

    setIsProcessingAI(true);

    try {
      const res = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: transcript,
          field: "massage"
        }),
      });

      const data = await res.json();

      if (data.massage) {
        // AI cleanup successful - use cleaned text
        setDescription(data.massage);
      } else {
        // AI failed - fallback to raw transcript
        setDescription(transcript);
      }
      pendingVoiceBlurRef.current = true;
    } catch (error) {
      console.error('Failed to process transcript:', error);
      // Fallback: use raw transcript even if AI fails
      setDescription(transcript);
      pendingVoiceBlurRef.current = true;
    } finally {
      setIsProcessingAI(false);
      setInterimTranscript('');
    }
  };

  async function generateFromDescription(opts?: { skipEnhance?: boolean }) {
    if (!description.trim()) return;
    const jobs: Promise<void>[] = [];
    if (!opts?.skipEnhance) {
      jobs.push((async () => {
        try {
          const res = await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "enhance" }),
          });
          const data = await res.json();
          if (data.enhance) setDescription(data.enhance);
        } catch {}
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
        } catch {} finally { setGeneratingTitle(false); }
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
        } catch {} finally { setGeneratingCriteria(false); }
      })());
    }
    await Promise.all(jobs);
  }

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
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Title
                </label>
                {generatingTitle && (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    generating...
                  </span>
                )}
              </div>
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
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="description" className="text-sm font-medium text-[var(--text-secondary)]">
                  Description
                </label>
                {isSpeechSupported && (
                  <div className="flex items-center gap-2">
                    {isRecording && (
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isProcessingAI}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
                        isRecording
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]/80 border border-[var(--border-medium)]'
                      } ${isProcessingAI ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={isRecording ? 'Stop recording' : 'Start voice input'}
                    >
                      {isRecording ? (
                        <>
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          Recording...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          Voice
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div className="relative flex-1">
                <textarea
                  id="description"
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => generateFromDescription()}
                  placeholder={isRecording ? interimTranscript || "Listening..." : ticketTypes[type].placeholder}
                  className="flex-1 w-full h-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  style={{ "--accent": accent } as React.CSSProperties}
                  disabled={isProcessingAI}
                />
                {isProcessingAI && (
                  <div className="absolute inset-0 bg-[var(--bg-card)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
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

            {/* Acceptance Criteria */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--text-secondary)]">
                  Acceptance criteria
                </label>
                {generatingCriteria && (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    generating...
                  </span>
                )}
              </div>
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
