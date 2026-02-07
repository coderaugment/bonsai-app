import { redirect } from "next/navigation";
import { BoardHeader } from "@/components/board/board-header";
import { BoardView } from "@/components/board/board-view";
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

  return (
    <div className="flex flex-col h-full">
      <BoardHeader project={project} allProjects={allProjects} personas={personas} />
      <BoardView tickets={tickets} projectId={project.id} />
    </div>
  );
}
