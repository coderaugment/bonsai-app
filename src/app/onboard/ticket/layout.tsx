import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";
import { getProject } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";

export default async function TicketGuard({ children }: { children: React.ReactNode }) {
  if (!await getUser()) redirect("/onboard/welcome");
  const project = await getProject();
  if (!project) redirect("/onboard/project");
  if (!await isTeamComplete(Number(project.id))) redirect("/onboard/team");
  // If all prerequisites met, use /new-ticket (with sidebar visible)
  redirect("/new-ticket");
  return <>{children}</>;
}
