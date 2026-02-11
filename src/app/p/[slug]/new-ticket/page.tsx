import { redirect } from "next/navigation";
import { BoardHeader } from "@/components/board/board-header";
import { getProjectBySlug, getProjects, getUser, isTeamComplete } from "@/db/queries";
import { NewTicketForm } from "./new-ticket-form";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = getUser();
  if (!user) redirect("/onboard/welcome");

  const project = getProjectBySlug(slug);
  if (!project) redirect("/board");

  if (!isTeamComplete(Number(project.id))) redirect("/onboard/team");

  const allProjects = getProjects();

  return (
    <div className="flex flex-col h-full">
      <BoardHeader project={project} allProjects={allProjects} shippedCount={0} hasCommands={!!(project.buildCommand && project.runCommand)} />
      <NewTicketForm projectId={project.id} projectSlug={slug} />
    </div>
  );
}
