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
  if (user && project && isTeamComplete() && hasTickets()) {
    redirect("/board");
  }

  return <Modal>{children}</Modal>;
}
