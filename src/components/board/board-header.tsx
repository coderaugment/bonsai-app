"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSelector } from "./project-selector";

interface BoardHeaderProps {
  project: Project;
  allProjects: Project[];
}

export function BoardHeader({ project, allProjects }: BoardHeaderProps) {
  const router = useRouter();

  return (
    <div
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2">
        <ProjectSelector project={project} allProjects={allProjects} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/new-ticket")}
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
  );
}
