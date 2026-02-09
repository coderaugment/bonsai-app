"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Ticket, TicketType, TicketState, Comment, CommentAttachment, TicketDocument, TicketAttachment, Persona } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";

interface TicketDetailModalProps {
  ticket: Ticket | null;
  initialDocType?: "research" | "implementation_plan";
  projectId?: string;
  onClose: () => void;
  onDelete?: (ticketId: string) => void;
}

const typeOptions: TicketType[] = ["feature", "bug", "chore"];
const stateOptions: TicketState[] = ["research", "plan", "build", "test", "ship"];

export function TicketDetailModal({ ticket, initialDocType, projectId, onClose, onDelete }: TicketDetailModalProps) {
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
  const [state, setState] = useState<TicketState>("plan");

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

  // @mention autocomplete state
  const [personasList, setPersonasList] = useState<Persona[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);

  // Dispatch debounce: accumulate comments, send one dispatch after a pause
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDispatchContent = useRef<string[]>([]);

  // Typing indicator: shows agent avatar + animated dots while waiting for response
  const [typingPersona, setTypingPersona] = useState<{ name: string; color?: string; avatarUrl?: string } | null>(null);
  const [docTypingPersona, setDocTypingPersona] = useState<{ name: string; color?: string; avatarUrl?: string } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<TicketDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [approvingResearch, setApprovingResearch] = useState(false);
  const [approvingPlan, setApprovingPlan] = useState(false);

  // Description cleanup state
  const [enhancingDescription, setEnhancingDescription] = useState(false);
  const descOnFocusRef = useRef<string>("");

  // Local lifecycle state (from ticket prop, refreshed after actions)
  const [researchApprovedAt, setResearchApprovedAt] = useState<string | undefined>();
  const [planApprovedAt, setPlanApprovedAt] = useState<string | undefined>();
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  // Audit log state
  const [auditLog, setAuditLog] = useState<Array<{
    id: number;
    ticketId: string;
    event: string;
    actorType: string;
    actorId: string | null;
    actorName: string;
    detail: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Full-screen document viewer
  const [expandedDoc, setExpandedDoc] = useState<TicketDocument | null>(null);
  // Version selector for expanded doc viewer
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

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

  // Document-scoped comments state (separate from ticket-level comments)
  const [docComments, setDocComments] = useState<Comment[]>([]);
  const [newDocComment, setNewDocComment] = useState("");
  const [docCommentAttachments, setDocCommentAttachments] = useState<CommentAttachment[]>([]);
  const [loadingDocComments, setLoadingDocComments] = useState(false);
  const [postingDocComment, setPostingDocComment] = useState(false);
  const [dragOverDocComment, setDragOverDocComment] = useState(false);
  const docCommentsEndRef = useRef<HTMLDivElement>(null);
  const docCommentInputRef = useRef<HTMLTextAreaElement>(null);
  const docCommentFileInputRef = useRef<HTMLInputElement>(null);
  // Doc-comment @mention state
  const [docMentionQuery, setDocMentionQuery] = useState<string | null>(null);
  const [docMentionIndex, setDocMentionIndex] = useState(0);
  const [docMentionStart, setDocMentionStart] = useState(0);

  // Baseline values for dirty-checking (description baseline updates after AI enhancement)
  const baselineRef = useRef({ title: "", description: "", acceptanceCriteria: "", type: "" as TicketType, state: "" as TicketState });
  const hasChanges = ticket ? (
    title !== baselineRef.current.title ||
    description !== baselineRef.current.description ||
    acceptanceCriteria !== baselineRef.current.acceptanceCriteria ||
    type !== baselineRef.current.type ||
    state !== baselineRef.current.state
  ) : false;

  // Initialize form when a *different* ticket is opened (by ID, not reference)
  const ticketId = ticket?.id;
  useEffect(() => {
    if (ticket && ticketId) {
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      setAcceptanceCriteria(ticket.acceptanceCriteria || "");
      setType(ticket.type);
      setState(ticket.state);
      baselineRef.current = {
        title: ticket.title,
        description: ticket.description || "",
        acceptanceCriteria: ticket.acceptanceCriteria || "",
        type: ticket.type,
        state: ticket.state,
      };
      setResearchApprovedAt(ticket.researchApprovedAt);
      setPlanApprovedAt(ticket.planApprovedAt);
      loadComments(ticket.id);
      loadDocuments(ticket.id, initialDocType);
      loadAttachments(ticket.id);
      loadPersonas();

      // Clear any pending dispatch from previous ticket
      if (dispatchTimerRef.current) {
        clearTimeout(dispatchTimerRef.current);
        dispatchTimerRef.current = null;
      }
      pendingDispatchContent.current = [];

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
            setTypingPersona(null); // Agent responded — clear typing indicator
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            return fresh;
          }
          return prev;
        });
      } catch { /* skip cycle */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [ticketId]);

  // Poll documents every 10s while modal is open
  useEffect(() => {
    if (!ticketId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/documents`);
        const data = await res.json();
        const fresh: TicketDocument[] = data.documents || [];
        setDocuments((prev) => {
          // Only update if something changed (new docs or version bumps)
          const prevKey = prev.map((d) => `${d.type}:${d.version}`).join(",");
          const freshKey = fresh.map((d) => `${d.type}:${d.version}`).join(",");
          if (prevKey === freshKey) return prev;
          return fresh;
        });
        // If user is viewing a doc, update to latest version of that type
        setExpandedDoc((prev) => {
          if (!prev) return null;
          const latest = fresh
            .filter((d) => d.type === prev.type)
            .sort((a, b) => (b.version || 0) - (a.version || 0))[0];
          if (latest && latest.version !== prev.version) return latest;
          return prev;
        });
      } catch { /* skip cycle */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [ticketId]);

  // Poll audit log every 15s when activity panel is open
  useEffect(() => {
    if (!ticketId || !showActivity) return;
    loadAuditLog(ticketId);
    const poll = setInterval(() => {
      fetch(`/api/tickets/${ticketId}/audit`)
        .then((r) => r.json())
        .then((data) => setAuditLog(data.audit || []))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(poll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, showActivity]);

  // Load doc comments when expandedDoc changes
  const expandedDocId = expandedDoc?.id;
  useEffect(() => {
    if (expandedDocId) {
      loadDocComments(expandedDocId);
    } else {
      setDocComments([]);
      setNewDocComment("");
      setDocCommentAttachments([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDocId]);

  // Poll doc comments every 10s while doc viewer is open
  useEffect(() => {
    if (!ticketId || !expandedDocId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/comments?ticketId=${ticketId}&documentId=${expandedDocId}`);
        const data = await res.json();
        const fresh = data.comments || [];
        setDocComments((prev) => {
          if (fresh.length !== prev.length) {
            setDocTypingPersona(null); // Agent responded — clear typing indicator
            setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            return fresh;
          }
          return prev;
        });
      } catch { /* skip cycle */ }
    }, 10_000);
    return () => clearInterval(poll);
  }, [ticketId, expandedDocId]);

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

  async function loadDocuments(ticketId: string, autoExpandType?: "research" | "implementation_plan") {
    setLoadingDocuments(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/documents`);
      const data = await res.json();
      const docs = data.documents || [];
      setDocuments(docs);
      if (autoExpandType) {
        // Pick the latest version of the requested type
        const matchingDocs = docs
          .filter((d: TicketDocument) => d.type === autoExpandType)
          .sort((a: TicketDocument, b: TicketDocument) => (b.version || 0) - (a.version || 0));
        if (matchingDocs.length > 0) {
          setExpandedDoc(matchingDocs[0]);
          setSelectedVersion(null);
        }
      }
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

  async function loadAuditLog(ticketId: string) {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/audit`);
      const data = await res.json();
      setAuditLog(data.audit || []);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function loadPersonas() {
    try {
      const url = projectId ? `/api/personas?projectId=${projectId}` : "/api/personas";
      const res = await fetch(url);
      const data = await res.json();
      setPersonasList(Array.isArray(data) ? data : []);
    } catch {
      // non-critical — autocomplete just won't work
    }
  }

  // ── Version helpers ─────────────────────────────
  const researchDocs = documents
    .filter(d => d.type === "research")
    .sort((a, b) => (b.version || 0) - (a.version || 0));
  const latestResearchDoc = researchDocs[0] || null;
  const maxResearchVersion = latestResearchDoc?.version || 0;

  // Workflow state badge
  function getResearchWorkflowState(): { label: string; color: string } {
    if (researchApprovedAt) return { label: "Approved", color: "#22c55e" };
    if (maxResearchVersion >= 3) return { label: "Awaiting Approval", color: "#f59e0b" };
    if (maxResearchVersion === 2) return { label: "Researcher Finalizing", color: "#8b5cf6" };
    if (maxResearchVersion === 1) return { label: "Critic Reviewing", color: "#ef4444" };
    if (ticket?.researchCompletedBy || documents.some(d => d.type === "research")) return { label: "Researching", color: "#3b82f6" };
    return { label: "Not Started", color: "var(--text-muted)" };
  }

  // Get the doc to display in expanded view (respects version selector)
  function getExpandedResearchDoc(): TicketDocument | null {
    if (!expandedDoc || expandedDoc.type !== "research") return expandedDoc;
    if (selectedVersion !== null) {
      return researchDocs.find(d => d.version === selectedVersion) || expandedDoc;
    }
    return expandedDoc;
  }

  async function enhanceDescription() {
    console.log("[enhanceDescription] called, description length:", description.trim().length);
    if (!description.trim()) {
      console.log("[enhanceDescription] skipped — empty description");
      return;
    }
    setEnhancingDescription(true);
    try {
      console.log("[enhanceDescription] calling /api/generate-title with field=enhance");
      const res = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), field: "enhance" }),
      });
      const data = await res.json();
      console.log("[enhanceDescription] response:", JSON.stringify(data).slice(0, 200));
      if (data.enhance) {
        console.log("[enhanceDescription] updating description");
        setDescription(data.enhance);
        // Enhanced description becomes the new baseline — don't count AI enhancement as a user change
        baselineRef.current.description = data.enhance;
      } else {
        console.log("[enhanceDescription] no response from API");
      }
    } catch (err) {
      console.error("[enhanceDescription] error:", err);
    } finally {
      setEnhancingDescription(false);
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

  async function handleDeleteDocument(docType: "research" | "implementation_plan") {
    if (!ticket) return;
    setDeletingDoc(docType);
    try {
      await fetch(`/api/tickets/${ticket.id}/documents?type=${docType}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.type !== docType));
      if (docType === "research") setResearchApprovedAt(undefined);
      if (docType === "implementation_plan") setPlanApprovedAt(undefined);
      if (expandedDoc?.type === docType) setExpandedDoc(null);
      router.refresh();
    } finally {
      setDeletingDoc(null);
    }
  }

  // Accept ticket (test → ship)
  const [accepting, setAccepting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  async function handleAcceptTicket() {
    if (!ticket) return;
    setAccepting(true);
    try {
      // Ship endpoint merges worktree branch into main, cleans up, and sets state
      await fetch(`/api/tickets/${ticket.id}/ship`, { method: "POST" });
      router.refresh();
      onClose();
    } finally {
      setAccepting(false);
    }
  }

  async function handlePreview() {
    if (!ticket) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/preview`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        // Small delay to let server start if freshly spawned
        if (!data.alreadyRunning) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        window.open(data.url, "_blank");
      }
    } finally {
      setPreviewing(false);
    }
  }

  // @mention autocomplete: compute filtered personas from mentionQuery
  // Also support @role mentions (e.g., @designer, @lead, @researcher)
  const ROLE_SLUGS = ["lead", "designer", "developer", "critic", "researcher", "hacker"];
  const filteredPersonas = mentionQuery !== null
    ? (() => {
        const q = mentionQuery.toLowerCase();
        const byName = personasList.filter((p) =>
          p.name.toLowerCase().startsWith(q)
        );
        // Add role-matched personas (when query matches a role slug)
        const byRole = ROLE_SLUGS
          .filter((r) => r.startsWith(q) && q.length > 0)
          .flatMap((r) => personasList.filter((p) => p.role === r))
          .filter((p) => !byName.some((n) => n.id === p.id));
        return [...byName, ...byRole].slice(0, 6);
      })()
    : [];

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNewComment(val);

    // Detect @mention trigger
    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(pos - atMatch[0].length);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(persona: Persona) {
    const before = newComment.slice(0, mentionStart);
    const after = newComment.slice(
      mentionStart + 1 + (mentionQuery?.length || 0)
    );
    const inserted = `${before}@${persona.name} ${after}`;
    setNewComment(inserted);
    setMentionQuery(null);

    // Refocus and set cursor after the inserted mention
    setTimeout(() => {
      const ta = commentInputRef.current;
      if (ta) {
        ta.focus();
        const cursorPos = before.length + 1 + persona.name.length + 1;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // @mention navigation
    if (mentionQuery !== null && filteredPersonas.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredPersonas.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredPersonas.length) % filteredPersonas.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredPersonas[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Cmd/Ctrl+Enter to post
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePostComment();
    }
  }

  // Extract first @mentioned persona name from comment text
  // Supports both @Name and @role (e.g., @designer, @lead, @researcher)
  function extractMentionedPersona(text: string): { name?: string; role?: string } {
    const lower = text.toLowerCase();
    // Check persona names first (sort by length desc so longer names match first)
    const sorted = [...personasList].sort((a, b) => b.name.length - a.name.length);
    for (const p of sorted) {
      if (lower.includes(`@${p.name.toLowerCase()}`)) return { name: p.name };
    }
    // Check role slugs
    for (const role of ROLE_SLUGS) {
      if (lower.includes(`@${role}`)) return { role };
    }
    return {};
  }

  // Debounced dispatch: batches multiple rapid comments into a single agent dispatch
  function queueDispatch(commentContent: string, opts?: { conversational?: boolean; documentId?: number; isDocComment?: boolean; targetPersonaId?: string }) {
    if (!ticket) return;
    const tid = ticket.id;
    pendingDispatchContent.current.push(commentContent);

    if (dispatchTimerRef.current) {
      clearTimeout(dispatchTimerRef.current);
    }

    dispatchTimerRef.current = setTimeout(async () => {
      const batch = pendingDispatchContent.current.splice(0);
      if (batch.length === 0) return;
      const combined = batch.join("\n\n---\n\n");
      const mention = extractMentionedPersona(combined);

      // Server-side cooldown (2min) prevents duplicate dispatches.
      // Don't gate on typingPersona here — agent may be stuck/dead.

      try {
        const dispatchRes = await fetch(`/api/tickets/${tid}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentContent: combined, targetPersonaName: mention.name, targetRole: mention.role, targetPersonaId: opts?.targetPersonaId, conversational: opts?.conversational, documentId: opts?.documentId, silent: true }),
        });
        const dispatchData = await dispatchRes.json();
        if (dispatchData.persona) {
          const persona = {
            name: dispatchData.persona.name,
            color: dispatchData.persona.color,
            avatarUrl: dispatchData.persona.avatarUrl,
          };
          if (opts?.isDocComment) {
            setDocTypingPersona(persona);
            if (docTypingTimeoutRef.current) clearTimeout(docTypingTimeoutRef.current);
            docTypingTimeoutRef.current = setTimeout(() => setDocTypingPersona(null), 120_000);
            setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          } else {
            setTypingPersona(persona);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setTypingPersona(null), 120_000);
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }
        }
      } catch {
        // dispatch failed silently
      }
    }, 3000); // 3s debounce — wait for rapid-fire comments to settle
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
        const commentText = newComment;
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
        setCommentAttachments([]);
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        queueDispatch(commentText);
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
    const activeDoc = expandedDoc?.type === "research" ? getExpandedResearchDoc() : expandedDoc;
    const docLabel = activeDoc
      ? activeDoc.type === "research"
        ? `Research Document v${activeDoc.version}`
        : `Implementation Plan v${activeDoc.version}`
      : "Document";
    const quotedLines = quoteModalText.split("\n").map((l) => `> ${l}`).join("\n");
    const content = `${quotedLines}\n\n_(from ${docLabel})_\n\n${quoteComment}`;
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          content,
          documentId: expandedDoc?.id,
        }),
      });
      const data = await res.json();
      if (data.comment) {
        // Post to doc comments sidebar (keep doc viewer open)
        setDocComments((prev) => [...prev, data.comment]);
        setQuoteModalText(null);
        setQuoteComment("");
        setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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
    commentInputRef.current?.focus();
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

  // ── Document-scoped comment handlers ──────────────

  async function loadDocComments(documentId: number) {
    if (!ticket) return;
    setLoadingDocComments(true);
    try {
      const res = await fetch(`/api/comments?ticketId=${ticket.id}&documentId=${documentId}`);
      const data = await res.json();
      setDocComments(data.comments || []);
      setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } finally {
      setLoadingDocComments(false);
    }
  }

  async function handlePostDocComment() {
    if (!ticket || !expandedDoc || (!newDocComment.trim() && docCommentAttachments.length === 0)) return;
    setPostingDocComment(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          content: newDocComment,
          attachments: docCommentAttachments.length > 0 ? docCommentAttachments : undefined,
          documentId: expandedDoc.id,
        }),
      });
      const data = await res.json();
      if (data.comment) {
        const commentText = newDocComment;
        setDocComments((prev) => [...prev, data.comment]);
        setNewDocComment("");
        setDocCommentAttachments([]);
        setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        // Dispatch agent — conversational mode so they reply in the doc comment thread
        const docLabel = expandedDoc.type === "research" ? "research document" : "implementation plan";
        queueDispatch(`[Comment on ${docLabel}] ${commentText}`, {
          conversational: true,
          documentId: expandedDoc.id,
          isDocComment: true,
          targetPersonaId: expandedDoc.authorPersonaId,
        });
      }
    } finally {
      setPostingDocComment(false);
    }
  }

  // Doc-comment @mention filtered list (also supports @role)
  const docFilteredPersonas = docMentionQuery !== null
    ? (() => {
        const q = docMentionQuery.toLowerCase();
        const byName = personasList.filter((p) =>
          p.name.toLowerCase().startsWith(q)
        );
        const byRole = ROLE_SLUGS
          .filter((r) => r.startsWith(q) && q.length > 0)
          .flatMap((r) => personasList.filter((p) => p.role === r))
          .filter((p) => !byName.some((n) => n.id === p.id));
        return [...byName, ...byRole].slice(0, 6);
      })()
    : [];

  function handleDocCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNewDocComment(val);
    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setDocMentionQuery(atMatch[1]);
      setDocMentionStart(pos - atMatch[0].length);
      setDocMentionIndex(0);
    } else {
      setDocMentionQuery(null);
    }
  }

  function insertDocMention(persona: Persona) {
    const before = newDocComment.slice(0, docMentionStart);
    const after = newDocComment.slice(docMentionStart + 1 + (docMentionQuery?.length || 0));
    const inserted = `${before}@${persona.name} ${after}`;
    setNewDocComment(inserted);
    setDocMentionQuery(null);
    setTimeout(() => {
      const ta = docCommentInputRef.current;
      if (ta) {
        ta.focus();
        const cursorPos = before.length + 1 + persona.name.length + 1;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  }

  function handleDocCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (docMentionQuery !== null && docFilteredPersonas.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDocMentionIndex((i) => (i + 1) % docFilteredPersonas.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDocMentionIndex((i) => (i - 1 + docFilteredPersonas.length) % docFilteredPersonas.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertDocMention(docFilteredPersonas[docMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setDocMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePostDocComment();
    }
  }

  function handleDocCommentFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverDocComment(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    processDocCommentFiles(files);
    docCommentInputRef.current?.focus();
  }

  function handleDocCommentFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    processDocCommentFiles(files);
    if (docCommentFileInputRef.current) docCommentFileInputRef.current.value = "";
  }

  function processDocCommentFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setDocCommentAttachments((prev) => [...prev, { name: file.name, type: file.type, data }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeDocCommentAttachment(index: number) {
    setDocCommentAttachments((prev) => prev.filter((_, i) => i !== index));
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
                  onFocus={() => { descOnFocusRef.current = description; }}
                  onBlur={() => { if (description !== descOnFocusRef.current) enhanceDescription(); }}
                  rows={10}
                  disabled={descVoice.isProcessingAI || enhancingDescription}
                  className="w-full rounded-xl p-5 text-[15px] leading-relaxed resize-y min-h-[220px]"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={descVoice.isRecording ? descVoice.interimTranscript || "Listening..." : "Describe what needs to be done..."}
                />
                {enhancingDescription && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(15, 15, 26, 0.85)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Cleaning up description...
                    </div>
                  </div>
                )}
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
                  {/* Research Document (versioned) */}
                  {(ticket?.researchCompletedAt || researchDocs.length > 0) && (() => {
                    const workflowState = getResearchWorkflowState();
                    return (
                      <div
                        className="rounded-xl p-5"
                        style={{
                          backgroundColor: researchApprovedAt ? "rgba(34, 197, 94, 0.08)" : `rgba(${workflowState.color === "#ef4444" ? "239, 68, 68" : workflowState.color === "#8b5cf6" ? "139, 92, 246" : "245, 158, 11"}, 0.08)`,
                          border: `1px solid ${researchApprovedAt ? "rgba(34, 197, 94, 0.3)" : `color-mix(in srgb, ${workflowState.color} 30%, transparent)`}`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" style={{ color: workflowState.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                              Research
                            </span>
                            {maxResearchVersion > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                                v{maxResearchVersion} ({researchDocs.length} version{researchDocs.length !== 1 ? "s" : ""})
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${workflowState.color} 20%, transparent)`, color: workflowState.color }}>
                              {workflowState.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {latestResearchDoc?.content && (
                              <button
                                onClick={() => { setExpandedDoc(latestResearchDoc); setSelectedVersion(null); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                              >
                                View Full
                              </button>
                            )}
                            {!researchApprovedAt && maxResearchVersion >= 3 && (
                              <button
                                onClick={handleApproveResearch}
                                disabled={approvingResearch}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                                style={{ backgroundColor: "#22c55e", color: "#fff", opacity: approvingResearch ? 0.5 : 1 }}
                              >
                                {approvingResearch ? "Approving..." : "Approve"}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteDocument("research")}
                              disabled={deletingDoc === "research"}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/15"
                              style={{ color: "var(--text-muted)" }}
                              title="Delete all research versions — agents will re-research"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {latestResearchDoc?.content && (
                          <div
                            className="text-sm leading-relaxed max-h-[120px] overflow-hidden relative cursor-pointer"
                            style={{ color: "rgba(255, 255, 255, 0.8)" }}
                            onClick={() => { setExpandedDoc(latestResearchDoc); setSelectedVersion(null); }}
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
                                {latestResearchDoc.content}
                              </ReactMarkdown>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-10" style={{ background: `linear-gradient(transparent, rgba(15, 15, 26, 0.95))` }} />
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
                            <button
                              onClick={() => handleDeleteDocument("implementation_plan")}
                              disabled={deletingDoc === "implementation_plan"}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/15"
                              style={{ color: "var(--text-muted)" }}
                              title="Delete plan — agents will re-plan"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
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

            {/* Activity Timeline */}
            <div>
              <button
                type="button"
                onClick={() => setShowActivity(!showActivity)}
                className="flex items-center gap-2 text-sm font-semibold mb-3 transition-colors hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
              >
                <svg
                  className="w-4 h-4 transition-transform"
                  style={{ transform: showActivity ? "rotate(90deg)" : "rotate(0deg)" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Activity
                {auditLog.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--text-muted)" }}>
                    {auditLog.length}
                  </span>
                )}
              </button>

              {showActivity && (
                <div
                  className="rounded-xl p-4 max-h-[300px] overflow-y-auto"
                  style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}
                >
                  {loadingAudit ? (
                    <div className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>Loading activity...</div>
                  ) : auditLog.length === 0 ? (
                    <div className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No activity yet</div>
                  ) : (
                    <div className="relative" style={{ paddingLeft: "20px" }}>
                      {/* Timeline line */}
                      <div
                        className="absolute top-2 bottom-2"
                        style={{ left: "7px", width: "2px", backgroundColor: "var(--border-medium)" }}
                      />

                      {auditLog.map((entry, i) => {
                        const isAgent = entry.actorType === "agent";
                        const isSystem = entry.actorType === "system";
                        const dotColor = isAgent ? "#8b5cf6" : isSystem ? "var(--text-muted)" : "var(--accent-blue)";

                        // Format metadata inline
                        let metaStr = "";
                        if (entry.metadata) {
                          if (entry.metadata.from && entry.metadata.to) {
                            metaStr = `${entry.metadata.from} → ${entry.metadata.to}`;
                          } else if (entry.metadata.version) {
                            metaStr = `v${entry.metadata.version}`;
                          }
                        }

                        const timeStr = entry.createdAt
                          ? new Date(entry.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "";

                        return (
                          <div key={entry.id} className="relative mb-3 last:mb-0" style={{ paddingLeft: "12px" }}>
                            {/* Dot */}
                            <div
                              className="absolute rounded-full"
                              style={{
                                left: "-16.5px",
                                top: "6px",
                                width: "9px",
                                height: "9px",
                                backgroundColor: dotColor,
                                border: "2px solid rgba(15, 15, 26, 1)",
                              }}
                            />
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                                {timeStr}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  backgroundColor: isAgent ? "rgba(139, 92, 246, 0.15)" : isSystem ? "rgba(255,255,255,0.05)" : "rgba(59, 130, 246, 0.15)",
                                  color: isAgent ? "#a78bfa" : isSystem ? "var(--text-muted)" : "#93c5fd",
                                }}
                              >
                                {entry.actorName}
                              </span>
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              {entry.detail}
                              {metaStr && (
                                <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  {metaStr}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

          {/* Build state preview bar */}
          {ticket.state === "build" && (
            <div
              className="mx-8 mb-4 rounded-xl p-5 flex items-center justify-between"
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" style={{ color: "#818cf8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Building
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Preview the work in progress
                </span>
              </div>
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "#818cf8",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  opacity: previewing ? 0.5 : 1,
                }}
              >
                {previewing ? "Starting..." : "Preview"}
              </button>
            </div>
          )}

          {/* Test state action bar */}
          {ticket.state === "test" && (
            <div
              className="mx-8 mb-4 rounded-xl p-5 flex items-center justify-between"
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" style={{ color: "#818cf8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Ready for review
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Preview the work, then accept to ship
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePreview}
                  disabled={previewing}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: "rgba(99, 102, 241, 0.15)",
                    color: "#818cf8",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    opacity: previewing ? 0.5 : 1,
                  }}
                >
                  {previewing ? "Starting..." : "Preview"}
                </button>
                <button
                  onClick={handleAcceptTicket}
                  disabled={accepting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: "#22c55e",
                    color: "#fff",
                    opacity: accepting ? 0.5 : 1,
                  }}
                >
                  {accepting ? "Accepting..." : "Accept & Ship"}
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 px-8 py-5 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !hasChanges}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: saving || !title.trim() || !hasChanges ? 0.5 : 1 }}
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
                comment.authorType === "system" ? (
                  <div key={comment.id} className="flex items-center gap-2 py-1.5 px-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                          strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-secondary)" }}>{children}</strong>,
                        }}
                      >
                        {comment.content}
                      </ReactMarkdown>
                    </span>
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>
                ) : (
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
                        comment.authorType === "agent" ? (
                          <div className="text-sm leading-relaxed comment-markdown" style={{ color: "rgba(255,255,255,0.8)" }}>
                            <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5" style={{ color: "#fff" }}>{children}</h1>,
                                h2: ({ children }) => <h2 className="text-[15px] font-bold mt-2.5 mb-1" style={{ color: "#fff" }}>{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</h3>,
                                p: ({ children }) => <p className="mb-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</strong>,
                                em: ({ children }) => <em style={{ color: "rgba(255,255,255,0.65)" }}>{children}</em>,
                                code: ({ children, className }) => {
                                  const isBlock = className?.includes("language-");
                                  if (isBlock) {
                                    return <code className={`block whitespace-pre overflow-x-auto rounded-lg p-3 text-xs leading-relaxed ${className || ""}`} style={{ backgroundColor: "rgba(0,0,0,0.4)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)" }}>{children}</code>;
                                  }
                                  return <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fbbf24" }}>{children}</code>;
                                },
                                pre: ({ children }) => <pre className="mb-2 rounded-lg overflow-hidden">{children}</pre>,
                                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 my-2" style={{ borderColor: "rgba(99,102,241,0.5)", color: "rgba(255,255,255,0.65)" }}>{children}</blockquote>,
                                hr: () => <hr className="my-3" style={{ borderColor: "rgba(255,255,255,0.06)" }} />,
                                a: ({ href, children }) => <a href={href} className="underline" style={{ color: "#818cf8" }}>{children}</a>,
                              }}
                            >
                              {comment.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div
                            className="text-sm leading-relaxed whitespace-pre-wrap"
                            style={{ color: "rgba(255,255,255,0.8)" }}
                          >
                            {comment.content}
                          </div>
                        )
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
                )
              ))
            )}
            {/* Typing indicator */}
            {typingPersona && (
              <div className="group">
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: typingPersona.color || "var(--accent-indigo)" }}
                  >
                    {typingPersona.avatarUrl ? (
                      <img src={typingPersona.avatarUrl} alt={typingPersona.name} className="w-full h-full object-cover" />
                    ) : (
                      typingPersona.name?.[0]?.toUpperCase() || "A"
                    )}
                  </div>
                  <div className="flex items-center gap-1 py-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{typingPersona.name}</span>
                    <span className="flex gap-0.5 ml-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: "var(--text-muted)",
                            animation: `typing-dot 1.4s infinite ${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </span>
                    <style>{`
                      @keyframes typing-dot {
                        0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
                        30% { opacity: 1; transform: translateY(-3px); }
                      }
                    `}</style>
                  </div>
                </div>
              </div>
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
              <div className="relative">
                <textarea
                  ref={commentInputRef}
                  value={newComment}
                  onChange={handleCommentChange}
                  placeholder={commentVoice.isRecording ? commentVoice.interimTranscript || "Listening..." : "Write a comment… use @ to mention a persona"}
                  rows={3}
                  disabled={commentVoice.isProcessingAI}
                  className="w-full p-4 text-sm resize-none bg-transparent"
                  style={{ color: "var(--text-primary)", outline: "none" }}
                  onKeyDown={handleCommentKeyDown}
                />
                {/* @mention autocomplete dropdown */}
                {mentionQuery !== null && filteredPersonas.length > 0 && (
                  <div
                    className="absolute left-4 bottom-full mb-1 rounded-lg shadow-xl overflow-hidden"
                    style={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid var(--border-medium)",
                      minWidth: "200px",
                      zIndex: 10,
                    }}
                  >
                    {filteredPersonas.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: i === mentionIndex ? "rgba(255,255,255,0.08)" : "transparent",
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep textarea focus
                          insertMention(p);
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 overflow-hidden"
                          style={{ backgroundColor: p.color || "var(--accent-indigo)" }}
                        >
                          {p.avatar ? (
                            <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            p.name[0]?.toUpperCase()
                          )}
                        </div>
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                        {p.role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
                            {p.role}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

  // Full-screen document viewer — use version-aware doc for research
  const displayDoc = expandedDoc?.type === "research" ? getExpandedResearchDoc() : expandedDoc;
  const docViewer = expandedDoc && displayDoc && (
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
          {/* Version selector for research docs with multiple versions */}
          {expandedDoc.type === "research" && researchDocs.length > 1 ? (
            <select
              value={selectedVersion ?? displayDoc.version}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              className="px-2 py-1 rounded text-xs font-mono cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", border: "1px solid var(--border-medium)", outline: "none" }}
            >
              {researchDocs.map(d => (
                <option key={d.version} value={d.version} style={{ backgroundColor: "#1a1a2e" }}>
                  v{d.version} — {d.version === 1 ? "Initial Research" : d.version === 2 ? "Critic Review" : "Final Revision"}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              v{displayDoc.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {expandedDoc.type === "research" && !researchApprovedAt && maxResearchVersion >= 3 && (
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
            onClick={() => handleDeleteDocument(expandedDoc.type as "research" | "implementation_plan")}
            disabled={!!deletingDoc}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-500/15"
            style={{ color: "#ef4444" }}
            title={`Delete ${expandedDoc.type === "research" ? "research" : "plan"} — agents will redo`}
          >
            {deletingDoc ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => { setExpandedDoc(null); setSelectedVersion(null); }}
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

      {/* Content row: document body + comments sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Document body — scrollable rendered markdown */}
        <div
          ref={docBodyRef}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "#0d0d14" }}
          onMouseUp={handleDocMouseUp}
          onMouseDown={handleDocMouseDown}
        >
          <div className="max-w-[780px] mx-auto px-12 py-14">
            {/* Document title */}
            <div className="mb-10">
              <h1 className="text-[28px] font-bold tracking-tight leading-tight" style={{ color: "#fff" }}>
                {expandedDoc.type === "research" ? "Research Document" : "Implementation Plan"}
              </h1>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
                  v{displayDoc.version}
                </span>
                {displayDoc.authorPersonaId && personasList.find(p => p.id === displayDoc.authorPersonaId) && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    by {personasList.find(p => p.id === displayDoc.authorPersonaId)?.name}
                  </span>
                )}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatTime(displayDoc.updatedAt || displayDoc.createdAt)}
                </span>
              </div>
              <div className="mt-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }} />
            </div>

            {/* Rendered markdown body */}
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-[24px] font-bold mt-12 mb-5 pb-3" style={{ color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-[20px] font-bold mt-10 mb-4" style={{ color: "#fff" }}>{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[17px] font-semibold mt-8 mb-3" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-[15px] font-semibold mt-6 mb-2" style={{ color: "rgba(255,255,255,0.85)" }}>{children}</h4>
                  ),
                  p: ({ children }) => (
                    <p className="mb-4 text-[15px] leading-[1.75]" style={{ color: "rgba(255,255,255,0.78)" }}>{children}</p>
                  ),
                  strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</strong>,
                  em: ({ children }) => <em style={{ color: "rgba(255,255,255,0.65)" }}>{children}</em>,
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return (
                        <code
                          className={`block whitespace-pre overflow-x-auto rounded-xl p-5 text-[13px] leading-[1.7] font-mono ${className || ""}`}
                          style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded text-[13px] font-mono"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fbbf24" }}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <pre className="mb-5 rounded-xl overflow-hidden">{children}</pre>,
                  ul: ({ children }) => (
                    <ul className="list-disc ml-6 mb-4 space-y-1.5 text-[15px]" style={{ color: "rgba(255,255,255,0.78)" }}>{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal ml-6 mb-4 space-y-1.5 text-[15px]" style={{ color: "rgba(255,255,255,0.78)" }}>{children}</ol>
                  ),
                  li: ({ children }) => <li className="leading-[1.7] pl-1">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote
                      className="border-l-[3px] pl-5 py-1 my-5 rounded-r-lg"
                      style={{ borderColor: "rgba(99,102,241,0.6)", backgroundColor: "rgba(99,102,241,0.05)", color: "rgba(255,255,255,0.7)" }}
                    >
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-8" style={{ borderColor: "rgba(255,255,255,0.06)" }} />,
                  a: ({ href, children }) => (
                    <a href={href} className="underline decoration-1 underline-offset-2 transition-colors hover:text-white" style={{ color: "#818cf8" }}>{children}</a>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-5 rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{children}</thead>,
                  th: ({ children }) => (
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-3 text-sm" style={{ color: "rgba(255,255,255,0.78)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{children}</td>
                  ),
                }}
              >
                {displayDoc.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Document comments sidebar */}
        <div
          className="w-[420px] flex flex-col h-full flex-shrink-0 border-l"
          style={{ backgroundColor: "#0a0a12", borderColor: "var(--border-subtle)" }}
        >
          {/* Doc comments header */}
          <div className="px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Document Comments {docComments.length > 0 && <span style={{ color: "var(--text-muted)" }}>({docComments.length})</span>}
            </h3>
          </div>

          {/* Doc comments list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loadingDocComments ? (
              <div className="flex items-center justify-center py-12" style={{ color: "var(--text-muted)" }}>
                <span className="text-sm">Loading comments...</span>
              </div>
            ) : docComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: "var(--text-muted)" }}>
                <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm">No comments yet</span>
                <span className="text-xs mt-1 opacity-60">Comment on this document below</span>
              </div>
            ) : (
              docComments.map((comment) => (
                <div key={comment.id} className="group">
                  <div className="flex items-start gap-3">
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
                        comment.authorType === "agent" ? (
                          <div className="text-sm leading-relaxed comment-markdown" style={{ color: "rgba(255,255,255,0.8)" }}>
                            <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5" style={{ color: "#fff" }}>{children}</h1>,
                                h2: ({ children }) => <h2 className="text-[15px] font-bold mt-2.5 mb-1" style={{ color: "#fff" }}>{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</h3>,
                                p: ({ children }) => <p className="mb-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</strong>,
                                em: ({ children }) => <em style={{ color: "rgba(255,255,255,0.65)" }}>{children}</em>,
                                code: ({ children, className }) => {
                                  const isBlock = className?.includes("language-");
                                  if (isBlock) {
                                    return <code className={`block whitespace-pre overflow-x-auto rounded-lg p-3 text-xs leading-relaxed ${className || ""}`} style={{ backgroundColor: "rgba(0,0,0,0.4)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)" }}>{children}</code>;
                                  }
                                  return <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fbbf24" }}>{children}</code>;
                                },
                                pre: ({ children }) => <pre className="mb-2 rounded-lg overflow-hidden">{children}</pre>,
                                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 my-2" style={{ borderColor: "rgba(99,102,241,0.5)", color: "rgba(255,255,255,0.65)" }}>{children}</blockquote>,
                                hr: () => <hr className="my-3" style={{ borderColor: "rgba(255,255,255,0.06)" }} />,
                                a: ({ href, children }) => <a href={href} className="underline" style={{ color: "#818cf8" }}>{children}</a>,
                              }}
                            >
                              {comment.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div
                            className="text-sm leading-relaxed whitespace-pre-wrap"
                            style={{ color: "rgba(255,255,255,0.8)" }}
                          >
                            {comment.content}
                          </div>
                        )
                      )}
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
            {/* Doc typing indicator */}
            {docTypingPersona && (
              <div className="group px-2 py-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: docTypingPersona.color || "var(--accent-indigo)" }}
                  >
                    {docTypingPersona.avatarUrl ? (
                      <img src={docTypingPersona.avatarUrl} alt={docTypingPersona.name} className="w-full h-full object-cover" />
                    ) : (
                      docTypingPersona.name?.[0]?.toUpperCase() || "A"
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{docTypingPersona.name}</span>
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: "var(--text-muted)",
                          animation: `typing-dot 1.4s infinite ${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={docCommentsEndRef} />
          </div>

          {/* Doc comment input */}
          <div className="px-6 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              className="rounded-xl transition-colors"
              style={{
                backgroundColor: dragOverDocComment ? "rgba(91, 141, 249, 0.08)" : "var(--bg-input)",
                border: dragOverDocComment ? "1px dashed rgba(91, 141, 249, 0.5)" : "1px solid var(--border-medium)",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOverDocComment(true); }}
              onDragLeave={() => setDragOverDocComment(false)}
              onDrop={handleDocCommentFileDrop}
            >
              <div className="relative">
                <textarea
                  ref={docCommentInputRef}
                  value={newDocComment}
                  onChange={handleDocCommentChange}
                  placeholder="Comment on this document… @ to mention"
                  rows={3}
                  className="w-full p-4 text-sm resize-none bg-transparent"
                  style={{ color: "var(--text-primary)", outline: "none" }}
                  onKeyDown={handleDocCommentKeyDown}
                />
                {/* Doc @mention autocomplete dropdown */}
                {docMentionQuery !== null && docFilteredPersonas.length > 0 && (
                  <div
                    className="absolute left-4 bottom-full mb-1 rounded-lg shadow-xl overflow-hidden"
                    style={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid var(--border-medium)",
                      minWidth: "200px",
                      zIndex: 10,
                    }}
                  >
                    {docFilteredPersonas.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: i === docMentionIndex ? "rgba(255,255,255,0.08)" : "transparent",
                        }}
                        onMouseEnter={() => setDocMentionIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertDocMention(p);
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 overflow-hidden"
                          style={{ backgroundColor: p.color || "var(--accent-indigo)" }}
                        >
                          {p.avatar ? (
                            <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            p.name[0]?.toUpperCase()
                          )}
                        </div>
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                        {p.role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#a78bfa" }}>
                            {p.role}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Doc comment attachment previews */}
              {docCommentAttachments.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {docCommentAttachments.map((att, i) => (
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
                        onClick={() => removeDocCommentAttachment(i)}
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
                  onClick={() => docCommentFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  Attach
                </button>
                <input ref={docCommentFileInputRef} type="file" multiple onChange={handleDocCommentFileSelect} className="hidden" />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to send
                </span>
              </div>
              <button
                onClick={handlePostDocComment}
                disabled={postingDocComment || (!newDocComment.trim() && docCommentAttachments.length === 0)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--accent-blue)",
                  color: "#fff",
                  opacity: postingDocComment || (!newDocComment.trim() && docCommentAttachments.length === 0) ? 0.5 : 1,
                }}
              >
                {postingDocComment ? "Posting..." : "Post"}
              </button>
            </div>
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
              {displayDoc
                ? displayDoc.type === "research"
                  ? `Research Document v${displayDoc.version}`
                  : `Implementation Plan v${displayDoc.version}`
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
