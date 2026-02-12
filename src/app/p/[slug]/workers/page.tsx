import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";
import { getProjectBySlug } from "@/db/data/projects";
import { WorkersView } from "@/components/board/workers-view";

export const dynamic = "force-dynamic";

export default async function ProjectWorkersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getUser();
  if (!user) redirect("/onboard/welcome");

  const project = await getProjectBySlug(slug);
  if (!project) redirect("/board");

  return <WorkersView projectId={Number(project.id)} />;
}
