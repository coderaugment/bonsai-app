"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { SettingsPanel } from "./settings-panel";
import { ProjectsPanel } from "./projects-panel";
import { CompanyModal } from "../board/company-modal";
import { ProjectSettingsModal } from "../board/project-settings-modal";
import type { Project, AgentRun } from "@/types";
import { AgentActivityPanel } from "../board/agent-activity-panel";

function getNavItems(projectSlug?: string) {
  const boardHref = projectSlug ? `/p/${projectSlug}` : "/board";
  return [
    { icon: "ideas", label: "Ideas", href: "/ideas", matchPaths: ["/ideas"], excludePaths: [] as string[] },
    { icon: "board", label: "Project kanban board", href: boardHref, matchPaths: ["/board", "/p/"], excludePaths: [] as string[] },
  ];
}

function NavIcon({ icon, active }: { icon: string; active?: boolean }) {
  const base = active
    ? "text-[var(--accent-blue)]"
    : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]";

  switch (icon) {
    case "ideas":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      );
    case "board":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case "projects":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      );
    case "workers":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case "company":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showCompany, setShowCompany] = useState(false);
  const [companyProjectSlug, setCompanyProjectSlug] = useState("");
  const [companyPersonas, setCompanyPersonas] = useState<import("@/types").Persona[]>([]);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectSettingsData, setProjectSettingsData] = useState<Project | null>(null);
  const [clientName, setClientName] = useState(userName ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | undefined>(undefined);
  const [showActivity, setShowActivity] = useState(false);
  const [activeRunCount, setActiveRunCount] = useState(0);

  // Background poll for active agent count (lightweight, every 5s)
  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/agent-runs?limit=10");
        if (!cancelled) {
          const data = await res.json();
          const count = Array.isArray(data)
            ? data.filter((r: AgentRun) => r.status === "running").length
            : 0;
          setActiveRunCount(count);
        }
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Fetch fresh user data + active project slug client-side
  useEffect(() => {
    fetch("/api/onboard/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.name) setClientName(data.user.name);
        if (data.user?.avatarUrl) setAvatarUrl(data.user.avatarUrl);
      })
      .catch(() => {});
    fetch("/api/settings/project")
      .then((r) => r.json())
      .then((data) => {
        if (data?.slug) setActiveProjectSlug(data.slug);
      })
      .catch(() => {});
  }, []);

  const displayName = clientName || userName || "User";

  async function openProjectSettings() {
    try {
      const res = await fetch("/api/settings/project");
      const data = await res.json();
      if (data?.id) {
        setProjectSettingsData(data);
        setShowProjectSettings(true);
      }
    } catch {}
  }

  async function openCompany() {
    try {
      const projRes = await fetch("/api/settings/project");
      const activeProject = await projRes.json();
      setCompanyProjectSlug(activeProject?.slug || "");
      const pid = activeProject?.id;
      const personasUrl = pid ? `/api/personas?projectId=${pid}` : "/api/personas";
      const personasRes = await fetch(personasUrl);
      const personas = await personasRes.json();
      setCompanyPersonas(Array.isArray(personas) ? personas : []);
    } catch {}
    setShowCompany(true);
  }

  return (
    <aside
      className="relative flex flex-col items-center justify-between w-16 py-4 border-r"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Logo + App name */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <Image src="/bonsai-os-logo-l.png" alt="Bonsai" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <span
            className="text-[9px] font-semibold mt-1 tracking-wide uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Bonsai
          </span>
        </div>

        {/* Nav items */}
        {getNavItems(activeProjectSlug).map((item) => {
          const matchesPath = item.matchPaths.some((p) => pathname.startsWith(p) || pathname.includes(p));
          const excluded = item.excludePaths?.some((p) => pathname.includes(p));
          const isActive = matchesPath && !excluded;
          return (
            <button
              key={item.icon}
              onClick={() => router.push(item.href)}
              className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={
                isActive
                  ? { backgroundColor: "rgba(91, 141, 249, 0.1)" }
                  : undefined
              }
              title={item.label}
            >
              <NavIcon icon={item.icon} active={isActive} />
            </button>
          );
        })}

        {/* Agent Activity */}
        <button
          onClick={() => setShowActivity(!showActivity)}
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={showActivity ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
          title="Agent Activity"
        >
          <svg
            className={`w-5 h-5 ${showActivity ? "text-[var(--accent-blue)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 19.5h.01" />
          </svg>
          {activeRunCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
              style={{ backgroundColor: "#22c55e" }}
            >
              {activeRunCount}
            </span>
          )}
        </button>

        {/* Company */}
        <button
          onClick={openCompany}
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={showCompany ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
          title="Team"
        >
          <NavIcon icon="company" active={showCompany} />
        </button>

        {/* Projects */}
        <button
          onClick={() => setShowProjects(!showProjects)}
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={showProjects ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
          title="Projects"
        >
          <NavIcon icon="projects" active={showProjects} />
        </button>

        {/* Project Settings */}
        <button
          onClick={openProjectSettings}
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={showProjectSettings ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
          title="Project Settings"
        >
          <NavIcon icon="settings" active={showProjectSettings} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="w-9 h-9 rounded-full cursor-pointer hover:opacity-80 transition-opacity object-cover"
            style={settingsOpen ? { outline: "2px solid var(--accent-blue)", outlineOffset: "2px" } : undefined}
            title={displayName}
          />
        ) : (
          <div
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: "var(--accent-indigo)",
              ...(settingsOpen ? { outline: "2px solid var(--accent-blue)", outlineOffset: "2px" } : {}),
            }}
            title={displayName}
          >
            {displayName[0].toUpperCase()}
          </div>
        )}
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectsPanel open={showProjects} onClose={() => setShowProjects(false)} />
      <AgentActivityPanel open={showActivity} onClose={() => setShowActivity(false)} />
      <CompanyModal
        open={showCompany}
        onClose={() => setShowCompany(false)}
        projectSlug={companyProjectSlug}
        personas={companyPersonas}
      />
      {projectSettingsData && (
        <ProjectSettingsModal
          open={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
          project={projectSettingsData}
        />
      )}
    </aside>
  );
}
