"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { Role, Persona, ClaudeSkillDefinition } from "@/types";
import { ConfirmDelete } from "@/components/ui/confirm-delete";

const PROMPT_LABELS: Record<string, string> = {
  prompt_role_researcher: "Role: Researcher",
  prompt_role_developer: "Role: Developer",
  prompt_role_designer: "Role: Designer",
  prompt_role_critic: "Role: Critic",
  prompt_role_hacker: "Role: Hacker",
  prompt_phase_planning: "Phase: Planning",
  prompt_phase_research: "Phase: Research",
  prompt_phase_research_critic: "Phase: Research Critic",
  prompt_phase_implementation: "Phase: Implementation",
  prompt_phase_test: "Phase: Test",
  prompt_phase_designer: "Phase: Designer",
  prompt_phase_conversational: "Phase: Conversational",
  prompt_dispatch_researcher_v3: "Dispatch: Researcher v3",
  prompt_dispatch_critic_v2: "Dispatch: Critic v2",
  prompt_dispatch_plan_critic: "Dispatch: Plan Critic",
  prompt_dispatch_plan_hacker: "Dispatch: Plan Hacker",
};

const ROLE_PROMPT_MAP: Record<string, string[]> = {
  researcher: ["prompt_role_researcher", "prompt_phase_research", "prompt_dispatch_researcher_v3"],
  developer: ["prompt_role_developer", "prompt_phase_planning", "prompt_phase_implementation", "prompt_phase_test"],
  designer: ["prompt_role_designer", "prompt_phase_designer"],
  critic: ["prompt_role_critic", "prompt_phase_research_critic", "prompt_dispatch_critic_v2", "prompt_dispatch_plan_critic"],
  hacker: ["prompt_role_hacker", "prompt_dispatch_plan_hacker"],
};

const EVENT_PROMPT_LABELS: Record<string, string> = {
  prompt_lead_new_ticket: "new-ticket",
  prompt_researcher_new_ticket: "new-ticket",
  prompt_developer_new_ticket: "new-ticket",
  prompt_lead_new_epic: "new-epic",
  prompt_researcher_epic_subtask: "epic-subtask",
  prompt_developer_epic_subtask: "epic-subtask",
};

const ROLE_EVENT_PROMPT_MAP: Record<string, string[]> = {
  lead: ["prompt_lead_new_ticket", "prompt_lead_new_epic"],
  researcher: ["prompt_researcher_new_ticket", "prompt_researcher_epic_subtask"],
  developer: ["prompt_developer_new_ticket", "prompt_developer_epic_subtask"],
};

function getSharedRoles(promptKey: string, currentSlug: string): string[] {
  const shared: string[] = [];
  for (const [slug, keys] of Object.entries(ROLE_PROMPT_MAP)) {
    if (slug !== currentSlug && keys.includes(promptKey)) {
      shared.push(slug);
    }
  }
  return shared;
}

interface PromptData {
  value: string;
  isDefault: boolean;
}

type Tab = "workers" | "roles" | "edit-worker";

export function TeamView({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("workers");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "non-binary">("male");
  const [appearance, setAppearance] = useState("");
  const [commStyle, setCommStyle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<"" | "text" | "avatar">("");
  const [rerolling, setRerolling] = useState<"" | "name" | "appearance" | "style" | "avatar">("");
  const [saving, setSaving] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    title: "",
    slug: "",
    description: "",
    color: "#6366f1",
    skillDefinitions: [] as ClaudeSkillDefinition[],
  });
  const [savingRole, setSavingRole] = useState(false);
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);

  const [prompts, setPrompts] = useState<Record<string, PromptData>>({});
  const [promptDefaults, setPromptDefaults] = useState<Record<string, string>>({});
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);

  const [roleContexts, setRoleContexts] = useState<Record<string, PromptData>>({});
  const [roleContextEdit, setRoleContextEdit] = useState<string | undefined>(undefined);
  const [savingContext, setSavingContext] = useState(false);

  const [eventPrompts, setEventPrompts] = useState<Record<string, PromptData>>({});
  const [eventPromptEdits, setEventPromptEdits] = useState<Record<string, string>>({});
  const [expandedEventPrompt, setExpandedEventPrompt] = useState<string | null>(null);
  const [savingEventPrompt, setSavingEventPrompt] = useState<string | null>(null);

  const [allEventDefaults, setAllEventDefaults] = useState<Record<string, string>>({});

  async function fetchData() {
    setLoading(true);
    try {
      const [rolesRes, personasRes] = await Promise.all([
        fetch("/api/roles"),
        fetch(`/api/personas?projectSlug=${projectSlug}`),
      ]);
      setRoles(await rolesRes.json());
      const personasData = await personasRes.json();
      setPersonas(Array.isArray(personasData) ? personasData : []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
    setLoading(false);
  }

  async function fetchPrompts() {
    try {
      const [promptsRes, eventRes] = await Promise.all([
        fetch("/api/settings/prompts"),
        fetch("/api/settings/event-prompts"),
      ]);
      const promptsData = await promptsRes.json();
      setPrompts(promptsData.prompts || {});
      setPromptDefaults(promptsData.defaults || {});
      const eventData = await eventRes.json();
      setRoleContexts(eventData.contexts || {});
      setEventPrompts(eventData.prompts || {});
      setAllEventDefaults(eventData.defaults || {});
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  function handleSelectRoleForCreate(role: Role) {
    setEditingPersona({ id: "", name: "", slug: "", color: role.color, role: role.slug, roleId: role.id } as Persona);
    setSelectedRole(role);
    setName("");
    setGender("male");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl(null);
    setTab("edit-worker");
  }

  function splitPersonality(p: string): [string, string] {
    const parts = p.split("\n\n");
    return [parts[0]?.trim() || "", parts.slice(1).join("\n\n").trim()];
  }

  function joinPersonality(app: string, comm: string): string {
    return [app.trim(), comm.trim()].filter(Boolean).join("\n\n");
  }

  function getRoleSlug(): string {
    if (editingPersona) {
      const role = roles.find((r) => r.id === editingPersona.roleId)
        || roles.find((r) => r.slug === editingPersona.role);
      return role?.slug || editingPersona.role || "developer";
    }
    return selectedRole?.slug || "developer";
  }

  async function rerollIdentity() {
    setRerolling("name");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: getRoleSlug(), field: "appearance", name: name.trim() || undefined, gender, existingNames: personas.map((p) => p.name) }),
      });
      const data = await res.json();
      if (data.name) setName(data.name);
      if (data.appearance) setAppearance(data.appearance);
    } catch {}
    setRerolling("");
  }

  async function rerollStyle() {
    setRerolling("style");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: getRoleSlug(), field: "style", name: name.trim() || undefined, gender, existingNames: personas.map((p) => p.name) }),
      });
      const data = await res.json();
      if (data.style) setCommStyle(data.style);
    } catch {}
    setRerolling("");
  }

  async function rerollAvatar() {
    setRerolling("avatar");
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role: getRoleSlug(),
          personality: joinPersonality(appearance, commStyle),
        }),
      });
      const data = await res.json();
      if (data.avatar) setAvatarUrl(data.avatar);
    } catch {}
    setRerolling("");
  }

  function startEditWorker(persona: Persona) {
    setEditingPersona(persona);
    setName(persona.name);
    const [app, comm] = splitPersonality(persona.personality || "");
    setAppearance(app);
    setCommStyle(comm);
    setAvatarUrl(persona.avatar || null);
    const role = roles.find((r) => r.id === persona.roleId)
      || roles.find((r) => r.slug === persona.role);
    setSelectedRole(role || null);
    setTab("edit-worker");
  }

  async function handleRegenerateForEdit() {
    if (!editingPersona) return;
    const role = roles.find((r) => r.id === editingPersona.roleId)
      || roles.find((r) => r.slug === editingPersona.role);
    const roleSlug = role?.slug || editingPersona.role || "developer";

    setGenerating(true);
    setGeneratingPhase("text");
    try {
      const genRes = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleSlug, name: name.trim() || undefined, gender, existingNames: personas.map((p) => p.name) }),
      });
      const genData = await genRes.json();
      if (genData.name) setName(genData.name);
      if (genData.appearance) setAppearance(genData.appearance);
      if (genData.style) setCommStyle(genData.style);

      setGeneratingPhase("avatar");
      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genData.name || name,
          role: roleSlug,
          personality: genData.appearance || appearance,
        }),
      });
      const avatarData = await avatarRes.json();
      if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
    } catch {}
    setGenerating(false);
    setGeneratingPhase("");
  }

  async function handleSaveWorker() {
    if (!editingPersona || !name.trim()) return;
    setSaving(true);
    try {
      const isCreate = !editingPersona.id;
      if (isCreate) {
        const role = selectedRole || roles.find((r) => r.id === editingPersona.roleId);
        await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            roleId: role?.id,
            role: role?.slug || editingPersona.role || "developer",
            personality: joinPersonality(appearance, commStyle) || undefined,
            avatar: avatarUrl || undefined,
            skills: [],
            processes: [],
            goals: [],
            permissions: { tools: [], folders: [] },
          }),
        });
      } else {
        await fetch("/api/personas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingPersona.id,
            name: name.trim(),
            personality: joinPersonality(appearance, commStyle) || undefined,
            avatar: avatarUrl || undefined,
          }),
        });
      }
      setTab("workers");
      setEditingPersona(null);
      setSelectedRole(null);
      setName("");
      setGender("male");
      setAppearance("");
      setCommStyle("");
      setAvatarUrl(null);
      router.refresh();
    } catch {}
    setSaving(false);
  }

  function startEditRole(role: Role | null) {
    setEditingSkillIndex(null);
    setExpandedPrompt(null);
    setPromptEdits({});
    setRoleContextEdit(undefined);
    setExpandedEventPrompt(null);
    setEventPromptEdits({});
    if (role) {
      setEditingRole(role);
      setRoleForm({
        title: role.title,
        slug: role.slug,
        description: role.description || "",
        color: role.color,
        skillDefinitions: role.skillDefinitions || [],
      });
      fetchPrompts();
    } else {
      setEditingRole({ id: 0 } as Role);
      setRoleForm({
        title: "",
        slug: "",
        description: "",
        color: "#6366f1",
        skillDefinitions: [],
      });
    }
  }

  function validateSkillContent(content: string): { valid: boolean; error?: string; name?: string } {
    if (!content.trim()) return { valid: false, error: "Content is required" };
    if (!content.startsWith("---")) return { valid: false, error: "Must start with YAML frontmatter (---)" };
    const frontmatterEnd = content.indexOf("---", 3);
    if (frontmatterEnd === -1) return { valid: false, error: "Missing closing --- for frontmatter" };
    const frontmatter = content.substring(3, frontmatterEnd);
    const nameMatch = frontmatter.match(/name:\s*([^\n]+)/);
    if (!nameMatch) return { valid: false, error: "Missing 'name' field in frontmatter" };
    const skillName = nameMatch[1].trim();
    if (!skillName) return { valid: false, error: "Name cannot be empty" };
    if (skillName.length > 64) return { valid: false, error: "Name must be 64 chars or less" };
    if (!/^[a-z0-9-]+$/.test(skillName)) return { valid: false, error: "Name: only lowercase letters, numbers, hyphens" };
    return { valid: true, name: skillName };
  }

  function addNewSkill() {
    const template = `---\nname: new-skill\ndescription: What this skill does\n---\n\nYour skill instructions here...\n`;
    const newSkill: ClaudeSkillDefinition = { name: "new-skill", description: "", content: template };
    setRoleForm({ ...roleForm, skillDefinitions: [...roleForm.skillDefinitions, newSkill] });
    setEditingSkillIndex(roleForm.skillDefinitions.length);
  }

  function updateSkillContent(index: number, content: string) {
    const newSkills = [...roleForm.skillDefinitions];
    const validation = validateSkillContent(content);
    newSkills[index] = { ...newSkills[index], content, name: validation.name || newSkills[index].name };
    setRoleForm({ ...roleForm, skillDefinitions: newSkills });
  }

  function removeSkill(index: number) {
    setRoleForm({ ...roleForm, skillDefinitions: roleForm.skillDefinitions.filter((_, i) => i !== index) });
    setEditingSkillIndex(null);
  }

  async function handleSavePrompt(key: string) {
    const value = promptEdits[key];
    if (value === undefined) return;
    setSavingPrompt(key);
    try {
      await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setPrompts({ ...prompts, [key]: { value, isDefault: false } });
      setPromptEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      console.error("Failed to save prompt:", err);
    }
    setSavingPrompt(null);
  }

  async function handleResetPrompt(key: string) {
    setSavingPrompt(key);
    try {
      const res = await fetch("/api/settings/prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      setPrompts({ ...prompts, [key]: { value: data.value || promptDefaults[key] || "", isDefault: true } });
      setPromptEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      console.error("Failed to reset prompt:", err);
    }
    setSavingPrompt(null);
  }

  async function handleSaveEventPrompt(key: string) {
    const value = eventPromptEdits[key];
    if (value === undefined) return;
    setSavingEventPrompt(key);
    try {
      await fetch("/api/settings/event-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setEventPrompts({ ...eventPrompts, [key]: { value, isDefault: false } });
      setEventPromptEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      console.error("Failed to save event prompt:", err);
    }
    setSavingEventPrompt(null);
  }

  async function handleResetEventPrompt(key: string) {
    setSavingEventPrompt(key);
    try {
      const res = await fetch("/api/settings/event-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      setEventPrompts({ ...eventPrompts, [key]: { value: data.value || allEventDefaults[key] || "", isDefault: true } });
      setEventPromptEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err) {
      console.error("Failed to reset event prompt:", err);
    }
    setSavingEventPrompt(null);
  }

  async function handleSaveContext(key: string, value: string) {
    setSavingContext(true);
    try {
      await fetch("/api/settings/event-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setRoleContexts({ ...roleContexts, [key]: { value, isDefault: false } });
      setRoleContextEdit(undefined);
    } catch (err) {
      console.error("Failed to save context:", err);
    }
    setSavingContext(false);
  }

  async function handleResetContext(key: string) {
    setSavingContext(true);
    try {
      const res = await fetch("/api/settings/event-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      setRoleContexts({ ...roleContexts, [key]: { value: data.value || allEventDefaults[key] || "", isDefault: true } });
      setRoleContextEdit(undefined);
    } catch (err) {
      console.error("Failed to reset context:", err);
    }
    setSavingContext(false);
  }

  async function handleDeleteWorker(personaId: string) {
    try {
      const res = await fetch(`/api/personas?id=${personaId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        console.error(data.error || "Failed to delete worker");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to delete worker:", err);
    }
  }

  async function handleSaveRole() {
    if (!roleForm.title.trim()) return;
    setSavingRole(true);
    try {
      const isNew = !editingRole?.id;
      const method = isNew ? "POST" : "PUT";
      const body = {
        ...(isNew ? {} : { id: editingRole!.id }),
        title: roleForm.title.trim(),
        slug: roleForm.slug.trim() || roleForm.title.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        description: roleForm.description.trim(),
        color: roleForm.color,
        skillDefinitions: roleForm.skillDefinitions,
      };
      const res = await fetch("/api/roles", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const role = await res.json();
      if (isNew) {
        setRoles([...roles, role]);
      } else {
        setRoles(roles.map((r) => (r.id === role.id ? role : r)));
      }
      setEditingRole(null);
    } catch (err) {
      console.error("Failed to save role:", err);
    }
    setSavingRole(false);
  }

  async function handleDeleteRole(id: number) {
    try {
      await fetch(`/api/roles?id=${id}`, { method: "DELETE" });
      setRoles(roles.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete role:", err);
    }
  }

  const workersByRoleId = personas.reduce((acc, p) => {
    const roleId = p.roleId || 0;
    acc[roleId] = acc[roleId] || [];
    acc[roleId].push(p);
    return acc;
  }, {} as Record<number, Persona[]>);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-primary)]">
        <div className="p-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Team</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Workers & Archetypes</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => { setTab("workers"); setEditingRole(null); }}
            className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left flex items-center gap-3 transition-colors ${
              tab === "workers" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            Workers
            <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded">{personas.length}</span>
          </button>

          <button
            onClick={() => { setTab("roles"); setEditingRole(null); }}
            className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left flex items-center gap-3 transition-colors ${
              tab === "roles" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
            </svg>
            Roles
            <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded">{roles.length}</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Workers Tab */}
        {tab === "workers" && (
          <>
            <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Team Roster</h3>
                <p className="text-sm text-[var(--text-muted)]">Your project&apos;s workers</p>
              </div>
              <button
                onClick={() => setTab("roles")}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Worker
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {personas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                  </div>
                  <h4 className="text-[var(--text-primary)] font-medium mb-1">No workers yet</h4>
                  <p className="text-sm text-[var(--text-muted)] mb-4">Add team members to get started</p>
                  <button
                    onClick={() => setTab("roles")}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90"
                  >
                    Add Your First Worker
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {personas.map((persona) => {
                    const role = roles.find((r) => r.id === persona.roleId);
                    const color = role?.color || persona.color;
                    return (
                      <div
                        key={persona.id}
                        className="group relative p-5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] hover:border-[var(--border-subtle)] transition-colors"
                      >
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => startEditWorker(persona)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10"
                            title="Edit worker"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <ConfirmDelete onDelete={() => handleDeleteWorker(persona.id)} />
                        </div>
                        <div className="flex items-start gap-4">
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white overflow-hidden flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {persona.avatar ? (
                              <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" />
                            ) : (
                              persona.name[0].toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-[var(--text-primary)]">{persona.name}</h4>
                            <span
                              className="inline-block text-xs font-medium px-2 py-0.5 rounded mt-1"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                                color: color,
                              }}
                            >
                              {role?.title || persona.role}
                            </span>
                            {persona.personality && (
                              <div className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2 prose prose-invert prose-xs max-w-none">
                                <ReactMarkdown
                                  components={{
                                    p: ({ children }) => <span>{children}</span>,
                                    strong: ({ children }) => <strong className="font-semibold text-white/80">{children}</strong>,
                                    em: ({ children }) => <em>{children}</em>,
                                    h1: ({ children }) => <span className="font-bold">{children}</span>,
                                    h2: ({ children }) => <span className="font-bold">{children}</span>,
                                    h3: ({ children }) => <span className="font-bold">{children}</span>,
                                  }}
                                >
                                  {persona.personality}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Roles Tab */}
        {tab === "roles" && !editingRole && (
          <>
            <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Role Archetypes</h3>
                <p className="text-sm text-[var(--text-muted)]">Templates for generating workers</p>
              </div>
              <button
                onClick={() => startEditRole(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Role
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {roles.map((role) => {
                  const workers = workersByRoleId[role.id] || [];
                  return (
                    <div key={role.id} className="p-5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-input)] hover:border-[var(--border-subtle)] transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold text-white" style={{ backgroundColor: role.color }}>
                            {role.title[0]}
                          </div>
                          <div>
                            <h4 className="font-semibold text-[var(--text-primary)] text-sm">{role.title}</h4>
                            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5" style={{ backgroundColor: `color-mix(in srgb, ${role.color} 20%, transparent)`, color: role.color }}>
                              {role.slug}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditRole(role); }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
                            title="Edit archetype"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectRoleForCreate(role); }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 flex items-center gap-1"
                            style={{ backgroundColor: role.color, color: "white" }}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Hire
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2">{role.description}</p>
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                          {role.skillDefinitions?.length || 0} skills
                        </span>
                        {workers.length > 0 && (
                          <span className="flex items-center gap-1">
                            {workers.slice(0, 3).map((w) => (
                              <div key={w.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white overflow-hidden -ml-1 first:ml-0 border border-[var(--bg-input)]" style={{ backgroundColor: role.color }} title={w.name}>
                                {w.avatar ? <img src={w.avatar} alt={w.name} className="w-full h-full object-cover" /> : w.name[0].toUpperCase()}
                              </div>
                            ))}
                            {workers.length > 3 && <span className="text-[10px] text-[var(--text-muted)]">+{workers.length - 3}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Edit/Create Role */}
        {tab === "roles" && editingRole && (
          <>
            <div className="flex items-center gap-3 px-8 py-5 border-b border-[var(--border-subtle)]">
              <button onClick={() => setEditingRole(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {editingRole.id ? `Edit ${editingRole.title}` : "New Role"}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">Configure role archetype</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-2xl space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Title</label>
                    <input value={roleForm.title} onChange={(e) => setRoleForm({ ...roleForm, title: e.target.value })} placeholder="e.g. Software Developer" className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Color</label>
                    <div className="flex gap-2">
                      {["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"].map((c) => (
                        <button key={c} type="button" onClick={() => setRoleForm({ ...roleForm, color: c })} className={`w-8 h-8 rounded-full transition-transform ${roleForm.color === c ? "scale-110 ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Description</label>
                  <textarea value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="What this role does..." rows={2} className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-none" />
                </div>

                {/* Claude Code Skills */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)]">Claude Code Skills</label>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">YAML frontmatter + markdown instructions</p>
                    </div>
                    <button type="button" onClick={addNewSkill} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-[var(--text-secondary)] hover:bg-white/15 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Add Skill
                    </button>
                  </div>
                  {roleForm.skillDefinitions.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-[var(--border-medium)] text-center">
                      <p className="text-xs text-[var(--text-muted)]">No skills defined</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {roleForm.skillDefinitions.map((skill, idx) => {
                        const validation = validateSkillContent(skill.content);
                        const isExpanded = editingSkillIndex === idx;
                        return (
                          <div key={idx} className="rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5" onClick={() => setEditingSkillIndex(isExpanded ? null : idx)}>
                              <div className="flex items-center gap-2">
                                <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                <span className="text-sm font-medium text-[var(--text-primary)]">/{validation.name || skill.name || "unnamed"}</span>
                                {!validation.valid && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{validation.error}</span>}
                              </div>
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeSkill(idx); }} className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="px-3 pb-3 border-t border-[var(--border-subtle)]">
                                <textarea value={skill.content} onChange={(e) => updateSkillContent(idx, e.target.value)} rows={12} className="w-full mt-3 px-3 py-2 rounded-lg text-sm font-mono bg-[var(--bg-primary)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-y" style={{ minHeight: "200px" }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Agent Prompts */}
                {(() => {
                  const slug = editingRole?.slug || roleForm.slug;
                  const promptKeys = ROLE_PROMPT_MAP[slug];
                  if (!promptKeys) {
                    return slug ? (
                      <div className="p-4 rounded-lg border border-dashed border-[var(--border-medium)]">
                        <p className="text-xs text-[var(--text-muted)]">Prompts for this role can be edited in Settings &gt; Prompts.</p>
                      </div>
                    ) : null;
                  }
                  return (
                    <div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-[var(--text-muted)]">Agent Prompts</label>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">System prompts used when dispatching this role</p>
                      </div>
                      <div className="space-y-2">
                        {promptKeys.map((key) => {
                          const prompt = prompts[key];
                          const defaultValue = promptDefaults[key] || "";
                          const currentValue = prompt?.value || defaultValue;
                          const isDefault = prompt?.isDefault !== false;
                          const isExpanded = expandedPrompt === key;
                          const editValue = promptEdits[key];
                          const hasEdits = editValue !== undefined && editValue !== currentValue;
                          const sharedWith = getSharedRoles(key, slug);
                          const label = PROMPT_LABELS[key] || key;

                          return (
                            <div key={key} className="rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5" onClick={() => setExpandedPrompt(isExpanded ? null : key)}>
                                <div className="flex items-center gap-2">
                                  <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                  <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDefault ? "bg-white/10 text-[var(--text-muted)]" : "bg-blue-500/20 text-blue-400"}`}>
                                    {isDefault ? "default" : "customized"}
                                  </span>
                                </div>
                                {sharedWith.length > 0 && (
                                  <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                                    shared
                                  </span>
                                )}
                              </div>
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-[var(--border-subtle)]">
                                  {sharedWith.length > 0 && (
                                    <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                      <p className="text-[11px] text-amber-400">Changes here affect: {sharedWith.join(", ")}</p>
                                    </div>
                                  )}
                                  <textarea value={editValue !== undefined ? editValue : currentValue} onChange={(e) => setPromptEdits({ ...promptEdits, [key]: e.target.value })} rows={8} className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-primary)] border border-[var(--border-medium)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] resize-y" style={{ minHeight: "120px" }} />
                                  <div className="flex items-center justify-between mt-2">
                                    <button type="button" onClick={() => handleResetPrompt(key)} disabled={isDefault || savingPrompt === key} className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-white/10 disabled:opacity-30">Reset to Default</button>
                                    <button type="button" onClick={() => handleSavePrompt(key)} disabled={!hasEdits || savingPrompt === key} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--accent-blue)] disabled:opacity-40 hover:opacity-90">
                                      {savingPrompt === key ? "Saving..." : "Save Prompt"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Role Context */}
                {(() => {
                  const slug = editingRole?.slug || roleForm.slug;
                  if (!slug) return null;
                  const contextKey = `context_role_${slug}`;
                  const ctx = roleContexts[contextKey];
                  const currentValue = ctx?.value || allEventDefaults[contextKey] || "";
                  const isDefault = ctx?.isDefault !== false;
                  const editValue = roleContextEdit;
                  const hasEdits = editValue !== undefined && editValue !== currentValue;

                  return (
                    <div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-[var(--text-muted)]">Role Context</label>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Background context injected into every dispatch for this role</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDefault ? "bg-white/10 text-[var(--text-muted)]" : "bg-emerald-500/20 text-emerald-400"}`}>
                            {isDefault ? "default" : "customized"}
                          </span>
                        </div>
                        <div className="px-3 pb-3 border-t border-[var(--border-subtle)]">
                          <textarea
                            value={editValue !== undefined ? editValue : currentValue}
                            onChange={(e) => setRoleContextEdit(e.target.value)}
                            rows={8}
                            className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-primary)] border border-[var(--border-medium)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] resize-y"
                            style={{ minHeight: "120px" }}
                          />
                          <div className="flex items-center justify-between mt-2">
                            <button type="button" onClick={() => handleResetContext(contextKey)} disabled={isDefault || savingContext} className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-white/10 disabled:opacity-30">Reset to Default</button>
                            <button type="button" onClick={() => handleSaveContext(contextKey, editValue || currentValue)} disabled={!hasEdits || savingContext} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--accent-blue)] disabled:opacity-40 hover:opacity-90">
                              {savingContext ? "Saving..." : "Save Context"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Event Prompts */}
                {(() => {
                  const slug = editingRole?.slug || roleForm.slug;
                  const eventKeys = ROLE_EVENT_PROMPT_MAP[slug];
                  if (!eventKeys || eventKeys.length === 0) return null;
                  return (
                    <div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-[var(--text-muted)]">Event Prompts</label>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Triggered on ticket lifecycle events</p>
                      </div>
                      <div className="space-y-2">
                        {eventKeys.map((key) => {
                          const prompt = eventPrompts[key];
                          const defaultValue = allEventDefaults[key] || "";
                          const currentValue = prompt?.value || defaultValue;
                          const isDefault = prompt?.isDefault !== false;
                          const isExpanded = expandedEventPrompt === key;
                          const editValue = eventPromptEdits[key];
                          const hasEdits = editValue !== undefined && editValue !== currentValue;
                          const label = EVENT_PROMPT_LABELS[key] || key;

                          return (
                            <div key={key} className="rounded-lg border border-[var(--border-medium)] bg-[var(--bg-input)] overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5" onClick={() => setExpandedEventPrompt(isExpanded ? null : key)}>
                                <div className="flex items-center gap-2">
                                  <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                  <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDefault ? "bg-white/10 text-[var(--text-muted)]" : "bg-emerald-500/20 text-emerald-400"}`}>
                                    {isDefault ? "default" : "customized"}
                                  </span>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-[var(--border-subtle)]">
                                  <textarea value={editValue !== undefined ? editValue : currentValue} onChange={(e) => setEventPromptEdits({ ...eventPromptEdits, [key]: e.target.value })} rows={8} className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-mono bg-[var(--bg-primary)] border border-[var(--border-medium)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] resize-y" style={{ minHeight: "120px" }} />
                                  <div className="flex items-center justify-between mt-2">
                                    <button type="button" onClick={() => handleResetEventPrompt(key)} disabled={isDefault || savingEventPrompt === key} className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-white/10 disabled:opacity-30">Reset to Default</button>
                                    <button type="button" onClick={() => handleSaveEventPrompt(key)} disabled={!hasEdits || savingEventPrompt === key} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--accent-blue)] disabled:opacity-40 hover:opacity-90">
                                      {savingEventPrompt === key ? "Saving..." : "Save Prompt"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex justify-between pt-4">
                  {editingRole.id ? (
                    <button onClick={() => { handleDeleteRole(editingRole.id); setEditingRole(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10">Delete Role</button>
                  ) : <div />}
                  <button onClick={handleSaveRole} disabled={!roleForm.title.trim() || savingRole} className="px-6 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--accent-blue)] disabled:opacity-40 hover:opacity-90">
                    {savingRole ? "Saving..." : "Save Role"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Edit Worker Tab */}
        {tab === "edit-worker" && editingPersona && (() => {
          const editRole = roles.find((r) => r.id === editingPersona.roleId);
          const editAccent = editRole?.color || editingPersona.color;
          const editInitial = name.trim() ? name.trim()[0].toUpperCase() : "?";
          return (
            <>
              <div className="flex items-center gap-3 px-8 py-5 border-b border-[var(--border-subtle)]" style={{ borderTopWidth: "3px", borderTopColor: editAccent }}>
                <button onClick={() => { setTab(editingPersona.id ? "workers" : "roles"); setEditingPersona(null); setSelectedRole(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-white/10">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {editingPersona.id ? `Edit ${editingPersona.name}` : `New ${editRole?.title || editingPersona.role}`}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">{editRole?.title || editingPersona.role}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="flex gap-8 max-w-2xl">
                  {/* Avatar */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={name} className="w-32 h-32 rounded-full object-cover border-2" style={{ borderColor: editAccent, opacity: generatingPhase === "avatar" ? 0.4 : 1, transition: "opacity 0.2s" }} />
                      ) : (
                        <div className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white" style={{ backgroundColor: editAccent }}>{editInitial}</div>
                      )}
                      {generatingPhase === "avatar" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-8 h-8 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        </div>
                      )}
                      {avatarUrl && !generating && (
                        <button onClick={() => setAvatarUrl(null)} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600">&times;</button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={rerollAvatar} disabled={!!rerolling || generating} className="p-2 rounded-lg border border-[var(--border-medium)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-40" title="Reroll avatar">
                        <svg className={`w-4 h-4 ${rerolling === "avatar" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                      </button>
                      <button onClick={handleRegenerateForEdit} disabled={generating || !!rerolling} className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-white/5 disabled:opacity-40 flex items-center justify-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                        {generatingPhase === "text" ? "Profile..." : generatingPhase === "avatar" ? "Avatar..." : "Regen All"}
                      </button>
                    </div>
                  </div>

                  {/* Form */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)]">Name</label>
                        <button onClick={rerollIdentity} disabled={rerolling === "name"} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll name">
                          <svg className={`w-3.5 h-3.5 ${rerolling === "name" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                        </button>
                      </div>
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya, Atlas, Nova..." className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Gender</label>
                      <div className="flex gap-2">
                        {(["male", "female", "non-binary"] as const).map((g) => (
                          <button key={g} onClick={() => setGender(g)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${gender === g ? "bg-white/15 text-[var(--text-primary)] border border-white/20" : "text-[var(--text-muted)] border border-[var(--border-medium)] hover:bg-white/5"}`}>
                            {g.charAt(0).toUpperCase() + g.slice(1)}
                          </button>
                        ))}
                        <button onClick={() => { const options: ("male" | "female" | "non-binary")[] = ["male", "female", "non-binary"]; setGender(options[Math.floor(Math.random() * options.length)]); }} className="px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] border border-[var(--border-medium)] hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors" title="Random gender">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)]">Visual Description</label>
                        <button onClick={rerollIdentity} disabled={!!rerolling} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll appearance">
                          <svg className={`w-3.5 h-3.5 ${rerolling === "appearance" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                        </button>
                      </div>
                      <textarea value={appearance} onChange={(e) => setAppearance(e.target.value)} placeholder="What do they look like? Physical features, hair, clothing..." rows={3} className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-y" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-xs font-medium text-[var(--text-muted)]">Communication Style</label>
                        <button onClick={rerollStyle} disabled={!!rerolling} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll style">
                          <svg className={`w-3.5 h-3.5 ${rerolling === "style" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                        </button>
                      </div>
                      <textarea value={commStyle} onChange={(e) => setCommStyle(e.target.value)} placeholder="How do they communicate? Tone, energy, quirks..." rows={3} className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-y" />
                    </div>

                    {editRole?.skillDefinitions && editRole.skillDefinitions.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Skills from {editRole.title}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {editRole.skillDefinitions.map((skill, idx) => (
                            <span key={idx} className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${editRole.color} 15%, transparent)`, color: editRole.color }}>
                              /{skill.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={handleSaveWorker} disabled={!name.trim() || saving} className="w-full px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity" style={{ backgroundColor: editAccent }}>
                      {saving ? "Saving..." : editingPersona.id ? "Save Changes" : "Create Worker"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
