"use client";

import React, { useState, useRef, useCallback } from "react";
import type { Persona, CommentAttachment } from "@/types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";

type MentionItem =
  | { kind: "persona"; persona: Persona }
  | { kind: "board"; name: string; label: string; color: string; icon: string }
  | { kind: "team" };

const BOARD_STATES = [
  { name: "research", label: "Research", color: "var(--column-research)", icon: "🔍" },
  { name: "plan", label: "Plan", color: "var(--column-plan)", icon: "📋" },
  { name: "build", label: "Build", color: "var(--column-build)", icon: "🔨" },
  { name: "review", label: "Review", color: "var(--column-test)", icon: "🧪" },
  { name: "ship", label: "Ship", color: "var(--column-ship)", icon: "🚀" },
] as const;

const ROLE_SLUGS = ["designer", "developer", "critic", "researcher", "hacker"];

interface CommentInputProps {
  personasList: Persona[];
  placeholder?: string;
  onPost: (text: string, attachments: CommentAttachment[]) => Promise<void>;
  enableVoice?: boolean;
}

export function CommentInput({ personasList, placeholder, onPost, enableVoice = false }: CommentInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);

  // #column autocomplete state
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [hashIndex, setHashIndex] = useState(0);
  const [hashStart, setHashStart] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput({
    onTranscript: useCallback((t: string) => setText((prev) => prev ? prev + " " + t : t), []),
  });

  // @mention autocomplete: personas + team + role slugs
  const filteredMentions: MentionItem[] = mentionQuery !== null
    ? (() => {
        const q = mentionQuery.toLowerCase();
        const teamMatch: MentionItem[] = "team".startsWith(q) ? [{ kind: "team" }] : [];
        const byName = personasList.filter((p) => p.name.toLowerCase().startsWith(q));
        const byRole = ROLE_SLUGS
          .filter((r) => r.startsWith(q) && q.length > 0)
          .flatMap((r) => personasList.filter((p) => p.role === r))
          .filter((p) => !byName.some((n) => n.id === p.id));
        const personaMatches: MentionItem[] = [...byName, ...byRole].map((p) => ({ kind: "persona", persona: p }));
        return [...teamMatch, ...personaMatches].slice(0, 8);
      })()
    : [];

  // #column autocomplete: board states
  const hashFilteredMentions: MentionItem[] = hashQuery !== null
    ? BOARD_STATES
        .filter((b) => b.name.startsWith(hashQuery.toLowerCase()))
        .map((b): MentionItem => ({ kind: "board", ...b }))
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);

    const atMatch = textBefore.match(/@([\w\p{L}-]*)$/u);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(pos - atMatch[0].length);
      setMentionIndex(0);
      setHashQuery(null);
    } else {
      setMentionQuery(null);
    }

    const hashMatch = textBefore.match(/#([\w]*)$/u);
    if (hashMatch && !atMatch) {
      setHashQuery(hashMatch[1]);
      setHashStart(pos - hashMatch[0].length);
      setHashIndex(0);
    } else {
      setHashQuery(null);
    }
  }

  function insertMention(item: MentionItem) {
    const isHash = item.kind === "board";
    const start = isHash ? hashStart : mentionStart;
    const query = isHash ? hashQuery : mentionQuery;
    const before = text.slice(0, start);
    const after = text.slice(start + 1 + (query?.length || 0));
    const mentionName = item.kind === "team" ? "team" : item.kind === "persona" ? item.persona.name : item.name;
    const prefix = isHash ? "#" : "@";
    const inserted = `${before}${prefix}${mentionName} ${after}`;
    setText(inserted);
    setMentionQuery(null);
    setHashQuery(null);

    setTimeout(() => {
      const ta = inputRef.current;
      if (ta) {
        ta.focus();
        const cursorPos = before.length + 1 + mentionName.length + 1;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  }

  async function handlePost() {
    if (!text.trim() && attachments.length === 0) return;
    setPosting(true);
    try {
      await onPost(text, attachments);
      setText("");
      setAttachments([]);
    } finally {
      setPosting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // @mention navigation
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredMentions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
    }

    // #column navigation
    if (hashQuery !== null && hashFilteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHashIndex((i) => (i + 1) % hashFilteredMentions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHashIndex((i) => (i - 1 + hashFilteredMentions.length) % hashFilteredMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(hashFilteredMentions[hashIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setHashQuery(null); return; }
    }

    // Enter to post (Shift+Enter for newline)
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handlePost();
    }
  }

  function processFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setAttachments((prev) => [...prev, { name: file.name, type: file.type, data }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer.files.length) return;
    processFiles(e.dataTransfer.files);
    inputRef.current?.focus();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function isImageType(type: string) {
    return type.startsWith("image/");
  }

  function getFileIcon(type: string) {
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "DOC";
    if (type.includes("sheet") || type.includes("excel")) return "XLS";
    if (type.includes("presentation") || type.includes("powerpoint")) return "PPT";
    if (type.includes("zip") || type.includes("archive")) return "ZIP";
    if (type.includes("text")) return "TXT";
    if (type.includes("json")) return "JSON";
    if (type.includes("javascript") || type.includes("typescript")) return "JS";
    return "FILE";
  }

  return (
    <div className="px-6 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
      <div
        className="rounded-xl transition-colors"
        style={{
          backgroundColor: dragOver ? "rgba(91, 141, 249, 0.08)" : "var(--bg-input)",
          border: dragOver ? "1px dashed rgba(91, 141, 249, 0.5)" : "1px solid var(--border-medium)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
      >
        <div className="relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            placeholder={enableVoice && voice.isRecording ? voice.interimTranscript || "Listening..." : placeholder || "Write a comment… @ to mention, # for columns"}
            rows={3}
            disabled={enableVoice && voice.isProcessingAI}
            className="w-full p-4 text-sm resize-none bg-transparent"
            style={{ color: "var(--text-primary)", outline: "none" }}
            onKeyDown={handleKeyDown}
          />
          {/* @mention autocomplete dropdown */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div
              className="absolute left-4 bottom-full mb-1 rounded-lg shadow-xl overflow-hidden"
              style={{ backgroundColor: "#1a1a2e", border: "1px solid var(--border-medium)", minWidth: "200px", zIndex: 10 }}
            >
              {filteredMentions.map((item, i) => (
                <div
                  key={item.kind === "team" ? "team" : item.kind === "persona" ? item.persona.id : item.name}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                  style={{ backgroundColor: i === mentionIndex ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onMouseEnter={() => setMentionIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                >
                  {item.kind === "team" ? (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                        style={{ backgroundColor: "rgba(16, 185, 129, 0.2)" }}
                      >
                        👥
                      </div>
                      <span className="text-sm" style={{ color: "#10b981" }}>team</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                        all agents
                      </span>
                    </>
                  ) : item.kind === "persona" ? (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: item.persona.color || "var(--accent-indigo)" }}
                      >
                        {item.persona.avatar ? (
                          <img src={item.persona.avatar} alt={item.persona.name} className="w-full h-full object-cover" />
                        ) : (
                          item.persona.name[0]?.toUpperCase()
                        )}
                      </div>
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.persona.name}</span>
                      {item.persona.role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
                          {item.persona.role}
                        </span>
                      )}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {/* #column autocomplete dropdown */}
          {hashQuery !== null && hashFilteredMentions.length > 0 && (
            <div
              className="absolute left-4 bottom-full mb-1 rounded-lg shadow-xl overflow-hidden"
              style={{ backgroundColor: "#1a1a2e", border: "1px solid var(--border-medium)", minWidth: "200px", zIndex: 10 }}
            >
              {hashFilteredMentions.map((item, i) => (
                <div
                  key={item.kind === "board" ? item.name : ""}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                  style={{ backgroundColor: i === hashIndex ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onMouseEnter={() => setHashIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                >
                  {item.kind === "board" && (
                    <>
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0"
                        style={{ backgroundColor: `color-mix(in srgb, ${item.color} 25%, transparent)` }}
                      >
                        {item.icon}
                      </div>
                      <span className="text-sm" style={{ color: item.color }}>#{item.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
                        column
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group">
                {isImageType(att.type) ? (
                  <img src={att.data} alt={att.name} className="h-16 w-auto rounded-lg object-cover" />
                ) : (
                  <div className="h-16 px-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "var(--text-muted)" }}>
                      {getFileIcon(att.type)}
                    </span>
                    <span className="text-xs truncate max-w-[80px]" style={{ color: "var(--text-secondary)" }}>{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "rgba(239, 68, 68, 0.9)" }}
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            Attach
          </button>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
          {enableVoice && <VoiceButton voice={voice} compact />}
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {posting ? "Posting..." : "Enter to send \u00b7 Shift+Enter for newline"}
          </span>
        </div>
      </div>
    </div>
  );
}
