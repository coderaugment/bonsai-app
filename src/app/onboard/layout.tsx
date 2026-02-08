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
  if (user && project && isTeamComplete() && hasTickets()) {
    redirect("/board");
  }

  // Team complete but no tickets → create first ticket (with sidebar visible)
  if (user && project && isTeamComplete()) {
    redirect("/new-ticket");
  }

  return <Modal>{children}</Modal>;
}
