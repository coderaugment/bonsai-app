import type { Project, Persona } from "@/types";

interface ProjectInfoPanelProps {
  project: Project;
  personas: Persona[];
  ticketStats: { review: number; planning: number; building: number; test: number; shipped: number };
  awakePersonaIds?: Set<string>;
}

export function ProjectInfoPanel({ project, personas, ticketStats, awakePersonaIds = new Set() }: ProjectInfoPanelProps) {
  const total = ticketStats.review + ticketStats.planning + ticketStats.building + ticketStats.test + ticketStats.shipped;

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
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 transition-opacity"
                  style={{ opacity: isAwake ? 1 : 0.45 }}
                  title={`${p.name} — ${isAwake ? "awake" : "asleep"}`}
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
          </div>
        </div>
      </div>
    </div>
  );
}
