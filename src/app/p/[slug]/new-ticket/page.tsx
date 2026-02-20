import { redirect } from "next/navigation";
import { getProjectBySlug } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";
import { NewTicketForm } from "./new-ticket-form";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) redirect("/board");

  if (!await isTeamComplete(Number(project.id))) redirect(`/p/${slug}/onboard/team`);

  return (
    <NewTicketForm
      projectId={project.id}
      projectSlug={slug}
    />
  );
}
