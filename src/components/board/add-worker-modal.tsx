"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

interface AddWorkerModalProps {
  open: boolean;
  onClose: () => void;
  projectSlug: string;
}

// Role template data - defines what each role CAN DO
const roleTemplates: Record<WorkerRole, {
  title: string;
  description: string;
  skills: string[];
  icon: React.ReactNode;
}> = {
  researcher: {
    title: "Research Analyst",
    description: "Investigates tickets before implementation. Explores the codebase, identifies constraints, and documents findings.",
    skills: [
      "Requirements analysis",
      "Codebase exploration",
      "Edge case identification",
      "Technical documentation",
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  developer: {
    title: "Software Developer",
    description: "Implements features and fixes bugs. Writes clean, tested code following project patterns.",
    skills: [
      "Code implementation",
      "Test writing",
      "Code review",
      "Debugging",
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  designer: {
    title: "Product Designer",
    description: "Creates user interfaces and experiences. Focuses on usability, accessibility, and visual design.",
    skills: [
      "UI/UX design",
      "Prototyping",
      "Design systems",
      "User research",
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  manager: {
    title: "Project Manager",
    description: "Coordinates work and removes blockers. Keeps the team aligned and stakeholders informed.",
    skills: [
      "Task coordination",
      "Sprint planning",
      "Stakeholder communication",
      "Risk management",
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  skeptic: {
    title: "Skeptic / Critic",
    description: "Challenges assumptions and stress-tests ideas. The constructive contrarian who asks the hard questions.",
    skills: [
      "Code review",
      "Risk assessment",
      "Edge case analysis",
      "Quality assurance",
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
};

type ModalStep = "select-role" | "customize";

export function AddWorkerModal({ open, onClose, projectSlug }: AddWorkerModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("select-role");
  const [selectedRole, setSelectedRole] = useState<WorkerRole | null>(null);
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const accent = selectedRole ? workerRoles[selectedRole].color : "#6366f1";

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (step === "customize") {
          setStep("select-role");
          setSelectedRole(null);
        } else {
          onClose();
        }
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, step, onClose]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setStep("select-role");
      setSelectedRole(null);
      setName("");
      setPersonality("");
      setAvatarUrl(null);
    }
  }, [open]);

  if (!open) return null;

  function handleSelectRole(role: WorkerRole) {
    setSelectedRole(role);
    setStep("customize");
  }

  async function handleGenerate() {
    if (!selectedRole) return;
    setGenerating(true);

    try {
      // Generate name + personality
      const genRes = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      const genData = await genRes.json();
      if (genData.name) setName(genData.name);
      if (genData.personality) setPersonality(genData.personality);

      // Generate avatar
      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genData.name || name,
          role: selectedRole,
          personality: genData.personality || personality,
        }),
      });
      const avatarData = await avatarRes.json();
      if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
    } catch {
      // Ignore errors
    }
    setGenerating(false);
  }

  async function handleCreate() {
    if (!name.trim() || !selectedRole) return;
    setSaving(true);

    await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        role: selectedRole,
        personality: personality.trim() || undefined,
        skills: [],
        processes: [],
        goals: [],
        permissions: { tools: [], folders: [] },
        avatar: avatarUrl || undefined,
      }),
    });

    setSaving(false);
    onClose();
    router.refresh();
  }

  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";

  // Step 1: Role Selection
  if (step === "select-role") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="w-[900px] max-h-[90vh] rounded-2xl flex flex-col overflow-hidden bg-[var(--bg-card)] border border-[var(--border-medium)]">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-subtle)]">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Add Team Member
              </h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Choose a role template to create a new worker
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Role Cards Grid */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(roleTemplates) as WorkerRole[]).map((role) => {
                const template = roleTemplates[role];
                const config = workerRoles[role];
                return (
                  <button
                    key={role}
                    onClick={() => handleSelectRole(role)}
                    className="group p-6 rounded-xl text-left transition-all border-2 hover:scale-[1.02]"
                    style={{
                      backgroundColor: "var(--bg-input)",
                      borderColor: "var(--border-medium)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = config.color;
                      e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${config.color} 8%, var(--bg-input))`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-medium)";
                      e.currentTarget.style.backgroundColor = "var(--bg-input)";
                    }}
                  >
                    {/* Icon + Title */}
                    <div className="flex items-start gap-4 mb-4">
                      <div
                        className="p-3 rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
                          color: config.color,
                        }}
                      >
                        {template.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                          {template.title}
                        </h3>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
                            color: config.color,
                          }}
                        >
                          {config.label}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                      {template.description}
                    </p>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1.5">
                      {template.skills.map((skill) => (
                        <span
                          key={skill}
                          className="text-xs px-2 py-1 rounded-md bg-white/5 text-[var(--text-muted)]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Customize Worker
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div
        className="w-[700px] max-h-[90vh] rounded-2xl flex flex-col overflow-hidden bg-[var(--bg-card)] border border-[var(--border-medium)]"
        style={{ borderTopWidth: "3px", borderTopColor: accent }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setStep("select-role"); setSelectedRole(null); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                New {selectedRole && roleTemplates[selectedRole].title}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Generate or customize their identity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex gap-8">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              {avatarUrl ? (
                <div className="relative">
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-36 h-36 rounded-full object-cover border-2"
                    style={{ borderColor: accent }}
                  />
                  <button
                    onClick={() => setAvatarUrl(null)}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div
                  className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {generating ? (
                    <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    initial
                  )}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-white/5 disabled:opacity-40 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                {generating ? "Generating..." : "Generate Identity"}
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 space-y-5">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maya, Atlas, Nova..."
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  style={{ "--accent": accent } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
                  Personality & Background
                </label>
                <textarea
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder={selectedRole ? workerRoles[selectedRole].placeholder : "Describe their personality..."}
                  rows={8}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] font-mono leading-relaxed"
                  style={{ "--accent": accent } as React.CSSProperties}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => { setStep("select-role"); setSelectedRole(null); }}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/5"
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            {saving ? "Creating..." : "Create Worker"}
          </button>
        </div>
      </div>
    </div>
  );
}
