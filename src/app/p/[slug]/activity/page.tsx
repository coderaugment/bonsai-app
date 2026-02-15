import { AgentActivityView } from "@/components/board/agent-activity-view";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AgentActivityView projectSlug={slug} />;
}
