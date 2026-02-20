import { redirect } from "next/navigation";
import { getProject } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";
import { hasTickets } from "@/db/data/tickets";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const project = await getProject();
  if (!project) {
    redirect("/onboard/github");
  }

  if (!await isTeamComplete(Number(project.id))) {
    redirect(`/p/${project.slug}/onboard/team`);
  }

  if (!await hasTickets()) {
    redirect("/onboard/ticket");
  }

  redirect(`/p/${project.slug}`);
}
