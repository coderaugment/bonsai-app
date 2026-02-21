import type { Project, Persona } from "@/types";

interface ProjectInfoPanelProps {
  project: Project;
  personas: Persona[];
  ticketStats: { planning: number; building: number; review: number; shipped: number };
  awakePersonaIds?: Set<string>;
  onPersonaClick?: (personaId: string) => void;
  onChatOpen?: () => void;
}

export function ProjectInfoPanel({ project, personas, ticketStats, awakePersonaIds = new Set(), onPersonaClick, onChatOpen }: ProjectInfoPanelProps) {
  const total = ticketStats.planning + ticketStats.building + ticketStats.review + ticketStats.shipped;

  return (
    <div
      className="border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-3 px-6 py-3">
        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {project.description || "Project details"}
        </span>

        <div className="flex items-center gap-4 ml-auto flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>{total} tickets</span>
            <span>{ticketStats.shipped} done</span>
          </div>
          <div className="flex items-center gap-3">
            {[...personas].sort((a, b) => {
              const aAwake = awakePersonaIds.has(a.id) ? 0 : 1;
              const bAwake = awakePersonaIds.has(b.id) ? 0 : 1;
              return aAwake - bAwake;
            }).map((p) => {
              const isAwake = awakePersonaIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 transition-all"
                  style={{
                    opacity: isAwake ? 1 : 0.45,
                    cursor: onPersonaClick ? "pointer" : "default",
                  }}
                  title={`${p.name} — ${isAwake ? "awake" : "asleep"} · Click to chat`}
                  onClick={() => onPersonaClick?.(p.id)}
                  onMouseEnter={(e) => {
                    if (onPersonaClick) (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
                  }}
                  onMouseLeave={(e) => {
                    if (onPersonaClick) (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                  }}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name[0]}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Chat button */}
            {onChatOpen && (
              <button
                onClick={onChatOpen}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{
                  backgroundColor: "rgba(91, 141, 249, 0.15)",
                  color: "var(--accent-blue)",
                }}
                title="Open project chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
