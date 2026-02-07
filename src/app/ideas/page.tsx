import { redirect } from "next/navigation";
import { getProject, getProjects, getUser } from "@/db/queries";
import { IdeasShell } from "./ideas-shell";

export const dynamic = "force-dynamic";

export default function IdeasPage() {
  const user = getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = getProject();
  if (!project) {
    redirect("/board");
  }

  const allProjects = getProjects();

  return <IdeasShell project={project} allProjects={allProjects} />;
}
