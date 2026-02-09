import { redirect } from "next/navigation";
import { getProjectBySlug, getUser } from "@/db/queries";
import { WorkersView } from "@/components/board/workers-view";

export const dynamic = "force-dynamic";

export default async function ProjectWorkersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = getUser();
  if (!user) redirect("/onboard/welcome");

  const project = getProjectBySlug(slug);
  if (!project) redirect("/board");

  return <WorkersView projectId={Number(project.id)} />;
}
