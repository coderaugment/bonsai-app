"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { Project } from "@/types";
import { AddProjectModal } from "@/components/board/add-project-modal";

export function ProjectsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  // Archive confirm state
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // New project modal
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    setRenamingId(null);
    setArchivingId(null);
    fetchProjects();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : data);
    } catch {}
    setLoading(false);
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: renameValue.trim() }),
      });
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: renameValue.trim() } : p)));
    } catch {}
    setRenamingId(null);
    router.refresh();
  }

  async function handleArchive(id: string) {
    try {
      await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setArchivingId(null);
      router.refresh();
    } catch {}
  }


  function switchProject(slug: string) {
    onClose();
    router.push(`/p/${slug}`);
  }

  if (!open || !mounted) return null;

  const panel = (
    <div
      className="fixed inset-0 z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute top-0 bottom-0 flex flex-col shadow-2xl"
        style={{
          left: 64,
          width: 320,
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-medium)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Projects
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && projects.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin mx-auto" />
            </div>
          )}

          {projects.map((p) => (
            <div key={p.id} className="group">
              {/* Main row */}
              <div
                className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-white/5 cursor-pointer"
                onClick={() => {
                  if (renamingId !== p.id && archivingId !== p.id) switchProject(p.slug);
                }}
              >
                {/* Folder icon */}
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>

                {/* Name or rename input */}
                {renamingId === p.id ? (
                  <input
                    ref={renameRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(p.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => handleRename(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 px-2 py-0.5 rounded text-sm outline-none"
                    style={{
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--accent-blue)",
                      color: "var(--text-primary)",
                    }}
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </span>
                )}

                {/* Action buttons (visible on hover) */}
                {renamingId !== p.id && archivingId !== p.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Rename */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                        setArchivingId(null);
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10"
                      style={{ color: "var(--text-muted)" }}
                      title="Rename"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                      </svg>
                    </button>
                    {/* Settings */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                        router.push(`/p/${p.slug}/settings`);
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10"
                      style={{ color: "var(--text-muted)" }}
                      title="Settings"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    {/* Archive */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchivingId(p.id);
                        setRenamingId(null);
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10"
                      style={{ color: "var(--text-muted)" }}
                      title="Archive"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Archive confirmation */}
              {archivingId === p.id && (
                <div className="flex items-center gap-2 px-4 py-1.5 ml-6">
                  <span className="text-xs" style={{ color: "#ef4444" }}>Archive?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchive(p.id); }}
                    className="px-2 py-0.5 rounded text-xs font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: "#ef4444" }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setArchivingId(null); }}
                    className="px-2 py-0.5 rounded text-xs font-medium hover:bg-white/5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer: New project */}
        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <button
            onClick={() => { onClose(); setShowAddModal(true); }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--accent-blue)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New project
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      <AddProjectModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </>
  );
}
