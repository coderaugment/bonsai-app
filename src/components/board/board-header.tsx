"use client";

import { useState } from "react";
import type { Project, Persona } from "@/types";
import { AddTicketModal } from "./add-ticket-modal";
import { CompanyModal } from "./company-modal";
import { ProjectSelector } from "./project-selector";

interface BoardHeaderProps {
  project: Project;
  allProjects: Project[];
  personas: Persona[];
}

export function BoardHeader({ project, allProjects, personas }: BoardHeaderProps) {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);

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
            onClick={() => setShowCompanyModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#22c55e" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            Company
          </button>

          <button
            onClick={() => setShowTicketModal(true)}
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

      <AddTicketModal
        open={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        projectSlug={project.slug}
      />
      <CompanyModal
        open={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        projectSlug={project.slug}
        personas={personas}
      />
    </>
  );
}
