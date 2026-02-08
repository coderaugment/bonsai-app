import { redirect } from "next/navigation";
import { getUser, getProject, isTeamComplete } from "@/db/queries";

export default function TicketGuard({ children }: { children: React.ReactNode }) {
  if (!getUser()) redirect("/onboard/welcome");
  if (!getProject()) redirect("/onboard/project");
  if (!isTeamComplete()) redirect("/onboard/team");
  // If all prerequisites met, use /new-ticket (with sidebar visible)
  redirect("/new-ticket");
  return <>{children}</>;
}
