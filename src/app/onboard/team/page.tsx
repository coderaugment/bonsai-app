"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { StepHeader } from "@/components/ui/step-header";
import type { Role, Persona } from "@/types";

type ArtStyle = "pixel" | "hollywood" | "ghibli" | "synthwave" | "popart" | "claymation" | "fluffy" | "action" | "custom";

const ART_STYLES: Record<ArtStyle, { label: string; prompt: string }> = {
  pixel: {
    label: "Pixel Art",
    prompt: "Pixel art character portrait in 32-bit retro RPG style. Clearly visible individual pixels with no smoothing or anti-aliasing. Limited 16-color palette per character. Clean pixel grid — every element is built from crisp square pixels. Inspired by Final Fantasy Tactics, Chrono Trigger character portraits, or Stardew Valley. Dark solid-color background. Square format, centered for circular crop. Expressive face despite low resolution.",
  },
  hollywood: {
    label: "Hollywood",
    prompt: "A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.",
  },
  fluffy: {
    label: "Fluffy Kawaii",
    prompt: "Adorable kawaii chibi character portrait in cute Japanese illustration style. Soft pastel colors, big sparkly eyes, rosy cheeks, fluffy rounded features. Sanrio/San-X inspired aesthetic — think Sumikko Gurashi or Molang. Gentle gradients, dreamy sparkle effects, tiny blush marks. Plush toy quality softness. Light pastel background with subtle stars or hearts. Square format, centered for circular crop.",
  },
  action: {
    label: "80s Action",
    prompt: "1980s retro airbrush character portrait painting. Bold dramatic lighting with warm orange and magenta rim lights against a dark gradient background. Stylized and slightly exaggerated features with confident expression. Smooth airbrushed skin, vivid saturated colors, subtle lens flare accents. Retro sci-fi or action aesthetic without any text, titles, or logos. Painterly illustration with visible brushwork and soft glowing highlights. Head and shoulders composition, square format, centered for circular crop.",
  },
  ghibli: {
    label: "Ghibli",
    prompt: "Studio Ghibli inspired anime portrait. Soft watercolor textures, warm natural lighting, gentle expressive eyes, delicate linework. Hayao Miyazaki character design aesthetic — whimsical but grounded. Pastel sky background with soft clouds. Square format, centered for circular crop.",
  },
  synthwave: {
    label: "Synthwave",
    prompt: "Synthwave retrowave portrait illustration. Bold neon colors — electric pink, cyan, and purple against a dark gradient background. Chrome reflections, grid lines, sunset gradients. 80s retro-futuristic aesthetic inspired by Kavinsky, Outrun, and Miami Vice. Glowing edges and light trails. Digital airbrushed quality. Square format, centered for circular crop.",
  },
  popart: {
    label: "Pop Art",
    prompt: "Bold Pop Art portrait in the style of Roy Lichtenstein and Andy Warhol. Ben-Day halftone dots, thick black outlines, limited flat color palette of primary colors (red, blue, yellow) plus black and white. Comic book printing style. Graphic and punchy. Square format, centered for circular crop.",
  },
  claymation: {
    label: "Claymation",
    prompt: "Claymation stop-motion character portrait. Sculpted clay figure with visible fingerprint textures and subtle imperfections. Warm studio lighting with soft shadows. Inspired by Laika Studios (Coraline, Kubo), Aardman (Wallace & Gromit). Slightly oversized head with expressive features. Matte clay material finish, not glossy. Miniature set background slightly out of focus. Square format, centered for circular crop.",
  },
  custom: {
    label: "Custom",
    prompt: "Character portrait in a distinctive illustration style. Expressive features, clear details, stylized but recognizable. Professional quality artwork with a cohesive color palette. Dark or neutral background. Square format, centered for circular crop. No text, no watermarks.",
  },
};

export default function TeamPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [existingPersonas, setExistingPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  // All unfilled roles — every role goes through character creation
  const [unfilledRoles, setUnfilledRoles] = useState<Role[]>([]);

  // Step: 0 = art style, 1..N = create worker for each unfilled role
  const [step, setStep] = useState(0);
  const [artStyle, setArtStyle] = useState<ArtStyle>("hollywood");
  const [hasArtStyle, setHasArtStyle] = useState(false);
  // The actual saved style prompt from DB (used for avatar generation)
  const [savedStylePrompt, setSavedStylePrompt] = useState<string | null>(null);

  // Created workers (saved after each hire)
  const [hiredWorkers, setHiredWorkers] = useState<Persona[]>([]);

  // Worker form state
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "non-binary">("male");
  const [appearance, setAppearance] = useState("");
  const [commStyle, setCommStyle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<"" | "text" | "avatar">("");
  const [rerolling, setRerolling] = useState<"" | "name" | "appearance" | "style" | "avatar">("");
  const [saving, setSaving] = useState(false);
  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Auto-generate worker with random gender when entering a hire step
  useEffect(() => {
    if (step < 1 || unfilledRoles.length === 0) return;
    const role = unfilledRoles[step - 1];
    if (!role) return;
    const g = (["male", "female", "non-binary"] as const)[Math.floor(Math.random() * 3)];
    setGender(g);
    generateWorker(role.slug, g);
  }, [step, unfilledRoles]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const [rolesRes, personasRes, promptsRes] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/personas"),
        fetch("/api/settings/prompts"),
      ]);
      const allRoles: Role[] = await rolesRes.json();
      const allPersonas: Persona[] = await personasRes.json();
      const promptsData = await promptsRes.json();

      setRoles(allRoles);
      setExistingPersonas(allPersonas);

      // Check if art style is already set (not default)
      const avatarStyleEntry = promptsData.prompts?.prompt_avatar_style;
      const styleSet = avatarStyleEntry?.isDefault === false;
      setHasArtStyle(styleSet);
      if (styleSet && avatarStyleEntry?.value) {
        setSavedStylePrompt(avatarStyleEntry.value);
      }

      // Compute unfilled roles: roles with no active persona matching that roleId
      const filledRoleIds = new Set(allPersonas.map((p) => p.roleId).filter(Boolean));
      const unfilled = allRoles.filter((r) => !filledRoleIds.has(r.id));
      setUnfilledRoles(unfilled);

      // If art style already set, skip step 0 → go directly to step 1
      if (styleSet) {
        setStep(1);
      }
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
    }
    setLoading(false);
  }

  // Resolve the active style prompt: saved DB value > local ART_STYLES lookup
  function getStylePrompt(): string {
    return savedStylePrompt || ART_STYLES[artStyle].prompt;
  }

  // Get the role for the current hire step (step 1 = unfilledRoles[0], etc.)
  function currentRole(): Role | null {
    if (step < 1) return null;
    return unfilledRoles[step - 1] || null;
  }

  // ── Step transitions ──

  async function handleStyleSelect(key: ArtStyle) {
    setArtStyle(key);
    const prompt = ART_STYLES[key].prompt;
    setSavedStylePrompt(prompt);
    // Save chosen style to settings and advance immediately
    await fetch("/api/settings/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "prompt_avatar_style", value: prompt }),
    });
    setStep(1);
    resetForm();
  }

  function resetForm() {
    setName("");
    setGender("male");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl(null);
  }

  async function handleHire() {
    const role = currentRole();
    if (!role || !name.trim()) return;
    setSaving(true);
    try {
      const personality = [appearance.trim(), commStyle.trim()].filter(Boolean).join("\n\n");
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          roleId: role.id,
          role: role.slug,
          personality: personality || undefined,
          avatar: avatarUrl || undefined,
          skills: [],
          processes: [],
          goals: [],
          permissions: { tools: [], folders: [] },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[handleHire] API error:", data.error || data);
        return;
      }
      if (data.persona) {
        setHiredWorkers([...hiredWorkers, data.persona]);
      }

      const nextStep = step + 1;
      if (nextStep > unfilledRoles.length) {
        // All roles hired — redirect based on whether tickets exist
        const ticketsRes = await fetch("/api/tickets");
        const ticketsData = await ticketsRes.json();
        if (Array.isArray(ticketsData) && ticketsData.length > 0) {
          router.push("/board");
        } else {
          router.push("/new-ticket");
        }
      } else {
        setStep(nextStep);
        resetForm();
      }
    } catch (err) {
      console.error("[handleHire] failed:", err);
    }
    setSaving(false);
  }

  // ── Generation helpers ──

  async function generateWorker(roleSlug: string, genderOverride?: "male" | "female" | "non-binary") {
    // Abort any in-flight generation
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    const signal = controller.signal;

    const g = genderOverride || gender;
    setGenerating(true);
    setGeneratingPhase("text");
    try {
      const genRes = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleSlug, gender: g }),
        signal,
      });
      const genData = await genRes.json();
      if (signal.aborted) return;
      if (genData.name) setName(genData.name);
      if (genData.appearance) setAppearance(genData.appearance);
      if (genData.style) setCommStyle(genData.style);

      setGeneratingPhase("avatar");
      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genData.name || "Worker",
          role: roleSlug,
          personality: genData.appearance || "",
          style: getStylePrompt(),
        }),
        signal,
      });
      const avatarData = await avatarRes.json();
      if (signal.aborted) return;
      if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
    } catch (e) {
      if (signal.aborted) return;
    }
    setGenerating(false);
    setGeneratingPhase("");
  }

  function switchGender(g: "male" | "female" | "non-binary") {
    setGender(g);
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl(null);
    const role = currentRole();
    if (!role) return;
    generateWorker(role.slug, g);
  }

  async function regenerateAll() {
    const role = currentRole();
    if (!role) return;
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl("");
    generateWorker(role.slug);
  }

  async function rerollIdentity() {
    const role = currentRole();
    if (!role) return;
    setRerolling("name");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role.slug, field: "appearance", name: name.trim() || undefined, gender }),
      });
      const data = await res.json();
      if (data.name) setName(data.name);
      if (data.appearance) setAppearance(data.appearance);
    } catch {}
    setRerolling("");
  }

  async function rerollStyle() {
    const role = currentRole();
    if (!role) return;
    setRerolling("style");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role.slug, field: "style", name: name.trim() || undefined, gender }),
      });
      const data = await res.json();
      if (data.style) setCommStyle(data.style);
    } catch {}
    setRerolling("");
  }

  async function rerollAvatar() {
    const role = currentRole();
    if (!role) return;
    setRerolling("avatar");
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role: role.slug,
          personality: appearance,
          style: getStylePrompt(),
        }),
      });
      const data = await res.json();
      if (data.avatar) setAvatarUrl(data.avatar);
    } catch {}
    setRerolling("");
  }

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Build your team" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // STEP 0: Art Style Selection
  // ══════════════════════════════════════════════
  if (step === 0) {
    return (
      <div className="flex flex-col h-full">
        <StepHeader title="Choose your art style" />

        <div className="flex-1 flex flex-col px-10 pt-2 gap-6 overflow-y-auto">
          <p className="text-base" style={{ color: "var(--text-secondary)" }}>
            This style will be used for all your team&apos;s avatars.
          </p>

          <div className="grid grid-cols-4 gap-4">
            {(Object.entries(ART_STYLES) as [ArtStyle, { label: string }][]).map(([key, { label }]) => {
              const selected = artStyle === key;
              return (
                <button
                  key={key}
                  onClick={() => handleStyleSelect(key)}
                  className="group flex flex-col items-center gap-2 transition-all cursor-pointer"
                >
                  <div
                    className="relative w-full aspect-square rounded-full overflow-hidden transition-all"
                    style={{
                      outline: selected ? "3px solid var(--accent-blue)" : "2px solid transparent",
                      outlineOffset: "2px",
                    }}
                  >
                    <img
                      src={`/styles/${key}-1.png`}
                      alt={label}
                      className="w-full h-full object-cover rounded-full transition-opacity group-hover:opacity-0"
                    />
                    <div className="absolute inset-0 flex opacity-0 group-hover:opacity-100 transition-opacity rounded-full overflow-hidden">
                      {[1, 2, 3].map((n) => (
                        <img
                          key={n}
                          src={`/styles/${key}-${n}.png`}
                          alt=""
                          className="h-full object-cover"
                          style={{ width: "33.333%" }}
                        />
                      ))}
                    </div>
                  </div>
                  <span
                    className="text-xs font-medium"
                    style={{ color: selected ? "var(--accent-blue)" : "var(--text-secondary)" }}
                  >
                    {label}
                    {selected && (
                      <svg className="w-3 h-3 inline-block ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-10 pb-10 pt-4">
          <button
            onClick={() => router.push("/onboard/project")}
            className="px-6 py-3 rounded-lg text-base font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // STEPS 1-N: RPG Character Creation for each role
  // ══════════════════════════════════════════════
  const role = currentRole();
  if (!role) return null;

  const accent = role.color;
  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";
  const stepLabel = `${step} of ${unfilledRoles.length}`;
  const isLastRole = step >= unfilledRoles.length;
  // Show existing personas + newly hired ones as the avatar row
  const allHired = [...existingPersonas, ...hiredWorkers];

  return (
    <div className="flex flex-col h-full">
      {/* Header with step progress + role identity */}
      <div className="flex items-center justify-between px-10 pt-8 pb-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: accent }}>Hire your {role.title}</span>
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Step {stepLabel}
          </p>
          {role.description && (
            <p className="text-sm mt-2 max-w-lg" style={{ color: "var(--text-secondary)" }}>
              {role.description}
            </p>
          )}
        </div>

        {/* Previously hired mini-avatars */}
        {allHired.length > 0 && (
          <div className="flex items-center gap-1">
            {allHired.map((w) => (
              <div
                key={w.id}
                className="w-9 h-9 rounded-full overflow-hidden border-2 -ml-2 first:ml-0"
                style={{ borderColor: "var(--bg-card)" }}
              >
                {w.avatar ? (
                  <img src={w.avatar} alt={w.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: w.color }}
                  >
                    {w.name[0].toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {/* Placeholder for remaining unfilled */}
            {Array.from({ length: unfilledRoles.length - hiredWorkers.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="w-9 h-9 rounded-full border-2 border-dashed -ml-2"
                style={{ borderColor: "var(--border-medium)" }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Worker creation form */}
          <div className="flex-1 overflow-y-auto px-10 pb-4">
            <div className="flex gap-8 max-w-2xl mx-auto">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4 pt-2">
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-28 h-28 rounded-full object-cover border-2"
                      style={{ borderColor: accent, opacity: generatingPhase === "avatar" ? 0.4 : 1, transition: "opacity 0.2s" }}
                    />
                  ) : (
                    <div
                      className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {generatingPhase ? (
                        <svg className="w-8 h-8 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : initial}
                    </div>
                  )}
                  {generatingPhase === "avatar" && avatarUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-8 h-8 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={rerollAvatar}
                    disabled={!!rerolling || generating}
                    className="p-2 rounded-lg border border-[var(--border-medium)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-40"
                    title="Reroll avatar"
                  >
                    <svg className={`w-4 h-4 ${rerolling === "avatar" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                  </button>
                  <button
                    onClick={regenerateAll}
                    disabled={generating || !!rerolling}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-medium)] text-[var(--text-secondary)] hover:bg-white/5 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {generatingPhase === "text" ? "Profile..." : generatingPhase === "avatar" ? "Avatar..." : "Regen All"}
                  </button>
                </div>
              </div>

              {/* Form fields */}
              <div className="flex-1 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Gender</label>
                  <div className="flex gap-2">
                    {(["male", "female", "non-binary"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => switchGender(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          gender === g
                            ? "bg-white/15 text-[var(--text-primary)] border border-white/20"
                            : "text-[var(--text-muted)] border border-[var(--border-medium)] hover:bg-white/5"
                        }`}
                      >
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const options: ("male" | "female" | "non-binary")[] = ["male", "female", "non-binary"];
                        const pick = options[Math.floor(Math.random() * options.length)];
                        switchGender(pick);
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] border border-[var(--border-medium)] hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
                      title="Random gender"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Name</label>
                    <button onClick={rerollIdentity} disabled={!!rerolling || generating} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll name">
                      <svg className={`w-3.5 h-3.5 ${rerolling === "name" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                    </button>
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maya, Atlas, Nova..."
                    className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Visual Description</label>
                    <button onClick={rerollIdentity} disabled={!!rerolling || generating} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll appearance">
                      <svg className={`w-3.5 h-3.5 ${rerolling === "appearance" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                    </button>
                  </div>
                  <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    placeholder="What do they look like? Physical features, hair, clothing..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-y"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium text-[var(--text-muted)]">Communication Style</label>
                    <button onClick={rerollStyle} disabled={!!rerolling || generating} className="p-0.5 rounded hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" title="Reroll style">
                      <svg className={`w-3.5 h-3.5 ${rerolling === "style" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                    </button>
                  </div>
                  <textarea
                    value={commStyle}
                    onChange={(e) => setCommStyle(e.target.value)}
                    placeholder="How do they communicate? Tone, energy, quirks..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg text-sm bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] resize-y"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-10 pb-8 pt-4">
            <button
              onClick={handleHire}
              disabled={!name.trim() || saving || generating}
              className="w-full max-w-2xl mx-auto block px-8 py-3 rounded-lg text-base font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {saving
                ? "Hiring..."
                : isLastRole
                  ? `Hire ${name.trim() || role.title} — You are ready to work`
                  : `Hire ${name.trim() || role.title} & Continue`}
            </button>
          </div>
    </div>
  );
}
