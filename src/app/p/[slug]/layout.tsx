import { redirect } from "next/navigation";
import { getUser } from "@/db/data/users";
import { getProjectBySlug, getProjects } from "@/db/data/projects";
import { ProjectHeader } from "@/components/layout/project-header";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getUser();
  if (!user) {
    redirect("/onboard/welcome");
  }

  const project = await getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  const allProjects = await getProjects();

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader project={project} allProjects={allProjects} />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
