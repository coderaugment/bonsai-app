import { redirect } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { getProject, getUser } from "@/db/queries";

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getUser();
  const project = getProject();
  if (user && project) {
    redirect("/board");
  }

  return <Modal>{children}</Modal>;
}
