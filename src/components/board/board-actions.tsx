"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSettingsModal } from "./project-settings-modal";

interface BoardActionsProps {
  project: Project;
  shippedCount: number;
  hasCommands: boolean;
}

export function BoardActions({ project, shippedCount, hasCommands }: BoardActionsProps) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");

  const previewEnabled = shippedCount >= 1 && hasCommands;

  async function handlePreview() {
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
      if (!data.alreadyRunning) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      window.open(data.url, "_blank");
    } catch (err) {
      console.error("[preview]", err);
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
        <button
          onClick={handlePreview}
          disabled={previewing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-input)",
            border: "1px solid var(--border-medium)",
            color: "var(--text-secondary)",
            opacity: previewEnabled && !previewing ? 1 : 0.4,
            cursor: previewing ? "wait" : previewEnabled ? "pointer" : "not-allowed",
          }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {previewing ? "Starting..." : "Preview"}
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
