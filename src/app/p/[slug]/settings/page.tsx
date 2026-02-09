import { redirect } from "next/navigation";
import { getProjectBySlug, getUser } from "@/db/queries";
import { ProjectSettings } from "@/components/project-settings";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = getUser();
  if (!user) redirect("/onboard/welcome");

  const project = getProjectBySlug(slug);
  if (!project) redirect("/board");

  return <ProjectSettings project={project} />;
}
