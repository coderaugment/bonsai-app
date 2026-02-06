"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { SettingsPanel } from "./settings-panel";
import { AddProjectModal } from "../board/add-project-modal";

const navItems = [
  { icon: "board", label: "Project kanban board", href: "/board" },
];

function NavIcon({ icon, active }: { icon: string; active?: boolean }) {
  const base = active
    ? "text-[var(--accent-blue)]"
    : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]";

  switch (icon) {
    case "board":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case "new-project":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [clientName, setClientName] = useState(userName ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fetch fresh user data client-side
  useEffect(() => {
    fetch("/api/onboard/user")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.name) setClientName(data.user.name);
        if (data.user?.avatarUrl) setAvatarUrl(data.user.avatarUrl);
      })
      .catch(() => {});
  }, []);

  const displayName = clientName || userName || "User";

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

        {/* New project */}
        <button
          onClick={() => setShowNewProject(true)}
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          title="Create new project"
        >
          <NavIcon icon="new-project" />
        </button>

        {/* Nav items */}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <button
              key={item.icon}
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
      </div>

      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="group w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={
            settingsOpen
              ? { backgroundColor: "rgba(91, 141, 249, 0.1)" }
              : undefined
          }
          title="Settings"
        >
          <NavIcon icon="settings" active={settingsOpen} />
        </button>

        {/* User avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-8 h-8 rounded-full mt-2 cursor-pointer hover:opacity-80 transition-opacity object-cover"
            title={displayName}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center mt-2 text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "var(--accent-indigo)" }}
            title={displayName}
          >
            {displayName[0].toUpperCase()}
          </div>
        )}
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AddProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} />
    </aside>
  );
}
