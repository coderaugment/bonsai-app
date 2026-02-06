import { redirect } from "next/navigation";
import { getProject, getUser } from "@/db/queries";

export default function BoardPage() {
  const user = getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = getProject();
  if (!project) {
    redirect("/onboard/welcome");
  }

  redirect(`/p/${project.slug}`);
}
