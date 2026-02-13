import { redirect } from "next/navigation";
import { getProject } from "@/db/data/projects";

export const dynamic = "force-dynamic";

export default async function TeamRedirect() {
  const project = await getProject();
  if (!project) redirect("/onboard/project");
  redirect(`/p/${project.slug}/onboard/team`);
}
