"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSelector } from "./project-selector";
import { ProjectSettingsModal } from "./project-settings-modal";

interface BoardHeaderProps {
  project: Project;
  allProjects: Project[];
  shippedCount: number;
  hasCommands: boolean;
  previewMode: boolean;
  onPreviewToggle: (url: string | null) => void;
}

export function BoardHeader({ project, allProjects, shippedCount, hasCommands, previewMode, onPreviewToggle }: BoardHeaderProps) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");

  const previewEnabled = shippedCount >= 1 && hasCommands;

  async function handlePreview() {
    // If already in preview mode, toggle it off
    if (previewMode) {
      onPreviewToggle(null);
      return;
    }

    if (!previewEnabled) {
      setSettingsNotice("Configure build and run commands in project settings to enable preview.");
      setSettingsOpen(true);
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/preview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.details
          ? `Build failed:\n${data.details}`
          : data.error || "Preview failed";
        setSettingsNotice(msg);
        setSettingsOpen(true);
        setPreviewing(false);
        return;
      }
      // If freshly spawned (not already running), wait for server to start
      if (!data.alreadyRunning) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      onPreviewToggle(data.url);
    } catch (err) {
      console.error("[preview]", err);
    } finally {
      setPreviewing(false);
    }
  }

  function handleSettingsClose() {
    setSettingsOpen(false);
    setSettingsNotice("");
  }

  return (
    <>
      <div
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <ProjectSelector project={project} allProjects={allProjects} />
        </div>

        <div className="flex items-center gap-3">
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
      </div>

      <ProjectSettingsModal
        open={settingsOpen}
        onClose={handleSettingsClose}
        project={project}
        notice={settingsNotice}
      />
    </>
  );
}
