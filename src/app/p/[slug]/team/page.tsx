import { TeamView } from "@/components/board/team-view";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TeamView projectSlug={slug} />;
}
