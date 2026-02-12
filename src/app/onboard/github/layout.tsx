import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";

export default async function GithubGuard({ children }: { children: React.ReactNode }) {
  if (!await getUser()) redirect("/onboard/welcome");
  return <>{children}</>;
}
