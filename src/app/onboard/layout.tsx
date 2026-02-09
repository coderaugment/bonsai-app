import { redirect } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { getProject, getUser, isTeamComplete, hasTickets } from "@/db/queries";

export const dynamic = "force-dynamic";

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getUser();
  const project = getProject();

  // Fully onboarded → board
  if (user && project && isTeamComplete(Number(project.id)) && hasTickets()) {
    redirect("/board");
  }

  // Team done but no tickets → new ticket page (with sidebar visible)
  if (user && project && isTeamComplete(Number(project.id))) {
    redirect("/new-ticket");
  }

  return <Modal>{children}</Modal>;
}
