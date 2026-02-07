"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSelector } from "@/components/board/project-selector";
import { DesktopView } from "@/components/desktop/desktop-view";

interface IdeasShellProps {
  project: Project;
  allProjects: Project[];
}

export function IdeasShell({ project, allProjects }: IdeasShellProps) {
  const router = useRouter();

  function handleProjectSwitch(slug: string) {
    // Navigate to the project board to set active_project_id, then come back
    // Simpler: set active project via API, then refresh
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "active_project_id", value: allProjects.find(p => p.slug === slug)?.id }),
    }).then(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center px-6 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <ProjectSelector
          project={project}
          allProjects={allProjects}
          onSwitch={handleProjectSwitch}
        />
      </div>
      <DesktopView projectId={Number(project.id)} />
    </div>
  );
}
