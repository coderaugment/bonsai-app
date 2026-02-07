import { redirect } from "next/navigation";
import { getProject, getUser, isTeamComplete, hasTickets } from "@/db/queries";

export const dynamic = "force-dynamic";

export default function BoardPage() {
  const user = getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = getProject();
  if (!project) {
    redirect("/onboard/welcome");
  }

  if (!isTeamComplete()) {
    redirect("/onboard/team");
  }

  if (!hasTickets()) {
    redirect("/onboard/ticket");
  }

  redirect(`/p/${project.slug}`);
}
