import { redirect } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { getUser } from "@/db/data/users";
import { getProject } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";
import { hasTickets } from "@/db/data/tickets";

export const dynamic = "force-dynamic";

export default async function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const project = await getProject();

  // Fully onboarded → board
  if (user && project && await isTeamComplete(Number(project.id)) && await hasTickets()) {
    redirect(`/p/${project.slug}`);
  }

  // Team done but no tickets → new ticket page (with sidebar visible)
  if (user && project && await isTeamComplete(Number(project.id))) {
    redirect(`/p/${project.slug}/new-ticket`);
  }

  return <Modal>{children}</Modal>;
}
