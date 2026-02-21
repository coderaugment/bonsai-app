"use client";

import { useState } from "react";
import type { Project, Ticket, Persona } from "@/types";
import { BoardActions } from "./board-actions";
import { BoardView } from "./board-view";

interface BoardContainerProps {
  project: Project;
  tickets: Ticket[];
  personas: Persona[];
  ticketStats: { planning: number; building: number; review: number; shipped: number };
  awakePersonaIds: string[];
}

export function BoardContainer({
  project,
  tickets,
  personas,
  ticketStats,
  awakePersonaIds,
}: BoardContainerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingPreview, setStartingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function handlePreviewToggle(url: string | null) {
    setPreviewUrl(url);
  }

  function handlePreviewStart() {
    setStartingPreview(true);
    setPreviewError(null);
  }

  function handlePreviewReady(url: string) {
    setPreviewUrl(url);
    setStartingPreview(false);
    setPreviewError(null);
  }

  function handlePreviewError(error: string) {
    setPreviewError(error);
    setStartingPreview(false);
    setPreviewUrl(null);
  }

  function handlePreviewClose() {
    setPreviewUrl(null);
    setStartingPreview(false);
    setPreviewError(null);
  }

  return (
    <div className="flex flex-col h-full">
      <BoardActions
        project={project}
        shippedCount={ticketStats.shipped}
        hasCommands={!!(project.buildCommand && project.runCommand)}
        previewMode={!!previewUrl || startingPreview}
        onPreviewToggle={handlePreviewClose}
        onPreviewStart={handlePreviewStart}
        onPreviewReady={handlePreviewReady}
        onPreviewError={handlePreviewError}
      />
      <BoardView
        tickets={tickets}
        projectId={project.id}
        personas={personas}
        project={project}
        ticketStats={ticketStats}
        awakePersonaIds={awakePersonaIds}
        previewUrl={previewUrl}
        startingPreview={startingPreview}
        previewError={previewError}
        onPreviewClose={handlePreviewClose}
      />
    </div>
  );
}
