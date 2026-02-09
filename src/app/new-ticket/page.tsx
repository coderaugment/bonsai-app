import { redirect } from "next/navigation";
import { getSetting } from "@/db/queries";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default function OldNewTicketRedirect() {
  const activeId = getSetting("active_project_id");
  if (activeId) {
    const project = db.select().from(projects).where(eq(projects.id, Number(activeId))).get();
    if (project) redirect(`/p/${project.slug}/new-ticket`);
  }
  // Fallback: first project
  const first = db.select().from(projects).limit(1).get();
  if (first) redirect(`/p/${first.slug}/new-ticket`);
  redirect("/board");
}
