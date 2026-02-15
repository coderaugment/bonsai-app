import { redirect } from "next/navigation";
import { getProjectBySlug } from "@/db/data/projects";
import { ProjectSettings } from "@/components/project-settings";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) redirect("/board");

  return <ProjectSettings project={project} />;
}
