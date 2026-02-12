import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";
import { getProject } from "@/db/data/projects";

export default async function TeamGuard({ children }: { children: React.ReactNode }) {
  if (!await getUser()) redirect("/onboard/welcome");
  if (!await getProject()) redirect("/onboard/project");
  return <>{children}</>;
}
