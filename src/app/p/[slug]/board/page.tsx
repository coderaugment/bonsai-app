import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { BoardContainer } from "@/components/board/board-container";
import { getProjectBySlug } from "@/db/data/projects";
import { getTickets } from "@/db/data/tickets";
import { getPersonas, isTeamComplete } from "@/db/data/personas";
import { setSetting } from "@/db/data/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  return { title: project ? `Bonsai — ${project.name}` : "Bonsai" };
}

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  await setSetting("active_project_id", project.id);

  if (!await isTeamComplete(Number(project.id))) {
    redirect(`/p/${slug}/onboard/team`);
  }

  const tickets = await getTickets(Number(project.id));
  const visibleTickets = tickets.filter((t) => !t.isEpic);
  if (visibleTickets.length === 0) {
    redirect(`/p/${slug}/new-ticket`);
  }

  const personas = await getPersonas(Number(project.id));

  const ticketStats = {
    planning: visibleTickets.filter((t) => t.state === "planning").length,
    building: visibleTickets.filter((t) => t.state === "building").length,
    review: visibleTickets.filter((t) => t.state === "review").length,
    shipped: visibleTickets.filter((t) => t.state === "shipped").length,
  };

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const awakePersonaIds = [...new Set(
    tickets
      .filter((t) => t.assignee && t.lastAgentActivity && (now - new Date(t.lastAgentActivity).getTime()) < 30 * 60 * 1000)
      .map((t) => t.assignee!.id)
  )];

  return (
    <BoardContainer
      project={project}
      tickets={tickets}
      personas={personas}
      ticketStats={ticketStats}
      awakePersonaIds={awakePersonaIds}
    />
  );
}
