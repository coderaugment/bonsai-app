import { redirect } from "next/navigation";
import { BoardHeader } from "@/components/board/board-header";
import { BoardView } from "@/components/board/board-view";
import { ProjectInfoPanel } from "@/components/board/project-info-panel";
import { getProjectBySlug, getProjects, getTickets, getPersonas, getUser, setSetting, isTeamComplete, hasTickets } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  if (!isTeamComplete()) {
    redirect("/onboard/team");
  }

  if (!hasTickets()) {
    redirect("/onboard/ticket");
  }

  // Remember this as the active project for /board redirect
  setSetting("active_project_id", project.id);

  const allProjects = getProjects();
  const tickets = getTickets(Number(project.id));
  const personas = getPersonas(Number(project.id));

  const ticketStats = {
    research: tickets.filter((t) => t.state === "research").length,
    plan: tickets.filter((t) => t.state === "plan").length,
    build: tickets.filter((t) => t.state === "build").length,
    test: tickets.filter((t) => t.state === "test").length,
    ship: tickets.filter((t) => t.state === "ship").length,
  };

  return (
    <div className="flex flex-col h-full">
      <BoardHeader project={project} allProjects={allProjects} />
      <ProjectInfoPanel project={project} personas={personas} ticketStats={ticketStats} />
      <BoardView tickets={tickets} projectId={project.id} />
    </div>
  );
}
