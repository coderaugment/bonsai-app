import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BoardHeader } from "@/components/board/board-header";
import { BoardView } from "@/components/board/board-view";
import { ProjectInfoPanel } from "@/components/board/project-info-panel";
import { getUser } from "@/db/data/users";
import { getProjectBySlug, getProjects } from "@/db/data/projects";
import { getTickets } from "@/db/data/tickets";
import { getPersonas, isTeamComplete } from "@/db/data/personas";
import { setSetting } from "@/db/data/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `Bonsai — ${project.name}` : "Bonsai" };
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  // Remember this as the active project BEFORE redirect guards,
  // so any downstream redirect (e.g. /new-ticket) knows which project is active
  await setSetting("active_project_id", project.id);

  if (!await isTeamComplete(Number(project.id))) {
    redirect("/onboard/team");
  }

  const tickets = await getTickets(Number(project.id));
  if (tickets.length === 0) {
    redirect(`/p/${slug}/new-ticket`);
  }

  const allProjects = await getProjects();
  const personas = await getPersonas(Number(project.id));

  const ticketStats = {
    research: tickets.filter((t) => t.state === "research").length,
    plan: tickets.filter((t) => t.state === "plan").length,
    build: tickets.filter((t) => t.state === "build").length,
    test: tickets.filter((t) => t.state === "test").length,
    ship: tickets.filter((t) => t.state === "ship").length,
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
      <BoardHeader
        project={project}
        allProjects={allProjects}
        shippedCount={ticketStats.ship}
        hasCommands={!!(project.buildCommand && project.runCommand)}
      />
      <ProjectInfoPanel
        project={project}
        personas={personas}
        ticketStats={ticketStats}
        awakePersonaIds={awakePersonaIds}
      />
      <BoardView tickets={tickets} projectId={project.id} />
    </div>
  );
}
