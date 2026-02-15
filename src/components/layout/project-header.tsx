"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSelector } from "@/components/board/project-selector";

interface ProjectHeaderProps {
  project: Project;
  allProjects: Project[];
}

export function ProjectHeader({ project, allProjects }: ProjectHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Extract sub-path after /p/[slug]/ (e.g. "board", "activity", "team", "settings")
  function handleSwitch(newSlug: string) {
    const match = pathname.match(/^\/p\/[^/]+\/(.+)$/);
    const subPath = match ? match[1] : "board";
    router.push(`/p/${newSlug}/${subPath}`);
  }

  return (
    <div
      className="flex items-center px-6 py-3 border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <ProjectSelector
        project={project}
        allProjects={allProjects}
        onSwitch={handleSwitch}
      />
    </div>
  );
}
