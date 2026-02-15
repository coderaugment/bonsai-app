import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";
import { ProjectInfoPanel } from "@/components/board/project-info-panel";
import { BoardActions } from "@/components/board/board-actions";
import { getProjectBySlug } from "@/db/data/projects";
import { getTickets } from "@/db/data/tickets";
import { getPersonas, isTeamComplete } from "@/db/data/personas";
import { setSetting } from "@/db/data/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `Bonsai — ${project.name}` : "Bonsai" };
}

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  await setSetting("active_project_id", project.id);

  if (!await isTeamComplete(Number(project.id))) {
    redirect(`/p/${slug}/onboard/team`);
  }

  const tickets = await getTickets(Number(project.id));
  if (tickets.length === 0) {
    redirect(`/p/${slug}/new-ticket`);
  }

  const personas = await getPersonas(Number(project.id));

  const ticketStats = {
    review: tickets.filter((t) => t.state === "review").length,
    planning: tickets.filter((t) => t.state === "planning").length,
    building: tickets.filter((t) => t.state === "building").length,
    test: tickets.filter((t) => t.state === "test").length,
    shipped: tickets.filter((t) => t.state === "shipped").length,
  };

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const awakePersonaIds = new Set(
    tickets
      .filter((t) => t.assignee && t.lastAgentActivity && (now - new Date(t.lastAgentActivity).getTime()) < 30 * 60 * 1000)
      .map((t) => t.assignee!.id)
  );

  return (
    <div className="flex flex-col h-full">
      <BoardActions
        project={project}
        shippedCount={ticketStats.shipped}
        hasCommands={!!(project.buildCommand && project.runCommand)}
      />
      <ProjectInfoPanel
        project={project}
        personas={personas}
        ticketStats={ticketStats}
        awakePersonaIds={awakePersonaIds}
      />
      <BoardView
        tickets={tickets}
        projectId={project.id}
        leadAvatar={personas.find((p) => p.role === "lead")?.avatar}
        leadName={personas.find((p) => p.role === "lead")?.name}
      />
    </div>
  );
}
