"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Ticket, TicketType, TicketState, Comment, CommentAttachment, TicketDocument, TicketAttachment } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onDelete?: (ticketId: string) => void;
}

const typeOptions: TicketType[] = ["feature", "bug", "chore"];
const stateOptions: TicketState[] = ["backlog", "in_progress", "verification", "done"];

export function TicketDetailModal({ ticket, onClose, onDelete }: TicketDetailModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [state, setState] = useState<TicketState>("backlog");

  // Attachments state
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentAttachments, setCommentAttachments] = useState<CommentAttachment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [dragOverComment, setDragOverComment] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Documents state
  const [documents, setDocuments] = useState<TicketDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [approvingResearch, setApprovingResearch] = useState(false);
  const [approvingPlan, setApprovingPlan] = useState(false);

  // Local lifecycle state (from ticket prop, refreshed after actions)
  const [researchApprovedAt, setResearchApprovedAt] = useState<string | undefined>();
  const [planApprovedAt, setPlanApprovedAt] = useState<string | undefined>();

  // Full-screen document viewer
  const [expandedDoc, setExpandedDoc] = useState<TicketDocument | null>(null);

  // Voice input hooks
  const descVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setDescription(text), []),
  });
  const criteriaVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setAcceptanceCriteria(text), []),
    aiField: "massage_criteria",
  });
  const commentVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setNewComment((prev) => prev ? prev + " " + text : text), []),
  });

  // Quote-to-comment state — popup uses refs (no re-render) to preserve selection
  const quotePopupRef = useRef<HTMLDivElement>(null);
  const quoteTextRef = useRef<string>("");
  const [quoteModalText, setQuoteModalText] = useState<string | null>(null);
  const [quoteComment, setQuoteComment] = useState("");
  const [postingQuote, setPostingQuote] = useState(false);
  const docBodyRef = useRef<HTMLDivElement>(null);

  // Initialize form when a *different* ticket is opened (by ID, not reference)
  const ticketId = ticket?.id;
  useEffect(() => {
    if (ticket && ticketId) {
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      setAcceptanceCriteria(ticket.acceptanceCriteria || "");
      setType(ticket.type);
      setState(ticket.state);
      setResearchApprovedAt(ticket.researchApprovedAt);
      setPlanApprovedAt(ticket.planApprovedAt);
      loadComments(ticket.id);
      loadDocuments(ticket.id);
      loadAttachments(ticket.id);

      // Auto-focus comment input after a brief delay to ensure DOM is ready
      const focusTimer = setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);

      return () => clearTimeout(focusTimer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ticket) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [ticket, onClose]);

  // Poll comments every 10s while modal is open (doesn't touch form state)
  useEffect(() => {
    if (!ticketId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/comments?ticketId=${ticketId}`);
        const data = await res.json();
        const fresh = data.comments || [];
        setComments((prev) => {
          if (fresh.length !== prev.length) {
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            return fresh;
          }
          return prev;
        });
      } catch { /* skip cycle */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [ticketId]);

  async function loadComments(ticketId: string) {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/comments?ticketId=${ticketId}`);
      const data = await res.json();
      setComments(data.comments || []);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } finally {
      setLoadingComments(false);
    }
  }

  async function loadDocuments(ticketId: string) {
    setLoadingDocuments(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } finally {
      setLoadingDocuments(false);
    }
  }

  async function loadAttachments(ticketId: string) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/attachments`);
      const data = await res.json();
      setAttachments(data || []);
    } catch (error) {
      console.error("Failed to load attachments:", error);
    }
  }

  async function handleApproveResearch() {
    if (!ticket) return;
    setApprovingResearch(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/approve-research`, { method: "POST" });
      setResearchApprovedAt(new Date().toISOString());
      router.refresh();
      onClose();
    } finally {
      setApprovingResearch(false);
    }
  }

  async function handleApprovePlan() {
    if (!ticket) return;
    setApprovingPlan(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/approve-plan`, { method: "POST" });
      setPlanApprovedAt(new Date().toISOString());
      router.refresh();
      onClose();
    } finally {
      setApprovingPlan(false);
    }
  }

  async function handlePostComment() {
    if (!ticket || (!newComment.trim() && commentAttachments.length === 0)) return;
    setPostingComment(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          content: newComment,
          attachments: commentAttachments.length > 0 ? commentAttachments : undefined,
        }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
        setCommentAttachments([]);
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

        // Dispatch agent to handle comment
        try {
          const dispatchRes = await fetch(`/api/tickets/${ticket.id}/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentContent: newComment }),
          });
          const dispatchData = await dispatchRes.json();
          if (dispatchData.pmComment) {
            setComments((prev) => [...prev, dispatchData.pmComment]);
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }
        } catch {
          // dispatch failed silently
        }
      }
    } finally {
      setPostingComment(false);
    }
  }

  // Quote-to-comment: detect text selection in the doc viewer
  // Uses direct DOM manipulation (no setState) to avoid re-render clearing the selection
  function handleDocMouseUp() {
    const popup = quotePopupRef.current;
    if (!popup) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      popup.style.display = "none";
      quoteTextRef.current = "";
      return;
    }
    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    quoteTextRef.current = text;
    popup.style.display = "flex";
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.top = `${rect.top - 10}px`;
  }

  function handleDocMouseDown(e: React.MouseEvent) {
    // Dismiss the quote popup if clicking outside it
    const popup = quotePopupRef.current;
    if (popup && popup.style.display !== "none" && !(e.target as HTMLElement).closest("[data-quote-popup]")) {
      popup.style.display = "none";
      quoteTextRef.current = "";
    }
  }

  async function handlePostQuoteComment() {
    if (!ticket || !quoteModalText || !quoteComment.trim()) return;
    setPostingQuote(true);
    const docLabel = expandedDoc
      ? expandedDoc.type === "research"
        ? `Research Document v${expandedDoc.version}`
        : `Implementation Plan v${expandedDoc.version}`
      : "Document";
    const quotedLines = quoteModalText.split("\n").map((l) => `> ${l}`).join("\n");
    const content = `${quotedLines}\n\n_(from ${docLabel})_\n\n${quoteComment}`;
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, content }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setQuoteModalText(null);
        setQuoteComment("");
        setExpandedDoc(null);
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

        // Dispatch PM triage + agent spawn (fire-and-forget from frontend POV)
        try {
          const dispatchRes = await fetch(`/api/tickets/${ticket.id}/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentContent: content }),
          });
          const dispatchData = await dispatchRes.json();
          if (dispatchData.pmComment) {
            setComments((prev) => [...prev, dispatchData.pmComment]);
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }
        } catch {
          // dispatch failed silently — agent work won't happen but comment is saved
        }
      }
    } finally {
      setPostingQuote(false);
    }
  }

  function handleCommentFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverComment(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    processCommentFiles(files);
  }

  function handleCommentFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    processCommentFiles(files);
    if (commentFileInputRef.current) {
      commentFileInputRef.current.value = "";
    }
  }

  function processCommentFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setCommentAttachments((prev) => [
          ...prev,
          { name: file.name, type: file.type, data },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeCommentAttachment(index: number) {
    setCommentAttachments((prev) => prev.filter((_, i) => i !== index));
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

  async function handleSave() {
    if (!ticket) return;
    setSaving(true);
    try {
      await fetch("/api/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          title,
          description,
          acceptanceCriteria,
          type,
          state,
        }),
      });
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !ticket) return;

    setUploadingAttachment(true);

    try {
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        // Upload to API
        const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            data: dataUrl,
            createdByType: "human",
            createdById: "1", // TODO: Get actual user ID
          }),
        });

        if (!res.ok) {
          console.error("Failed to upload attachment");
          continue;
        }

        const newAttachment = await res.json();
        setAttachments((prev) => [...prev, newAttachment]);
      }

      router.refresh();
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function removeAttachment(id: number) {
    if (!ticket) return;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to delete attachment:", error);
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  if (!ticket || !mounted) return null;

  const typeStyle = ticketTypes[type];

  const modal = (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      {/* Two-column layout */}
      <div className="flex w-full h-full">
        {/* Left column - Ticket details */}
        <div
          className="flex-1 flex flex-col h-full overflow-hidden"
          style={{
            backgroundColor: "#0f0f1a",
            borderRight: "1px solid var(--border-medium)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between px-8 py-6 border-b flex-shrink-0"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-3 mb-4">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TicketType)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer appearance-none"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${typeStyle.bg} 15%, transparent)`,
                    color: typeStyle.text,
                    border: "none",
                    outline: "none",
                  }}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t} style={{ backgroundColor: "#1a1a2e", color: "#fff" }}>
                      {ticketTypes[t].label}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {ticket.id}
                </span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-2xl font-bold leading-tight bg-transparent border-none outline-none"
                style={{ color: "var(--text-primary)" }}
                placeholder="Ticket title..."
              />
            </div>
            <div className="flex items-center gap-1">
              {onDelete && (
                <button
                  onClick={async () => {
                    if (!ticket) return;
                    if (!confirm(`Delete ${ticket.id}?`)) return;
                    await fetch("/api/tickets", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ticketId: ticket.id }),
                    });
                    onDelete(ticket.id);
                    onClose();
                  }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
                  style={{ color: "var(--text-muted)" }}
                  title="Delete ticket"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "var(--text-muted)" }}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body - scrollable */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Description
                </label>
                <VoiceButton voice={descVoice} />
              </div>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={10}
                  disabled={descVoice.isProcessingAI}
                  className="w-full rounded-xl p-5 text-[15px] leading-relaxed resize-y min-h-[220px]"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={descVoice.isRecording ? descVoice.interimTranscript || "Listening..." : "Describe what needs to be done..."}
                />
                {descVoice.isProcessingAI && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(15, 15, 26, 0.85)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
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
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Acceptance Criteria
                </label>
                <VoiceButton voice={criteriaVoice} />
              </div>
              <div className="relative">
                <textarea
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                  rows={10}
                  disabled={criteriaVoice.isProcessingAI}
                  className="w-full rounded-xl p-5 text-sm font-mono leading-relaxed resize-y min-h-[220px]"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={criteriaVoice.isRecording ? criteriaVoice.interimTranscript || "Listening..." : "- Criteria 1\n- Criteria 2\n- Criteria 3"}
                />
                {criteriaVoice.isProcessingAI && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
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

            {/* Research & Plan Documents */}
            <div>
              <label className="block text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                Documents
              </label>

              {loadingDocuments ? (
                <div className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  Loading documents...
                </div>
              ) : (documents.length > 0 || ticket?.researchCompletedAt || ticket?.planCompletedAt) ? (
                <div className="space-y-4">
                  {/* Research Document */}
                  {(ticket?.researchCompletedAt || documents.some(d => d.type === "research")) && (() => {
                    const researchDoc = documents.find(d => d.type === "research");
                    return (
                      <div
                        className="rounded-xl p-5"
                        style={{
                          backgroundColor: researchApprovedAt ? "rgba(34, 197, 94, 0.08)" : "rgba(245, 158, 11, 0.08)",
                          border: `1px solid ${researchApprovedAt ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" style={{ color: researchApprovedAt ? "#22c55e" : "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                              Research
                            </span>
                            {researchApprovedAt ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", color: "#22c55e" }}>
                                Approved
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(245, 158, 11, 0.2)", color: "#f59e0b" }}>
                                Awaiting Approval
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {researchDoc?.content && (
                              <button
                                onClick={() => setExpandedDoc(researchDoc)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                              >
                                View Full
                              </button>
                            )}
                            {!researchApprovedAt && (
                              <button
                                onClick={handleApproveResearch}
                                disabled={approvingResearch}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                                style={{ backgroundColor: "#22c55e", color: "#fff", opacity: approvingResearch ? 0.5 : 1 }}
                              >
                                {approvingResearch ? "Approving..." : "Approve"}
                              </button>
                            )}
                          </div>
                        </div>
                        {researchDoc?.content && (
                          <div
                            className="text-sm leading-relaxed max-h-[120px] overflow-hidden relative cursor-pointer"
                            style={{ color: "rgba(255, 255, 255, 0.8)" }}
                            onClick={() => setExpandedDoc(researchDoc)}
                          >
                            <div className="prose-sm">
                              <ReactMarkdown
                                components={{
                                  h1: ({ children }) => <h1 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h1>,
                                  h2: ({ children }) => <h2 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h2>,
                                  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h3>,
                                  p: ({ children }) => <p className="mb-1.5">{children}</p>,
                                  strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
                                  code: ({ children }) => <code className="bg-white/10 px-1 rounded text-[12px]">{children}</code>,
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
                                }}
                              >
                                {researchDoc.content}
                              </ReactMarkdown>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-10" style={{ background: `linear-gradient(transparent, ${researchApprovedAt ? "rgba(10, 30, 15, 0.95)" : "rgba(30, 22, 8, 0.95)"})` }} />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Implementation Plan Document */}
                  {(ticket?.planCompletedAt || documents.some(d => d.type === "implementation_plan")) && (() => {
                    const planDoc = documents.find(d => d.type === "implementation_plan");
                    return (
                      <div
                        className="rounded-xl p-5"
                        style={{
                          backgroundColor: planApprovedAt ? "rgba(34, 197, 94, 0.08)" : "rgba(245, 158, 11, 0.08)",
                          border: `1px solid ${planApprovedAt ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" style={{ color: planApprovedAt ? "#22c55e" : "#f59e0b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                              Implementation Plan
                            </span>
                            {planApprovedAt ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(34, 197, 94, 0.2)", color: "#22c55e" }}>
                                Approved
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(245, 158, 11, 0.2)", color: "#f59e0b" }}>
                                Awaiting Approval
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {planDoc?.content && (
                              <button
                                onClick={() => setExpandedDoc(planDoc)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                              >
                                View Full
                              </button>
                            )}
                            {!planApprovedAt && (
                              <button
                                onClick={handleApprovePlan}
                                disabled={approvingPlan}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                                style={{ backgroundColor: "#22c55e", color: "#fff", opacity: approvingPlan ? 0.5 : 1 }}
                              >
                                {approvingPlan ? "Approving..." : "Approve"}
                              </button>
                            )}
                          </div>
                        </div>
                        {planDoc?.content && (
                          <div
                            className="text-sm leading-relaxed max-h-[120px] overflow-hidden relative cursor-pointer"
                            style={{ color: "rgba(255, 255, 255, 0.8)" }}
                            onClick={() => setExpandedDoc(planDoc)}
                          >
                            <div className="prose-sm">
                              <ReactMarkdown
                                components={{
                                  h1: ({ children }) => <h1 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h1>,
                                  h2: ({ children }) => <h2 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h2>,
                                  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h3>,
                                  p: ({ children }) => <p className="mb-1.5">{children}</p>,
                                  strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
                                  code: ({ children }) => <code className="bg-white/10 px-1 rounded text-[12px]">{children}</code>,
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
                                }}
                              >
                                {planDoc.content}
                              </ReactMarkdown>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-10" style={{ background: `linear-gradient(transparent, ${planApprovedAt ? "rgba(10, 30, 15, 0.95)" : "rgba(30, 22, 8, 0.95)"})` }} />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div
                  className="rounded-xl p-5 flex items-center gap-3"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)", opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      No research or plan documents yet
                    </span>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                      Documents appear here once an agent researches this ticket
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Attachments
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Upload
                </button>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
              </div>

              {uploadingAttachment && (
                <div className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Uploading...
                </div>
              )}

              {attachments.length === 0 ? (
                <div
                  className="rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-white/5"
                  style={{ border: "1px dashed var(--border-medium)", color: "var(--text-muted)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-6 h-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-xs">Drop files or click to upload</span>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {attachments.map((att) => {
                    const isImage = att.mimeType.startsWith("image/");
                    const attachmentUrl = `/api/tickets/${ticket?.id}/attachments/${att.id}`;

                    if (isImage) {
                      return (
                        <div
                          key={att.id}
                          className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer"
                          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
                          onClick={() => setLightboxImage(attachmentUrl)}
                        >
                          <img src={attachmentUrl} alt={att.filename} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                          <button
                            onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    } else {
                      // Non-image file badge
                      return (
                        <a
                          key={att.id}
                          href={attachmentUrl}
                          download={att.filename}
                          className="relative group rounded-lg p-3 flex flex-col items-center justify-center gap-1 transition-colors hover:bg-white/10"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
                        >
                          <svg className="w-6 h-6" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="text-xs text-center truncate w-full" style={{ color: "var(--text-secondary)" }}>
                            {att.filename}
                          </span>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAttachment(att.id); }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </a>
                      );
                    }
                  })}
                  <div
                    className="aspect-square rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-white/10"
                    style={{ border: "1px dashed var(--border-medium)", color: "var(--text-muted)" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as TicketState)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                  style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", outline: "none" }}
                >
                  {stateOptions.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "#1a1a2e" }}>
                      {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Created</label>
                <div className="px-4 py-2.5 rounded-xl text-sm" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-muted)" }}>
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : "Unknown"}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-8 py-5 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: saving || !title.trim() ? 0.5 : 1 }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Right column - Comments */}
        <div
          className="w-[420px] flex flex-col h-full flex-shrink-0"
          style={{ backgroundColor: "#0a0a12" }}
        >
          {/* Comments header */}
          <div className="px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Comments {comments.length > 0 && <span style={{ color: "var(--text-muted)" }}>({comments.length})</span>}
            </h3>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loadingComments ? (
              <div className="flex items-center justify-center py-12" style={{ color: "var(--text-muted)" }}>
                <span className="text-sm">Loading comments...</span>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: "var(--text-muted)" }}>
                <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm">No comments yet</span>
                <span className="text-xs mt-1 opacity-60">Start the conversation below</span>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="group">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: comment.author?.color || "var(--accent-indigo)" }}
                    >
                      {comment.author?.avatarUrl ? (
                        <img src={comment.author.avatarUrl} alt={comment.author.name} className="w-full h-full object-cover" />
                      ) : (
                        comment.author?.name?.[0]?.toUpperCase() || (comment.authorType === "agent" ? "A" : "H")
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {comment.author?.name || (comment.authorType === "agent" ? "Agent" : "Human")}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: comment.authorType === "agent" ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                            color: comment.authorType === "agent" ? "#a78bfa" : "#60a5fa",
                          }}
                        >
                          {comment.authorType === "agent" && comment.author?.role ? comment.author.role : comment.authorType}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatTime(comment.createdAt)}
                        </span>
                      </div>
                      {comment.content && (
                        <div
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ color: "rgba(255,255,255,0.8)" }}
                        >
                          {comment.content}
                        </div>
                      )}
                      {/* Comment attachments */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comment.attachments.map((att, i) => (
                            isImageType(att.type) ? (
                              <img
                                key={i}
                                src={att.data}
                                alt={att.name}
                                className="max-w-[200px] max-h-[150px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightboxImage(att.data)}
                              />
                            ) : (
                              <div
                                key={i}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                              >
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
                                >
                                  {getFileIcon(att.type)}
                                </span>
                                <span className="text-xs truncate max-w-[120px]" style={{ color: "var(--text-secondary)" }}>
                                  {att.name}
                                </span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>

          {/* Comment input */}
          <div className="px-6 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              className="rounded-xl transition-colors"
              style={{
                backgroundColor: dragOverComment ? "rgba(91, 141, 249, 0.08)" : "var(--bg-input)",
                border: dragOverComment ? "1px dashed rgba(91, 141, 249, 0.5)" : "1px solid var(--border-medium)",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOverComment(true); }}
              onDragLeave={() => setDragOverComment(false)}
              onDrop={handleCommentFileDrop}
            >
              <textarea
                ref={commentInputRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={commentVoice.isRecording ? commentVoice.interimTranscript || "Listening..." : "Write a comment or drop files..."}
                rows={3}
                disabled={commentVoice.isProcessingAI}
                className="w-full p-4 text-sm resize-none bg-transparent"
                style={{ color: "var(--text-primary)", outline: "none" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handlePostComment();
                  }
                }}
              />
              {/* Attachment previews */}
              {commentAttachments.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {commentAttachments.map((att, i) => (
                    <div key={i} className="relative group">
                      {isImageType(att.type) ? (
                        <img
                          src={att.data}
                          alt={att.name}
                          className="h-16 w-auto rounded-lg object-cover"
                        />
                      ) : (
                        <div
                          className="h-16 px-3 rounded-lg flex items-center gap-2"
                          style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                        >
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
                          >
                            {getFileIcon(att.type)}
                          </span>
                          <span className="text-xs truncate max-w-[80px]" style={{ color: "var(--text-secondary)" }}>
                            {att.name}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => removeCommentAttachment(i)}
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
                  onClick={() => commentFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  Attach
                </button>
                <input ref={commentFileInputRef} type="file" multiple onChange={handleCommentFileSelect} className="hidden" />
                <VoiceButton voice={commentVoice} compact />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  ⌘+Enter to send
                </span>
              </div>
              <button
                onClick={handlePostComment}
                disabled={postingComment || (!newComment.trim() && commentAttachments.length === 0)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--accent-blue)",
                  color: "#fff",
                  opacity: postingComment || (!newComment.trim() && commentAttachments.length === 0) ? 0.5 : 1,
                }}
              >
                {postingComment ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Lightbox for full-size image viewing
  const lightbox = lightboxImage && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.95)" }}
      onClick={() => setLightboxImage(null)}
    >
      <button
        onClick={() => setLightboxImage(null)}
        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={lightboxImage}
        alt="Full size"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );

  // Full-screen document viewer
  const docViewer = expandedDoc && (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-8 py-4 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "#0f0f1a" }}
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" style={{ color: expandedDoc.type === "research" ? "#f59e0b" : "#8b5cf6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {expandedDoc.type === "research" ? "Research Document" : "Implementation Plan"}
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {ticket?.id}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            v{expandedDoc.version}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {expandedDoc.type === "research" && !researchApprovedAt && (
            <button
              onClick={() => { handleApproveResearch(); setExpandedDoc(null); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: "#22c55e", color: "#fff" }}
            >
              Approve Research
            </button>
          )}
          {expandedDoc.type === "implementation_plan" && !planApprovedAt && (
            <button
              onClick={() => { handleApprovePlan(); setExpandedDoc(null); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: "#22c55e", color: "#fff" }}
            >
              Approve Plan
            </button>
          )}
          <button
            onClick={() => setExpandedDoc(null)}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quote popup — always in DOM, shown/hidden via ref to avoid re-render clearing selection */}
      <div
        ref={quotePopupRef}
        data-quote-popup
        className="fixed items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-lg cursor-pointer hover:brightness-110"
        style={{
          display: "none",
          transform: "translate(-50%, -100%)",
          backgroundColor: "var(--accent-blue)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 600,
          zIndex: 65,
        }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setQuoteModalText(quoteTextRef.current);
          quotePopupRef.current!.style.display = "none";
          setQuoteComment("");
          window.getSelection()?.removeAllRanges();
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        Quote
      </div>

      {/* Document body — full-screen scrollable rendered markdown */}
      <div
        ref={docBodyRef}
        className="flex-1 overflow-y-auto"
        onMouseUp={handleDocMouseUp}
        onMouseDown={handleDocMouseDown}
      >
        <div className="max-w-3xl mx-auto px-8 py-10">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4 pb-2" style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-3" style={{ color: "var(--text-primary)" }}>{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold mt-5 mb-2" style={{ color: "var(--text-primary)" }}>{children}</h3>,
                h4: ({ children }) => <h4 className="text-base font-semibold mt-4 mb-2" style={{ color: "var(--text-secondary)" }}>{children}</h4>,
                p: ({ children }) => <p className="mb-3 leading-relaxed" style={{ color: "rgba(255, 255, 255, 0.85)" }}>{children}</p>,
                strong: ({ children }) => <strong className="font-semibold" style={{ color: "#fff" }}>{children}</strong>,
                em: ({ children }) => <em style={{ color: "rgba(255, 255, 255, 0.75)" }}>{children}</em>,
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <code className={`block whitespace-pre overflow-x-auto rounded-lg p-4 text-[13px] leading-relaxed ${className || ""}`} style={{ backgroundColor: "rgba(0, 0, 0, 0.4)", color: "#e2e8f0", border: "1px solid var(--border-subtle)" }}>
                        {children}
                      </code>
                    );
                  }
                  return <code className="px-1.5 py-0.5 rounded text-[13px]" style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", color: "#fbbf24" }}>{children}</code>;
                },
                pre: ({ children }) => <pre className="mb-4 rounded-lg overflow-hidden">{children}</pre>,
                ul: ({ children }) => <ul className="list-disc ml-5 mb-3 space-y-1" style={{ color: "rgba(255, 255, 255, 0.85)" }}>{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-5 mb-3 space-y-1" style={{ color: "rgba(255, 255, 255, 0.85)" }}>{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                blockquote: ({ children }) => <blockquote className="border-l-2 pl-4 my-3" style={{ borderColor: "var(--accent-blue)", color: "rgba(255, 255, 255, 0.7)" }}>{children}</blockquote>,
                hr: () => <hr className="my-6" style={{ borderColor: "var(--border-subtle)" }} />,
                a: ({ href, children }) => <a href={href} className="underline" style={{ color: "var(--accent-blue)" }}>{children}</a>,
                table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>{children}</table></div>,
                thead: ({ children }) => <thead style={{ borderBottom: "2px solid var(--border-medium)" }}>{children}</thead>,
                th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{children}</th>,
                td: ({ children }) => <td className="px-3 py-2 text-sm" style={{ color: "rgba(255, 255, 255, 0.8)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</td>,
              }}
            >
              {expandedDoc.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );

  // Quote comment modal (overlays the doc viewer)
  const quoteModal = quoteModalText && (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-medium)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: "var(--accent-blue)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Comment on Quote
            </span>
          </div>
          <button
            onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Quoted text */}
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
              {expandedDoc
                ? expandedDoc.type === "research"
                  ? `Research Document v${expandedDoc.version}`
                  : `Implementation Plan v${expandedDoc.version}`
                : "Document"}
            </div>
            <div
              className="border-l-2 pl-3 py-2 text-sm leading-relaxed rounded-r"
              style={{
                borderColor: "var(--accent-blue)",
                backgroundColor: "rgba(59, 130, 246, 0.06)",
                color: "rgba(255, 255, 255, 0.75)",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {quoteModalText.length > 500 ? quoteModalText.slice(0, 500) + "..." : quoteModalText}
            </div>
          </div>

          {/* Comment textarea */}
          <textarea
            autoFocus
            value={quoteComment}
            onChange={(e) => setQuoteComment(e.target.value)}
            placeholder="Add your comment..."
            className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none"
            style={{
              backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
              minHeight: "80px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handlePostQuoteComment();
              }
            }}
          />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to post
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePostQuoteComment}
                disabled={postingQuote || !quoteComment.trim()}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}
              >
                {postingQuote ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modal}
      {lightbox}
      {docViewer}
      {quoteModal}
    </>,
    document.body
  );
}
