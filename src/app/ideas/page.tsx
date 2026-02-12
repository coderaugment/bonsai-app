import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";
import { getProject, getProjects } from "@/db/data/projects";
import { IdeasShell } from "./ideas-shell";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const user = await getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = await getProject();
  if (!project) {
    redirect("/board");
  }

  const allProjects = await getProjects();

  return <IdeasShell project={project} allProjects={allProjects} />;
}
