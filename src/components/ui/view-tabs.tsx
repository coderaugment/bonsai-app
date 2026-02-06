"use client";

const viewTabs = [
  { id: "list", label: "List", icon: "list" },
  { id: "board", label: "Board", icon: "board" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
] as const;

function TabIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "list":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      );
    case "board":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      );
    default:
      return null;
  }
}

interface ViewTabsProps {
  active?: string;
  onChange?: (id: string) => void;
}

export function ViewTabs({ active = "board", onChange }: ViewTabsProps) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {viewTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange?.(tab.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={
            active === tab.id
              ? {
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-medium)",
                }
              : {
                  color: "var(--text-muted)",
                  border: "1px solid transparent",
                }
          }
        >
          <TabIcon icon={tab.icon} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
