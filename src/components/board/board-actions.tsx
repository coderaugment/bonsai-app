"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSettingsModal } from "./project-settings-modal";

interface BoardActionsProps {
  project: Project;
  shippedCount: number;
  hasCommands: boolean;
  previewMode: boolean;
  onPreviewToggle: () => void;
  onPreviewStart: () => void;
  onPreviewReady: (url: string) => void;
  onPreviewError: (error: string) => void;
}

export function BoardActions({ project, shippedCount, hasCommands, previewMode, onPreviewToggle, onPreviewStart, onPreviewReady, onPreviewError }: BoardActionsProps) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [paused, setPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Poll pause state every 10s
  useEffect(() => {
    async function fetchPauseState() {
      try {
        const res = await fetch("/api/credit-pause");
        if (res.ok) {
          const data = await res.json();
          setPaused(data.paused);
        }
      } catch {}
    }
    fetchPauseState();
    const interval = setInterval(fetchPauseState, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function togglePause() {
    setPauseLoading(true);
    try {
      if (paused) {
        await fetch("/api/credit-pause", { method: "DELETE" });
        setPaused(false);
      } else {
        await fetch("/api/credit-pause", { method: "PUT" });
        setPaused(true);
      }
    } catch {}
    setPauseLoading(false);
  }

  const previewEnabled = shippedCount >= 1 && hasCommands;

  async function handlePreview() {
    // If already in preview mode, toggle it off
    if (previewMode) {
      onPreviewToggle();
      return;
    }

    if (!previewEnabled) {
      setSettingsNotice("Configure build and run commands in project settings to enable preview.");
      setSettingsOpen(true);
      return;
    }

    setPreviewing(true);
    onPreviewStart();
    try {
      const res = await fetch(`/api/projects/${project.id}/preview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.details
          ? `Build failed:\n${data.details}`
          : data.error || "Preview failed";
        onPreviewError(msg);
        setSettingsNotice(msg);
        setSettingsOpen(true);
        setPreviewing(false);
        return;
      }
      // Replace 0.0.0.0 with localhost for browser compatibility
      const url = data.url.replace('0.0.0.0', 'localhost');

      // Wait for server to be ready if just started
      if (!data.alreadyRunning) {
        await new Promise((r) => setTimeout(r, 3000));
      }

      onPreviewReady(url);
    } catch (err) {
      console.error("[preview]", err);
      onPreviewError("Failed to start preview");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <>
      <div
        className="flex items-center justify-end gap-3 px-6 py-2 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {/* Play/Pause agents */}
        <button
          onClick={togglePause}
          disabled={pauseLoading}
          title={paused ? "Resume agents" : "Pause agents"}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: paused ? "rgba(239,68,68,0.12)" : "var(--bg-input)",
            border: `1px solid ${paused ? "rgba(239,68,68,0.4)" : "var(--border-medium)"}`,
            color: paused ? "#f87171" : "var(--text-secondary)",
            opacity: pauseLoading ? 0.5 : 1,
            cursor: pauseLoading ? "wait" : "pointer",
          }}
        >
          {paused ? (
            /* Play icon */
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            /* Pause icon */
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
          {paused ? "Paused" : "Pause"}
        </button>

        <button
          onClick={handlePreview}
          disabled={previewing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: previewMode ? "rgba(91, 141, 249, 0.1)" : "var(--bg-input)",
            border: previewMode ? "1px solid var(--accent-blue)" : "1px solid var(--border-medium)",
            color: previewMode ? "var(--accent-blue)" : "var(--text-secondary)",
            opacity: (previewEnabled && !previewing) || previewMode ? 1 : 0.4,
            cursor: previewing ? "wait" : (previewEnabled || previewMode) ? "pointer" : "not-allowed",
          }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {previewing ? "Starting..." : previewMode ? "Close Preview" : "Preview"}
        </button>

        <button
          onClick={() => router.push(`/p/${project.slug}/new-ticket`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add ticket
        </button>
      </div>

      <ProjectSettingsModal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsNotice(""); }}
        project={project}
        notice={settingsNotice}
      />
    </>
  );
}
