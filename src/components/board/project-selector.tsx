"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { AddProjectModal } from "./add-project-modal";
import { ProjectSettingsModal } from "./project-settings-modal";

interface ProjectSelectorProps {
  project: Project;
  allProjects: Project[];
  onSwitch?: (slug: string) => void;
}

export function ProjectSelector({ project, allProjects, onSwitch }: ProjectSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleSwitch(targetSlug: string) {
    if (targetSlug === project.slug) {
      setOpen(false);
      return;
    }
    setOpen(false);
    if (onSwitch) {
      onSwitch(targetSlug);
    } else {
      router.push(`/p/${targetSlug}`);
    }
  }

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative" }}>
        {/* Trigger */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-lg font-semibold transition-colors hover:opacity-70"
          style={{ color: "var(--text-primary)" }}
        >
          {project.name}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{
              transition: "transform 150ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Dropdown panel */}
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 240,
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-medium)",
              borderRadius: 12,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            {/* Add new project */}
            <button
              onClick={() => {
                setOpen(false);
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--accent-blue)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add new project
            </button>

            {/* Divider */}
            <div style={{ height: 1, backgroundColor: "var(--border-medium)" }} />

            {/* Project list */}
            {allProjects.map((p) => {
              const isActive = p.slug === project.slug;
              const isHovered = hoveredId === p.id;

              return (
                <div
                  key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "rgba(91, 141, 249, 0.08)"
                      : isHovered
                        ? "rgba(255, 255, 255, 0.04)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {/* Project name — click to switch */}
                  <button
                    onClick={() => handleSwitch(p.slug)}
                    className="flex items-center gap-2 flex-1 text-left text-sm font-medium truncate"
                    style={{
                      color: isActive ? "var(--accent-blue)" : "var(--text-primary)",
                    }}
                  >
                    {/* Check mark for active */}
                    <span style={{ width: 16, flexShrink: 0 }}>
                      {isActive && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>

                  {/* Gear icon on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setSettingsProject(p);
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-white/10"
                    style={{
                      color: "var(--text-muted)",
                      opacity: isHovered ? 1 : 0,
                      pointerEvents: isHovered ? "auto" : "none",
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add project modal */}
      <AddProjectModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {/* Settings modal — for whichever project's gear was clicked */}
      {settingsProject && (
        <ProjectSettingsModal
          open={true}
          onClose={() => setSettingsProject(null)}
          project={settingsProject}
        />
      )}
    </>
  );
}
