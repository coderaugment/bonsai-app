"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Persona } from "@/types";

interface ProjectInfoPanelProps {
  project: Project;
  personas: Persona[];
  ticketStats: { research: number; plan: number; build: number; test: number; ship: number };
}

function EditableField({
  label,
  value,
  placeholder,
  projectId,
  fieldKey,
  multiline,
}: {
  label: string;
  value: string;
  placeholder: string;
  projectId: string;
  fieldKey: string;
  multiline?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (text.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, [fieldKey]: text.trim() }),
      });
      router.refresh();
    } catch {}
    setSaving(false);
    setEditing(false);
  }

  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </h4>
      {editing ? (
        multiline ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Escape") { setText(value); setEditing(false); } }}
            autoFocus
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-md text-xs outline-none resize-y"
            style={{
              backgroundColor: "var(--bg-input)",
              border: "1px solid var(--accent-blue)",
              color: "var(--text-primary)",
              lineHeight: "1.5",
            }}
          />
        ) : (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setText(value); setEditing(false); }
            }}
            autoFocus
            className="w-full px-2.5 py-1.5 rounded-md text-xs outline-none"
            style={{
              backgroundColor: "var(--bg-input)",
              border: "1px solid var(--accent-blue)",
              color: "var(--text-primary)",
            }}
          />
        )
      ) : (
        <p
          onClick={() => { setText(value); setEditing(true); }}
          className="text-xs leading-relaxed cursor-pointer rounded-md px-2.5 py-1.5 -mx-2.5 transition-colors hover:bg-white/5"
          style={{ color: value ? "var(--text-secondary)" : "var(--text-muted)" }}
        >
          {saving ? "Saving..." : value || placeholder}
        </p>
      )}
    </div>
  );
}

export function ProjectInfoPanel({ project, personas, ticketStats }: ProjectInfoPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const total = ticketStats.research + ticketStats.plan + ticketStats.build + ticketStats.test + ticketStats.ship;

  return (
    <div
      className="border-b transition-all"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-6 py-1.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <svg
          className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {project.description || "Project details"}
        </span>

        {!expanded && (
          <div className="flex items-center gap-3 ml-auto flex-shrink-0">
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>{total} tickets</span>
              <span>{ticketStats.ship} done</span>
            </div>
            <div className="flex -space-x-1.5">
              {personas.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="w-5 h-5 rounded-full overflow-hidden border"
                  style={{ borderColor: "var(--bg-primary)" }}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name[0]}
                    </div>
                  )}
                </div>
              ))}
              {personas.length > 5 && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] border"
                  style={{ borderColor: "var(--bg-primary)", backgroundColor: "var(--bg-secondary)", color: "var(--text-muted)" }}
                >
                  +{personas.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-6 pb-5 pt-1">
          <div className="grid grid-cols-4 gap-6">

            {/* Col 1: About */}
            <div className="space-y-3">
              <EditableField
                label="Description"
                value={project.description || ""}
                placeholder="Click to add a project description..."
                projectId={project.id}
                fieldKey="description"
                multiline
              />

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                {project.visibility && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {project.visibility === "private" ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      )}
                    </svg>
                    <span className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{project.visibility}</span>
                  </div>
                )}
                {project.githubRepo && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3" style={{ color: "var(--text-muted)" }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {project.githubOwner}/{project.githubRepo}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Col 2: Target Customer */}
            <div>
              <EditableField
                label="Target Customer"
                value={project.targetCustomer || ""}
                placeholder="Who is this for? Describe the audience..."
                projectId={project.id}
                fieldKey="targetCustomer"
                multiline
              />
            </div>

            {/* Col 3: Tech Stack */}
            <div>
              <EditableField
                label="Tech Stack"
                value={project.techStack || ""}
                placeholder="e.g. Next.js, SQLite, Tailwind..."
                projectId={project.id}
                fieldKey="techStack"
                multiline
              />
            </div>

            {/* Col 4: Team */}
            <div className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>
                Team ({personas.length})
              </h4>

              <div className="space-y-1.5">
                {personas.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium block truncate" style={{ color: "var(--text-primary)" }}>
                        {p.name}
                      </span>
                      {p.roleData?.title && (
                        <span className="text-[10px] block truncate" style={{ color: p.roleData.color || "var(--text-muted)" }}>
                          {p.roleData.title}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {personas.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>No team members yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
