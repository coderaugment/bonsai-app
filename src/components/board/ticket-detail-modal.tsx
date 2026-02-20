"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { formatTicketSlug } from "@/types";
import type { Ticket, TicketType, TicketState, Comment, CommentAttachment, TicketDocument, TicketAttachment, Persona } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";
import { CommentInput } from "@/components/board/comment-input";

interface TicketDetailModalProps {
  ticket: Ticket | null;
  initialDocType?: "research" | "implementation_plan";
  projectId?: string;
  onClose: () => void;
  onDelete?: (ticketId: number) => void;
}

const typeOptions: TicketType[] = ["feature", "bug", "chore"];
const stateOptions: TicketState[] = ["planning", "building", "preview", "test", "shipped"];

// Board state mentions — referenceable via #review, #planning, etc.
const BOARD_STATES = [
  { name: "planning", label: "Planning", color: "var(--column-planning)", icon: "📋" },
  { name: "building", label: "Building", color: "var(--column-building)", icon: "🔨" },
  { name: "review", label: "Review", color: "var(--column-review)", icon: "🔍" },
  { name: "shipped", label: "Shipped", color: "var(--column-shipped)", icon: "🚀" },
] as const;
// Render comment text with highlighted @mentions (personas + team) and #columns (board states)
function renderCommentContent(text: string, personas: Persona[]) {
  const parts = text.split(/([@#][\w\p{L}-]+)/gu);
  return parts.map((part, i) => {
    if (part.startsWith("@")) return renderMentionSpan(part, i, personas);
    if (part.startsWith("#")) return renderHashSpan(part, i);
    return part;
  });
}

function renderMentionSpan(part: string, key: number | string, personas: Persona[]) {
  const name = part.slice(1).toLowerCase();
  if (name === "team") {
    return (
      <span key={key} style={{
        backgroundColor: "color-mix(in srgb, #10b981 20%, transparent)",
        color: "#10b981",
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        👥 @team
      </span>
    );
  }
  const persona = personas.find((p) => p.name.toLowerCase() === name || p.role?.toLowerCase() === name);
  if (persona) {
    return (
      <span key={key} style={{
        backgroundColor: `color-mix(in srgb, ${persona.color || "#6366f1"} 20%, transparent)`,
        color: persona.color || "#a78bfa",
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        @{persona.name}
      </span>
    );
  }
  return part;
}

function renderHashSpan(part: string, key: number | string) {
  const name = part.slice(1).toLowerCase();
  const board = BOARD_STATES.find((b) => b.name === name);
  if (board) {
    return (
      <span key={key} style={{
        backgroundColor: `color-mix(in srgb, ${board.color} 20%, transparent)`,
        color: board.color,
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        {board.icon} #{board.label}
      </span>
    );
  }
  return part;
}

// Process React children recursively to highlight @mentions and #columns inside ReactMarkdown output
function highlightMentionsInChildren(children: React.ReactNode, personas: Persona[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = child.split(/([@#][\w\p{L}-]+)/gu);
      if (parts.length === 1) return child;
      return parts.map((part, i) => {
        if (part.startsWith("@")) return renderMentionSpan(part, `m${i}`, personas);
        if (part.startsWith("#")) return renderHashSpan(part, `h${i}`);
        return part;
      });
    }
    return child;
  });
}

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
  const [state, setState] = useState<TicketState>("planning");

  // Epic state
  const [isEpic, setIsEpic] = useState(false);
  const [epicChildren, setEpicChildren] = useState<Array<{ id: string; title: string; type: string; state: string }>>([]);
  const [showCreateChild, setShowCreateChild] = useState(false);
  const [newChildTitle, setNewChildTitle] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [processingAttachmentId, setProcessingAttachmentId] = useState<number | null>(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Personas list (for @mention autocomplete in CommentInput)
  const [personasList, setPersonasList] = useState<Persona[]>([]);

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

  // Live preview state
  const [viewMode, setViewMode] = useState<"info" | "preview">("info");
  const [project, setProject] = useState<{ buildCommand?: string; runCommand?: string; id?: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingPreview, setStartingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset viewMode to info when ticket leaves preview-allowed states
  useEffect(() => {
    if (ticket && ticket.state === "planning") {
      setViewMode("info");
    }
  }, [ticket?.state]);

  // Start preview server when switching to preview mode (in ticket's worktree)
  useEffect(() => {
    if (viewMode === "preview" && ticket && !previewUrl && !startingPreview && !previewError) {
      setStartingPreview(true);
      setPreviewError(null);
      fetch(`/api/tickets/${ticket.id}/start-preview`, { method: "POST" })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setPreviewError(data.error + (data.details ? `\n${data.details}` : ''));
            setStartingPreview(false);
          } else if (data.url) {
            const url = data.url.replace('0.0.0.0', 'localhost');

            // If server was just started (not already running), wait for it to be ready
            if (!data.alreadyRunning) {
              setTimeout(() => {
                setPreviewUrl(url);
                setStartingPreview(false);
              }, 3000);
            } else {
              setPreviewUrl(url);
              setStartingPreview(false);
            }
          } else {
            setStartingPreview(false);
          }
        })
        .catch(err => {
          console.error("Failed to start preview:", err);
          setPreviewError("Failed to start preview server");
          setStartingPreview(false);
        });
    }
  }, [viewMode, ticket, previewUrl, startingPreview, previewError]);

  // Description cleanup state
  const [enhancingDescription, setEnhancingDescription] = useState(false);
  const descOnFocusRef = useRef<string>("");

  // Local lifecycle state (from ticket prop, refreshed after actions)
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

  // Quote-to-comment state — popup uses refs (no re-render) to preserve selection
  const quotePopupRef = useRef<HTMLDivElement>(null);
  const quoteTextRef = useRef<string>("");
  const [quoteModalText, setQuoteModalText] = useState<string | null>(null);
  const [quoteComment, setQuoteComment] = useState("");
  const [postingQuote, setPostingQuote] = useState(false);
  const docBodyRef = useRef<HTMLDivElement>(null);

  // Document-scoped comments state (separate from ticket-level comments)
  const [docComments, setDocComments] = useState<Comment[]>([]);
  const [loadingDocComments, setLoadingDocComments] = useState(false);
  const docCommentsEndRef = useRef<HTMLDivElement>(null);

  // Baseline values for dirty-checking (description baseline updates after AI enhancement)
  const baselineRef = useRef({ title: "", description: "", acceptanceCriteria: "", type: "" as TicketType, state: "" as TicketState });
  const hasChanges = ticket ? (
    title !== baselineRef.current.title ||
    description !== baselineRef.current.description ||
    acceptanceCriteria !== baselineRef.current.acceptanceCriteria ||
    type !== baselineRef.current.type ||
    state !== baselineRef.current.state
  ) : false;

  // Clear document view and lightbox when modal closes
  useEffect(() => {
    if (!ticket) {
      setExpandedDoc(null);
      setLightboxImage(null);
    }
  }, [ticket]);

  // Initialize form when a *different* ticket is opened (by ID, not reference)
  const ticketId = ticket?.id;
  useEffect(() => {
    if (ticket && ticketId) {
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      setAcceptanceCriteria(ticket.acceptanceCriteria || "");
      setType(ticket.type);
      setState(ticket.state);
      setIsEpic(ticket.isEpic ?? false);
      setEpicChildren([]);
      setShowCreateChild(false);
      setNewChildTitle("");
      if (ticket.isEpic) loadEpicChildren(ticket.id);
      baselineRef.current = {
        title: ticket.title,
        description: ticket.description || "",
        acceptanceCriteria: ticket.acceptanceCriteria || "",
        type: ticket.type,
        state: ticket.state,
      };
      loadComments(ticket.id);
      loadDocuments(ticket.id, initialDocType);
      loadAttachments(ticket.id);
      loadPersonas();
      loadProject();

      // Clear any pending dispatch from previous ticket
      if (dispatchTimerRef.current) {
        clearTimeout(dispatchTimerRef.current);
        dispatchTimerRef.current = null;
      }
      pendingDispatchContent.current = [];

    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, ticket?.state]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ticket) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (expandedDoc) {
          setExpandedDoc(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [ticket, onClose, expandedDoc, lightboxImage]);

  // Poll comments every 10s while modal is open (doesn't touch form state)
  // When new comments arrive, also refresh documents & attachments immediately
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
            // New comment arrived — refresh documents & attachments immediately
            refreshDocumentsAndAttachments(ticketId);
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

  // Poll attachments every 10s while modal is open (for designer-generated images)
  useEffect(() => {
    if (!ticketId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/attachments`);
        const data = await res.json();
        const fresh = data || [];
        setAttachments((prev) => {
          // Only update if count changed (new attachments added or deleted)
          if (fresh.length !== prev.length) return fresh;
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
  }, [ticketId, showActivity]);

  // Load doc comments when expandedDoc changes
  const expandedDocId = expandedDoc?.id;
  useEffect(() => {
    if (expandedDocId) {
      loadDocComments(expandedDocId);
    } else {
      setDocComments([]);
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

  async function loadComments(ticketId: number) {
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

  // Lightweight refresh for docs & attachments (called when new comments arrive)
  async function refreshDocumentsAndAttachments(tid: number) {
    try {
      const [docRes, attRes] = await Promise.all([
        fetch(`/api/tickets/${tid}/documents`),
        fetch(`/api/tickets/${tid}/attachments`),
      ]);
      const docData = await docRes.json();
      const attData = await attRes.json();
      const freshDocs: TicketDocument[] = docData.documents || [];
      const freshAtts = attData || [];
      setDocuments((prev) => {
        const prevKey = prev.map((d) => `${d.type}:${d.version}`).join(",");
        const freshKey = freshDocs.map((d) => `${d.type}:${d.version}`).join(",");
        if (prevKey === freshKey) return prev;
        return freshDocs;
      });
      setExpandedDoc((prev) => {
        if (!prev) return null;
        const latest = freshDocs
          .filter((d) => d.type === prev.type)
          .sort((a, b) => (b.version || 0) - (a.version || 0))[0];
        if (latest && latest.version !== prev.version) return latest;
        return prev;
      });
      setAttachments((prev) => {
        if (freshAtts.length !== prev.length) return freshAtts;
        return prev;
      });
    } catch { /* non-critical */ }
  }

  async function loadDocuments(ticketId: number, autoExpandType?: "research" | "implementation_plan") {
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

  async function loadAttachments(ticketId: number) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/attachments`);
      const data = await res.json();
      setAttachments(data || []);
    } catch (error) {
      console.error("Failed to load attachments:", error);
    }
  }

  async function loadAuditLog(ticketId: number) {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/audit`);
      const data = await res.json();
      setAuditLog(data.audit || []);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function loadEpicChildren(tid: number) {
    try {
      const res = await fetch(`/api/tickets/${tid}/children`);
      const data = await res.json();
      setEpicChildren(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  }

  async function handleToggleEpic() {
    if (!ticket) return;
    const newValue = !isEpic;
    setIsEpic(newValue);
    await fetch("/api/tickets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, isEpic: newValue }),
    });
    if (newValue) {
      loadEpicChildren(ticket.id);
      // Auto-dispatch lead to break down the epic
      handleAIBreakdown();
    } else {
      setEpicChildren([]);
    }
    router.refresh();
  }

  async function handleCreateChild() {
    if (!ticket || !newChildTitle.trim()) return;
    setCreatingChild(true);
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChildTitle.trim(),
          type: ticket.type,
          epicId: ticket.id,
        }),
      });
      setNewChildTitle("");
      setShowCreateChild(false);
      loadEpicChildren(ticket.id);
      router.refresh();
    } finally {
      setCreatingChild(false);
    }
  }

  const [breakingDown, setBreakingDown] = useState(false);
  async function handleAIBreakdown() {
    if (!ticket) return;
    setBreakingDown(true);
    try {
      const epicSummary = `${ticket.title}${ticket.description ? `\n\n${ticket.description}` : ""}${ticket.acceptanceCriteria ? `\n\nAcceptance Criteria:\n${ticket.acceptanceCriteria}` : ""}`;
      await fetch(`/api/tickets/${ticket.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentContent: `This is an epic ticket. Break it down into smaller, focused sub-tickets using the create-sub-ticket tool. Each sub-ticket should be a single, independently workable item.\n\nEpic:\n${epicSummary}`,
          targetRole: "researcher",
        }),
      });
      // Poll for children after a delay (agent takes time)
      setTimeout(() => loadEpicChildren(ticket.id), 5000);
      setTimeout(() => loadEpicChildren(ticket.id), 15000);
      setTimeout(() => loadEpicChildren(ticket.id), 30000);
    } finally {
      setBreakingDown(false);
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

  async function loadProject() {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch {
      // non-critical — preview toggle just won't show
    }
  }

  // ── Version helpers ─────────────────────────────
  const researchDocs = documents
    .filter(d => d.type === "research")
    .sort((a, b) => (b.version || 0) - (a.version || 0));
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
      // Move ticket to planning state
      const response = await fetch(`/api/tickets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, state: "planning" }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setApprovingResearch(false);
    }
  }

  async function handleApprovePlan() {
    if (!ticket) return;

    // Check if research artifact exists
    const hasResearch = documents.some(d => d.type === "research");
    if (!hasResearch) {
      alert("Cannot move to building: research artifact is required");
      return;
    }

    setApprovingPlan(true);
    try {
      // Call approve-plan endpoint which verifies artifacts and dispatches developer
      const response = await fetch(`/api/tickets/${ticket.id}/approve-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to approve plan");
      }
    } finally {
      setApprovingPlan(false);
    }
  }

  async function handleDeleteDocument(docType: "research" | "implementation_plan" | "design" | "security_review") {
    if (!ticket) return;
    setDeletingDoc(docType);
    try {
      await fetch(`/api/tickets/${ticket.id}/documents?type=${docType}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.type !== docType));
      // Research approval state is on the ticket — router.refresh() below will update it
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
      const res = await fetch(`/api/tickets/${ticket.id}/ship`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Ship failed" }));
        alert(`Ship failed: ${data.error || res.statusText}`);
        return;
      }
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

  const ROLE_SLUGS = ["designer", "developer", "critic", "researcher", "hacker"];

  // Extract first @mentioned persona name from comment text
  // Supports both @Name and @role (e.g., @designer, @lead, @researcher)
  function extractMentionedPersona(text: string): { name?: string; role?: string; team?: boolean } {
    const lower = text.toLowerCase();
    // Check @team first
    if (lower.includes("@team")) return { team: true };
    // Check persona names (sort by length desc so longer names match first)
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

  // Detect if comment is conversational (short question/chat) vs. a work directive
  function isConversationalComment(text: string): boolean {
    const trimmed = text.trim();

    // Short comments (under 200 chars) are likely conversational
    if (trimmed.length < 200) {
      // Question patterns
      if (/\?$/.test(trimmed)) return true;
      if (/^(what|how|why|when|where|who|can|could|would|should|do|does|did|is|are|was|were)/i.test(trimmed)) return true;
      // Greeting/acknowledgment patterns
      if (/^(thanks|thank you|got it|ok|okay|sure|yes|no|lgtm|approved)/i.test(trimmed)) return true;
    }

    // Long detailed requests are not conversational (work directives)
    return false;
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
          body: JSON.stringify({ commentContent: combined, targetPersonaName: mention.name, targetRole: mention.role, targetPersonaId: opts?.targetPersonaId, team: mention.team, conversational: opts?.conversational, documentId: opts?.documentId, silent: true }),
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

  async function handleCommentPost(text: string, attachments: CommentAttachment[]) {
    if (!ticket) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    const data = await res.json();
    if (data.comment) {
      setComments((prev) => [...prev, data.comment]);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      const isConversational = isConversationalComment(text);
      queueDispatch(text, { conversational: isConversational });
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

  async function handleDocCommentPost(text: string, attachments: CommentAttachment[]) {
    if (!ticket || !expandedDoc) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        documentId: expandedDoc.id,
      }),
    });
    const data = await res.json();
    if (data.comment) {
      setDocComments((prev) => [...prev, data.comment]);
      setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      const docLabel = expandedDoc.type === "research" ? "research document" : (expandedDoc.type as string) === "design" ? "design document" : "implementation plan";
      queueDispatch(`[Comment on ${docLabel}] ${text}`, {
        conversational: true,
        documentId: expandedDoc.id,
        isDocComment: true,
        targetPersonaId: expandedDoc.authorPersonaId,
      });
    }
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

  async function handleAttachmentDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length || !ticket) return;

    setUploadingAttachment(true);
    try {
      for (const file of files) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            data: dataUrl,
            createdByType: "human",
            createdById: "1",
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

  async function applyTransparencyToAttachment(attachmentId: number) {
    if (!ticket) return;
    setProcessingAttachmentId(attachmentId);

    try {
      // Get the attachment URL
      const attachmentUrl = `/api/tickets/${ticket.id}/attachments/${attachmentId}`;

      // Load the image
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = attachmentUrl;
      });

      // Create canvas and get pixel data
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Process pixels: make 50% grey transparent
      const tolerance = 50; // Increased tolerance to catch more greys
      const greyTarget = 128;
      let pixelsChanged = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is close to 50% grey
        const isGrey =
          Math.abs(r - greyTarget) < tolerance &&
          Math.abs(g - greyTarget) < tolerance &&
          Math.abs(b - greyTarget) < tolerance &&
          Math.abs(r - g) < tolerance &&
          Math.abs(g - b) < tolerance;

        if (isGrey) {
          // Make it transparent
          data[i + 3] = 0;
          pixelsChanged++;
        }
      }

      console.log(`Made ${pixelsChanged} pixels transparent`);

      // Put the modified pixel data back
      ctx.putImageData(imageData, 0, 0);

      // Convert to PNG data URL
      const processedDataUrl = canvas.toDataURL("image/png");

      // Send to server to save
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${attachmentId}/transparency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processedDataUrl }),
      });

      if (res.ok) {
        // Reload attachments to get the updated image
        await loadAttachments(ticket.id);
      }
    } catch (err) {
      console.error("Failed to apply transparency:", err);
    } finally {
      setProcessingAttachmentId(null);
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
  const currentColumn = BOARD_STATES.find((s) => s.name === state) || BOARD_STATES[0];

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
                  {formatTicketSlug(ticket.id)}
                </span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as TicketState)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer appearance-none"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${currentColumn.color} 20%, transparent)`,
                    color: currentColumn.color,
                    border: `1.5px solid color-mix(in srgb, ${currentColumn.color} 40%, transparent)`,
                    outline: "none",
                  }}
                >
                  {stateOptions.map((s) => {
                    const bs = BOARD_STATES.find((b) => b.name === s);
                    return (
                      <option key={s} value={s} style={{ backgroundColor: "#1a1a2e", color: "#fff" }}>
                        {bs?.icon} {bs?.label || s}
                      </option>
                    );
                  })}
                </select>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-2xl font-bold leading-tight bg-transparent border-none outline-none"
                style={{ color: "var(--text-primary)" }}
                placeholder="Ticket title..."
              />
              {/* Participant avatar bubbles */}
              {(() => {
                const seen = new Set<string>();
                const participants: { id: string; name: string; color?: string; avatarUrl?: string; role?: string; isActive?: boolean }[] = [];
                const activeRunIds = new Set(ticket.activeRunPersonaIds ?? []);
                const activeMs = ticket.lastAgentActivity ? Date.now() - new Date(ticket.lastAgentActivity).getTime() : Infinity;
                const legacyActive = activeMs < 30 * 60 * 1000;
                // Assignee first
                if (ticket.assignee) {
                  seen.add(ticket.assignee.id);
                  participants.push({
                    id: ticket.assignee.id,
                    name: ticket.assignee.name,
                    color: ticket.assignee.color,
                    avatarUrl: ticket.assignee.avatar,
                    role: ticket.assignee.role,
                    isActive: activeRunIds.size > 0 ? activeRunIds.has(ticket.assignee.id) : legacyActive
                  });
                }
                // All agent comment authors
                for (const c of comments) {
                  if (c.authorType === "agent" && c.author?.name) {
                    const p = personasList.find(p => p.name === c.author!.name);
                    const key = p?.id ?? c.author.name;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    participants.push({ id: key, name: c.author.name, color: p?.color ?? c.author.color, avatarUrl: p?.avatar ?? c.author.avatarUrl, role: p?.role ?? c.author.role, isActive: p ? activeRunIds.has(p.id) : false });
                  }
                }
                // Also add any running agents not yet in participants (e.g. dispatched but no comment yet)
                for (const runId of activeRunIds) {
                  if (!seen.has(runId)) {
                    const p = personasList.find(p => p.id === runId);
                    if (p) {
                      seen.add(runId);
                      participants.push({ id: runId, name: p.name, color: p.color, avatarUrl: p.avatar, role: p.role, isActive: true });
                    }
                  }
                }
                if (participants.length === 0) return null;
                return (
                  <div className="flex items-center gap-2 mt-3">
                    {participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5" title={`${p.name}${p.role ? ` — ${p.role}` : ""}`}>
                        <div className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `2px solid ${p.color || "rgba(255,255,255,0.2)"}` }}>
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: p.color || "rgba(255,255,255,0.1)", color: "#fff" }}>
                              {p.name[0]}
                            </div>
                          )}
                          {p.isActive && (
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-400 border border-black" />
                          )}
                        </div>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-1">
              {/* EPIC FEATURES DISABLED - Make Epic toggle removed */}
              {onDelete && (
                <button
                  onClick={async () => {
                    if (!ticket) return;
                    if (!confirm(`Delete ${formatTicketSlug(ticket.id)}?`)) return;
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
              {/* Live preview toggle - enabled for building/review/shipped */}
              {(() => {
                const canPreview = ticket.state === "building" || ticket.state === "review" || ticket.state === "shipped";
                return (
                  <button
                    onClick={() => canPreview && setViewMode(viewMode === "info" ? "preview" : "info")}
                    disabled={!canPreview}
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      color: canPreview && viewMode === "preview" ? "var(--accent-blue)" : "var(--text-muted)",
                      backgroundColor: canPreview && viewMode === "preview" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                      opacity: canPreview ? 1 : 0.4,
                      cursor: canPreview ? "pointer" : "not-allowed",
                    }}
                    title={
                      !canPreview ? "Live preview available when building" :
                      viewMode === "info" ? "Show live preview" : "Show ticket info"
                    }
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                );
              })()}
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
            {viewMode === "preview" ? (
              /* Live preview iframe - auto-starts dev server if needed */
              <div className="h-full w-full -mx-8 -my-6">
                {previewError ? (
                  <div className="flex items-center justify-center h-full p-8" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex flex-col items-center gap-3 text-center max-w-md">
                      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <div className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Preview not available</div>
                        <pre className="text-xs text-left whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>{previewError}</pre>
                      </div>
                      <button
                        onClick={() => { setPreviewError(null); setViewMode("info"); }}
                        className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: "var(--bg-input)", color: "var(--text-secondary)" }}
                      >
                        Back to ticket
                      </button>
                    </div>
                  </div>
                ) : startingPreview ? (
                  <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm">Starting dev server...</span>
                    </div>
                  </div>
                ) : (
                  <iframe
                    src={previewUrl || `http://localhost:${3100 + (Number(projectId) % 100)}`}
                    className="w-full h-full border-0"
                    title="Live Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                )}
              </div>
            ) : (
              <>
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
                  onBlur={() => { if (description !== descOnFocusRef.current && !descVoice.isRecording && !descVoice.isProcessingAI) enhanceDescription(); }}
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

            {/* Sub-tickets (when epic) */}
            {isEpic && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold" style={{ color: "#fb923c" }}>
                    Sub-tickets
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAIBreakdown}
                      disabled={breakingDown}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:brightness-110"
                      style={{ backgroundColor: "rgba(249, 115, 22, 0.18)", color: "#fb923c" }}
                      title="Have @lead analyze this epic and create sub-tickets"
                    >
                      {breakingDown ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Breaking down...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                          </svg>
                          @lead break down
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowCreateChild(!showCreateChild)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}
                      title="Manually add a sub-ticket"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add manual
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {epicChildren.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium" style={{ color: "#fb923c" }}>
                        {epicChildren.filter((c) => c.state === "shipped").length} / {epicChildren.length} shipped
                      </span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                        {Math.round((epicChildren.filter((c) => c.state === "shipped").length / epicChildren.length) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(249, 115, 22, 0.15)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(epicChildren.filter((c) => c.state === "shipped").length / epicChildren.length) * 100}%`,
                          backgroundColor: "#fb923c",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Inline child creation form */}
                {showCreateChild && (
                  <div className="mb-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={newChildTitle}
                      onChange={(e) => setNewChildTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateChild(); if (e.key === "Escape") { setShowCreateChild(false); setNewChildTitle(""); } }}
                      placeholder="Sub-ticket title..."
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        backgroundColor: "var(--bg-input)",
                        border: "1px solid rgba(249, 115, 22, 0.3)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      onClick={handleCreateChild}
                      disabled={!newChildTitle.trim() || creatingChild}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#f97316" }}
                    >
                      {creatingChild ? "..." : "Add"}
                    </button>
                  </div>
                )}

                {/* Children list */}
                {epicChildren.length > 0 ? (
                  <div className="space-y-2">
                    {epicChildren.map((child) => {
                      const childTypeStyle = ticketTypes[child.type as keyof typeof ticketTypes] || ticketTypes.feature;
                      const childState = BOARD_STATES.find((s) => s.name === child.state);
                      return (
                        <div
                          key={child.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
                          onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set("openTicket", String(child.id));
                            window.location.href = url.toString();
                          }}
                        >
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${childTypeStyle.bg} 15%, transparent)`,
                              color: childTypeStyle.text,
                            }}
                          >
                            {childTypeStyle.label}
                          </span>
                          <span className="text-sm font-medium flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                            {child.title}
                          </span>
                          {childState && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${childState.color} 15%, transparent)`,
                                color: childState.color,
                              }}
                            >
                              {childState.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : !showCreateChild && !breakingDown ? (
                  <div
                    className="rounded-xl p-5 text-center text-sm"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                  >
                    @lead is analyzing this epic and will create sub-tickets shortly...
                  </div>
                ) : null}
              </div>
            )}

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
                <div className="grid grid-cols-3 gap-4">
                  {(["research", "design", "implementation_plan", "security_review"] as const).map((docType) => {
                    const doc = documents.find(d => d.type === docType);
                    if (!doc && !(docType === "research" && ticket?.researchCompletedAt)) return null;

                    const isResearch = docType === "research";
                    const isDesign = docType === "design";
                    const isSecurity = docType === "security_review";
                    const title = isResearch ? "Research Document" : isDesign ? "Design Document" : isSecurity ? "Security Review" : "Implementation Plan";
                    const color = isResearch ? "#f59e0b" : isDesign ? "#8b5cf6" : isSecurity ? "#ef4444" : "#8b5cf6";
                    const icon = isResearch ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    ) : isDesign ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                    ) : isSecurity ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    );

                    return (
                      <div key={docType} className="rounded-xl p-5 flex flex-col" style={{
                        aspectRatio: '8.5 / 11',
                        backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                      }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{icon}</svg>
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
                            {doc && <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>v{doc.version || 1}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {doc?.content && <button onClick={() => setExpandedDoc(doc)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}>View Full</button>}
                            <button onClick={() => handleDeleteDocument(docType)} disabled={deletingDoc === docType} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/15" style={{ color: "var(--text-muted)" }} title={`Delete ${title.toLowerCase()}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </div>
                        </div>
                        {doc?.content && (
                          <div className="relative flex-1 overflow-hidden cursor-pointer" style={{ color: "rgba(255, 255, 255, 0.8)" }} onClick={() => setExpandedDoc(doc)}>
                            <div className="prose-sm"><ReactMarkdown components={{ h1: ({ children }) => <h1 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h1>, h2: ({ children }) => <h2 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h2>, h3: ({ children }) => <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h3>, p: ({ children }) => <p className="mb-1.5 text-xs">{children}</p>, strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>, code: ({ children }) => <code className="bg-white/10 px-1 rounded text-[11px]">{children}</code>, ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 text-xs">{children}</ul>, ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 text-xs">{children}</ol> }}>{doc.content}</ReactMarkdown></div>
                            <div className="absolute bottom-0 left-0 right-0 h-16" style={{ background: "linear-gradient(transparent, rgba(20, 15, 30, 0.98))" }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  style={{ border: `1px dashed ${attachmentDragOver ? "var(--accent-blue)" : "var(--border-medium)"}`, color: "var(--text-muted)", backgroundColor: attachmentDragOver ? "rgba(59,130,246,0.05)" : undefined }}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleAttachmentDrop}
                  onDragOver={(e) => { e.preventDefault(); setAttachmentDragOver(true); }}
                  onDragLeave={() => setAttachmentDragOver(false)}
                >
                  <svg className="w-6 h-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-xs">Drop files or click to upload</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {attachments.map((att) => {
                    const isImage = att.mimeType.startsWith("image/");
                    const attachmentUrl = `/api/tickets/${ticket?.id}/attachments/${att.id}`;

                    if (isImage) {
                      return (
                        <div
                          key={att.id}
                          className="relative group rounded-lg overflow-hidden cursor-pointer"
                          style={{
                            aspectRatio: '8.5 / 11',
                            backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                            backgroundColor: '#404040'
                          }}
                          onClick={() => { setLightboxImage(`${attachmentUrl}?t=${Date.now()}`); }}
                        >
                          <img src={`${attachmentUrl}?t=${Date.now()}`} alt={att.filename} className="w-full h-full object-contain transition-transform group-hover:scale-105" />

                          {/* Transparency button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); applyTransparencyToAttachment(att.id); }}
                            disabled={processingAttachmentId === att.id}
                            className="absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)", opacity: processingAttachmentId === att.id ? 0.5 : undefined }}
                            title="Make 50% gray transparent"
                          >
                            {processingAttachmentId === att.id ? (
                              <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M16 10.5C16 11.3284 15.5523 12 15 12C14.4477 12 14 11.3284 14 10.5C14 9.67157 14.4477 9 15 9C15.5523 9 16 9.67157 16 10.5Z" fill="currentColor"/>
                                <ellipse cx="9" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
                                <path opacity="0.8" d="M22 19.723V12.3006C22 6.61173 17.5228 2 12 2C6.47715 2 2 6.61173 2 12.3006V19.723C2 21.0453 3.35098 21.9054 4.4992 21.314C5.42726 20.836 6.5328 20.9069 7.39614 21.4998C8.36736 22.1667 9.63264 22.1667 10.6039 21.4998L10.9565 21.2576C11.5884 20.8237 12.4116 20.8237 13.0435 21.2576L13.3961 21.4998C14.3674 22.1667 15.6326 22.1667 16.6039 21.4998C17.4672 20.9069 18.5727 20.836 19.5008 21.314C20.649 21.9054 22 21.0453 22 19.723Z" stroke="currentColor" strokeWidth="1.5"/>
                              </svg>
                            )}
                          </button>

                          {/* Download button */}
                          <a
                            href={attachmentUrl}
                            download={att.filename}
                            onClick={(e) => { e.stopPropagation(); }}
                            className="absolute top-1 left-8 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                            title="Download image"
                          >
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </a>

                          {/* Delete button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                            title="Remove attachment"
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
                    style={{ border: `1px dashed ${attachmentDragOver ? "var(--accent-blue)" : "var(--border-medium)"}`, color: "var(--text-muted)", backgroundColor: attachmentDragOver ? "rgba(59,130,246,0.05)" : undefined }}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleAttachmentDrop}
                    onDragOver={(e) => { e.preventDefault(); setAttachmentDragOver(true); }}
                    onDragLeave={() => setAttachmentDragOver(false)}
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
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setShowActivity(!showActivity)}
                  className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
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
                {auditLog.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/tickets/${ticketId}/audit`, { method: "DELETE" });
                      setAuditLog([]);
                    }}
                    className="text-[11px] transition-colors hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear
                  </button>
                )}
              </div>

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

                      {auditLog.map((entry) => {
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

          {/* Build state preview bar */}
          {ticket.state === "building" && (
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
          {ticket.state === "review" && (
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
              </>
            )}
          </div>

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
            {ticket?.state === "planning" && (
              <button
                onClick={handleApprovePlan}
                disabled={approvingPlan || !documents.some(d => d.type === "research")}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:opacity-90"
                style={{ backgroundColor: "#22c55e", color: "#fff", opacity: (approvingPlan || !documents.some(d => d.type === "research")) ? 0.5 : 1 }}
                title={!documents.some(d => d.type === "research") ? "Research artifact required" : ""}
              >
                {approvingPlan ? "Moving..." : "Move to Building"}
              </button>
            )}
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
                                p: ({ children }) => <p className="mb-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{highlightMentionsInChildren(children, personasList)}</p>,
                                strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{highlightMentionsInChildren(children, personasList)}</strong>,
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
                                li: ({ children }) => <li className="leading-relaxed">{highlightMentionsInChildren(children, personasList)}</li>,
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
                            {renderCommentContent(comment.content, personasList)}
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
          <CommentInput
            personasList={personasList}
            placeholder="Write a comment… @ to mention, # for columns"
            onPost={handleCommentPost}
            enableVoice
          />
        </div>
      </div>
    </div>
  );

  // Lightbox for full-size image viewing
  const lightbox = lightboxImage && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.95)" }}
      onClick={() => { setLightboxImage(null); }}
    >
      <button
        onClick={() => { setLightboxImage(null); }}
        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div
        className="max-w-full max-h-full flex items-center justify-center rounded-lg overflow-hidden"
        style={{
          backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#404040'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={lightboxImage}
          alt="Full size"
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
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
          <svg className="w-5 h-5" style={{ color: expandedDoc.type === "research" ? "#f59e0b" : (expandedDoc.type as string) === "design" ? "#8b5cf6" : "#8b5cf6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {expandedDoc.type === "research" ? "Research Document" : expandedDoc.type === "design" ? "Design Document" : expandedDoc.type === "security_review" ? "Security Review" : "Implementation Plan"}
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
          <button
            onClick={() => handleDeleteDocument(expandedDoc.type as "research" | "implementation_plan" | "design")}
            disabled={!!deletingDoc}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-500/15"
            style={{ color: "#ef4444" }}
            title={`Delete ${expandedDoc.type === "research" ? "research" : (expandedDoc.type as string) === "design" ? "design" : "plan"} — agents will redo`}
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
                {expandedDoc.type === "research" ? "Research Document" : expandedDoc.type === "design" ? "Design Document" : expandedDoc.type === "security_review" ? "Security Review" : "Implementation Plan"}
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
                                p: ({ children }) => <p className="mb-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{highlightMentionsInChildren(children, personasList)}</p>,
                                strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{highlightMentionsInChildren(children, personasList)}</strong>,
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
                                li: ({ children }) => <li className="leading-relaxed">{highlightMentionsInChildren(children, personasList)}</li>,
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
                            {renderCommentContent(comment.content, personasList)}
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
          <CommentInput
            personasList={personasList}
            placeholder="Comment on this document\u2026 @ to mention, # for columns"
            onPost={handleDocCommentPost}
          />
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
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handlePostQuoteComment();
              }
            }}
          />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {postingQuote ? "Posting..." : "Enter to send · Shift+Enter for newline"}
            </span>
            <button
              onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
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
