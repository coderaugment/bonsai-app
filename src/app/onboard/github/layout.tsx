import { redirect } from "next/navigation";
import { getUser } from "@/db/queries";

export default function GithubGuard({ children }: { children: React.ReactNode }) {
  if (!getUser()) redirect("/onboard/welcome");
  return <>{children}</>;
}
