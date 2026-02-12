import { redirect } from "next/navigation";
import { getProject } from "@/db/data/projects";

export const dynamic = "force-dynamic";

export default async function OldNewTicketRedirect() {
  const project = await getProject();
  if (project) redirect(`/p/${project.slug}/new-ticket`);
  redirect("/board");
}
