import { redirect } from "next/navigation";
import { BoardHeader } from "@/components/board/board-header";
import { getUser } from "@/db/data/users";
import { getProjectBySlug, getProjects } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";
import { NewTicketForm } from "./new-ticket-form";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getUser();
  if (!user) redirect("/onboard/welcome");

  const project = await getProjectBySlug(slug);
  if (!project) redirect("/board");

  if (!await isTeamComplete(Number(project.id))) redirect(`/p/${slug}/onboard/team`);

  const allProjects = await getProjects();

  return (
    <div className="flex flex-col h-full">
      <BoardHeader project={project} allProjects={allProjects} shippedCount={0} hasCommands={!!(project.buildCommand && project.runCommand)} />
      <NewTicketForm projectId={project.id} projectSlug={slug} />
    </div>
  );
}
