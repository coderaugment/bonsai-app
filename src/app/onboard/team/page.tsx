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
  const [projectId, setProjectId] = useState<number | null>(null);
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
      // Fetch active project so we can scope personas to it
      const projRes = await fetch("/api/settings/project");
      const proj = projRes.ok ? await projRes.json() : null;
      const pid = proj?.id ? Number(proj.id) : null;
      setProjectId(pid);

      const personasUrl = pid ? `/api/personas?projectId=${pid}` : "/api/personas";
      const [rolesRes, personasRes, promptsRes] = await Promise.all([
        fetch("/api/roles"),
        fetch(personasUrl),
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
          projectId: projectId || undefined,
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
        body: JSON.stringify({
          role: roleSlug,
          gender: g,
          existingNames: [
            ...existingPersonas.map((p) => p.name),
            ...hiredWorkers.map((p) => p.name),
          ],
        }),
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
    const g = (["male", "female", "non-binary"] as const)[Math.floor(Math.random() * 3)];
    setGender(g);
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl("");
    generateWorker(role.slug, g);
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
      // Chain avatar regen to match new appearance
      if (data.appearance) {
        setRerolling("avatar");
        try {
          const avatarRes = await fetch("/api/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name || name,
              role: role.slug,
              personality: data.appearance,
              style: getStylePrompt(),
            }),
          });
          const avatarData = await avatarRes.json();
          if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
        } catch {}
      }
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
  // STEPS 1-N: Gauntlet-Style Character Select
  // ══════════════════════════════════════════════
  const role = currentRole();
  if (!role) return null;

  const accent = role.color;
  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";
  const isLastRole = step >= unfilledRoles.length;

  // Dice icon SVG shared by reroll buttons
  const diceIcon = (spinning: boolean) => (
    <svg className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  );

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 35% 50%, ${accent}12 0%, transparent 60%), var(--bg-primary)`,
      }}
    >
      {/* ── Top: Progress Bar + Party Slots ── */}
      <div style={{ padding: "24px 40px 0" }}>
        {/* Segmented progress bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 flex-1" style={{ maxWidth: 200 }}>
            {unfilledRoles.map((r, i) => {
              const stepIndex = i; // 0-based index into unfilledRoles
              const isCompleted = stepIndex < step - 1; // steps before current
              const isCurrent = stepIndex === step - 1;
              return (
                <div
                  key={r.id}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: isCompleted ? r.color : isCurrent ? accent : "var(--border-medium)",
                    transition: "background-color 0.3s",
                  }}
                />
              );
            })}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
              color: "var(--text-muted)",
              whiteSpace: "nowrap" as const,
            }}
          >
            Step {step} of {unfilledRoles.length}
          </span>
        </div>

        {/* Party slots */}
        <div className="flex items-center gap-3">
          {/* Already-hired from previous sessions */}
          {existingPersonas.map((w) => (
            <div
              key={`existing-${w.id}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: `2px solid ${w.color || "var(--border-medium)"}`,
                overflow: "hidden",
                position: "relative" as const,
                flexShrink: 0,
              }}
            >
              {w.avatar ? (
                <img src={w.avatar} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", backgroundColor: w.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  {w.name[0].toUpperCase()}
                </div>
              )}
              <div style={{ position: "absolute", bottom: -1, right: -1, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
            </div>
          ))}
          {/* Newly hired this session */}
          {hiredWorkers.map((w) => (
            <div
              key={`hired-${w.id}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: `2px solid ${w.color || "var(--border-medium)"}`,
                overflow: "hidden",
                position: "relative" as const,
                flexShrink: 0,
              }}
            >
              {w.avatar ? (
                <img src={w.avatar} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", backgroundColor: w.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  {w.name[0].toUpperCase()}
                </div>
              )}
              <div style={{ position: "absolute", bottom: -1, right: -1, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
            </div>
          ))}
          {/* Current role slot — pulsing ring */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: `2px solid ${accent}`,
              boxShadow: `0 0 12px ${accent}50`,
              overflow: "hidden",
              animation: "gauntlet-pulse 2s ease-in-out infinite",
              flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", backgroundColor: `${accent}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: accent }}>
                {initial}
              </div>
            )}
          </div>
          {/* Remaining locked slots */}
          {unfilledRoles.slice(step).map((r, i) => (
            <div
              key={`locked-${i}`}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: `2px solid ${r.color}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${r.color}08`,
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={`${r.color}40`} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content: Pedestal + Traits Panel ── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 40px 0" }}>
        <div className="flex gap-10" style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* ── Left Column: Character Pedestal ── */}
          <div className="flex flex-col items-center" style={{ width: 280, flexShrink: 0 }}>
            {/* Avatar frame with glow */}
            <div style={{ position: "relative" as const, marginBottom: 0 }}>
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: "50%",
                  border: `3px solid ${accent}`,
                  overflow: "hidden",
                  position: "relative" as const,
                  boxShadow: `0 0 40px ${accent}40, 0 0 80px ${accent}20`,
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: generatingPhase === "avatar" || rerolling === "avatar" ? 0.4 : 1,
                      transition: "opacity 0.3s",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: `${accent}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 48,
                      fontWeight: 700,
                      color: accent,
                    }}
                  >
                    {generatingPhase ? (
                      <svg className="w-12 h-12 animate-spin" style={{ color: accent }} fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : initial}
                  </div>
                )}
                {(generatingPhase === "avatar" || rerolling === "avatar") && avatarUrl && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg className="w-10 h-10 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
                {/* Reroll avatar overlay */}
                {avatarUrl && !generatingPhase && (
                  <button
                    onClick={rerollAvatar}
                    disabled={!!rerolling || generating}
                    title="Reroll avatar"
                    className="avatar-reroll-overlay"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "none",
                      cursor: rerolling || generating ? "not-allowed" : "pointer",
                      opacity: 0,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      backgroundColor: "rgba(0,0,0,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <svg className={`w-5 h-5 ${rerolling === "avatar" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Pedestal shape */}
            <div
              style={{
                width: 200,
                height: 24,
                marginTop: -2,
                background: `linear-gradient(to bottom, ${accent}25, ${accent}08)`,
                clipPath: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)",
              }}
            />
            <div
              style={{
                width: 220,
                height: 6,
                background: `linear-gradient(to right, transparent, ${accent}30, transparent)`,
                marginTop: -1,
              }}
            />

            {/* Gender selector column */}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column" as const, gap: 4 }}>
              {(["male", "female", "non-binary"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => switchGender(g)}
                  style={{
                    padding: "6px 0",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase" as const,
                    border: gender === g ? `2px solid ${accent}` : `1px solid var(--border-medium)`,
                    backgroundColor: gender === g ? `${accent}20` : "transparent",
                    color: gender === g ? accent : "var(--text-muted)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    width: 160,
                  }}
                >
                  {g === "non-binary" ? "Non-Binary" : g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Role Identity (below pedestal) ── */}
            <div style={{ marginTop: 24, textAlign: "center" as const, maxWidth: 260 }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  color: accent,
                  lineHeight: 1.2,
                }}
              >
                {role.title}
              </div>
              {role.description && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                  {role.description}
                </p>
              )}
            </div>
          </div>

          {/* ── Right Column: Character Traits Panel ── */}
          <div
            style={{
              flex: 1,
              border: `1px solid ${accent}30`,
              borderRadius: 12,
              backgroundColor: `${accent}06`,
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column" as const,
              gap: 16,
            }}
          >
            {/* Panel header with Regen All */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 10,
                borderBottom: `1px solid ${accent}20`,
              }}
            >
              <div style={{ width: 80 }} />
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase" as const,
                  color: "var(--text-muted)",
                }}
              >
                Character Traits
              </div>
              <button
                onClick={regenerateAll}
                disabled={generating || !!rerolling}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${accent}40`,
                  backgroundColor: `${accent}10`,
                  color: accent,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                  cursor: generating || rerolling ? "not-allowed" : "pointer",
                  opacity: generating || rerolling ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.2s",
                }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                {generatingPhase === "text" ? "Generating..." : generatingPhase === "avatar" ? "Painting..." : "Regen All"}
              </button>
            </div>

            {/* Name field (full width) */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Name
              </label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maya, Atlas, Nova..."
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    borderRadius: 6,
                    fontSize: 13,
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                />
                <button
                  onClick={rerollIdentity}
                  disabled={!!rerolling || generating}
                  title="Reroll name & appearance"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: `1px solid ${accent}40`,
                    backgroundColor: `${accent}15`,
                    color: accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: rerolling || generating ? "not-allowed" : "pointer",
                    opacity: rerolling || generating ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  {diceIcon(rerolling === "name")}
                </button>
              </div>
            </div>

            {/* Bottom: two textareas side by side */}
            <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
              {/* Visual Description */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const }}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Visual Description
                </label>
                <div style={{ position: "relative" as const, flex: 1, display: "flex", flexDirection: "column" as const }}>
                  <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    placeholder="Physical features, hair, clothing..."
                    style={{
                      flex: 1,
                      width: "100%",
                      minHeight: 120,
                      padding: "10px 14px 10px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "none" as const,
                      lineHeight: 1.5,
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                  />
                  <button
                    onClick={rerollIdentity}
                    disabled={!!rerolling || generating}
                    title="Reroll appearance"
                    style={{
                      position: "absolute",
                      right: 6,
                      bottom: 6,
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1px solid ${accent}40`,
                      backgroundColor: `${accent}15`,
                      color: accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: rerolling || generating ? "not-allowed" : "pointer",
                      opacity: rerolling || generating ? 0.4 : 1,
                    }}
                  >
                    {diceIcon(rerolling === "name")}
                  </button>
                </div>
              </div>

              {/* Communication Style */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const }}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Communication Style
                </label>
                <div style={{ position: "relative" as const, flex: 1, display: "flex", flexDirection: "column" as const }}>
                  <textarea
                    value={commStyle}
                    onChange={(e) => setCommStyle(e.target.value)}
                    placeholder="Tone, energy, quirks..."
                    style={{
                      flex: 1,
                      width: "100%",
                      minHeight: 120,
                      padding: "10px 14px 10px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "none" as const,
                      lineHeight: 1.5,
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                  />
                  <button
                    onClick={rerollStyle}
                    disabled={!!rerolling || generating}
                    title="Reroll communication style"
                    style={{
                      position: "absolute",
                      right: 6,
                      bottom: 6,
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1px solid ${accent}40`,
                      backgroundColor: `${accent}15`,
                      color: accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: rerolling || generating ? "not-allowed" : "pointer",
                      opacity: rerolling || generating ? 0.4 : 1,
                    }}
                  >
                    {diceIcon(rerolling === "style")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Hire Button ── */}
      <div style={{ padding: "20px 40px 32px", display: "flex", justifyContent: "center" }}>
        <button
          onClick={handleHire}
          disabled={!name.trim() || saving || generating}
          style={{
            width: "100%",
            maxWidth: 520,
            padding: "16px 32px",
            borderRadius: 12,
            border: `2px solid ${accent}`,
            backgroundColor: accent,
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            cursor: !name.trim() || saving || generating ? "not-allowed" : "pointer",
            opacity: !name.trim() || saving || generating ? 0.4 : 1,
            boxShadow: `0 0 20px ${accent}40, 0 0 60px ${accent}15`,
            transition: "all 0.3s",
          }}
        >
          {saving
            ? "Hiring..."
            : isLastRole
              ? `Hire ${name.trim() || role.title} — Ready to Work`
              : `Hire ${name.trim() || role.title} & Continue`}
        </button>
      </div>

      {/* Keyframe animation for pulsing party slot */}
      <style>{`
        @keyframes gauntlet-pulse {
          0%, 100% { box-shadow: 0 0 8px ${accent}40; }
          50% { box-shadow: 0 0 20px ${accent}70; }
        }
        .avatar-reroll-overlay:hover {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
