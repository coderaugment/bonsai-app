import { redirect } from "next/navigation";
import { getUser, getProject } from "@/db/queries";

export default function TeamGuard({ children }: { children: React.ReactNode }) {
  if (!getUser()) redirect("/onboard/welcome");
  if (!getProject()) redirect("/onboard/project");
  return <>{children}</>;
}
