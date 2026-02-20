"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { StepHeader } from "@/components/ui/step-header";
import { GeminiSetupModal } from "@/components/gemini-setup-modal";
import type { Role, Persona } from "@/types";

const DEFAULT_STYLE = "A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Professional headshot quality. Subject centered in frame for circular crop. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos. Square format.";

export default function TeamPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [_roles, setRoles] = useState<Role[]>([]);
  const [existingPersonas, setExistingPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  // All unfilled roles — every role goes through character creation
  const [unfilledRoles, setUnfilledRoles] = useState<Role[]>([]);

  // Step: 0 = art style, 1..N = create worker for each unfilled role
  const [step, setStep] = useState(0);
  // The actual saved style prompt from DB (used for avatar generation)
  const [savedStylePrompt, setSavedStylePrompt] = useState<string | null>(null);

  // Step 0: Style prompt state
  const [stylePromptText, setStylePromptText] = useState(DEFAULT_STYLE);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [randomizing, setRandomizing] = useState(false);

  // Created workers (saved after each hire)
  const [hiredWorkers, setHiredWorkers] = useState<Persona[]>([]);

  // Track workers being generated in random team flow
  const [generatingWorkers, setGeneratingWorkers] = useState<Persona[]>([]);

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
  const [showGeminiSetup, setShowGeminiSetup] = useState(false);
  const [geminiRetryFn, setGeminiRetryFn] = useState<(() => void) | null>(null);
  const [styleMode, setStyleMode] = useState<"text" | "photo">("text");
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [styleDragOver, setStyleDragOver] = useState(false);
  const styleFileInputRef = useRef<HTMLInputElement>(null);
  const generateAbortRef = useRef<AbortController | null>(null);
  const autoGenerateOnLoad = useRef(false);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // Fetch active project so we can scope personas to it
      const projRes = await fetch("/api/settings/project");
      const proj = projRes.ok ? await projRes.json() : null;
      const pid = proj?.id ? Number(proj.id) : null;
      setProjectId(pid);

      const personasUrl = pid ? `/api/personas?projectId=${pid}` : "/api/personas";
      const [rolesRes, personasRes, promptsRes, styleImageRes] = await Promise.all([
        fetch("/api/roles"),
        fetch(personasUrl),
        fetch("/api/settings/prompts"),
        fetch("/api/settings/style-image"),
      ]);
      const allRoles: Role[] = await rolesRes.json();
      const allPersonas: Persona[] = await personasRes.json();
      const promptsData = await promptsRes.json();
      const styleImageData = styleImageRes.ok ? await styleImageRes.json() : null;
      if (styleImageData?.image) {
        setStyleImage(styleImageData.image);
        setStyleMode("photo");
      }

      setRoles(allRoles);
      setExistingPersonas(allPersonas);

      // Check if art style is already set (not default)
      const avatarStyleEntry = promptsData.prompts?.prompt_avatar_style;
      const styleSet = avatarStyleEntry?.isDefault === false;
      if (styleSet && avatarStyleEntry?.value) {
        setSavedStylePrompt(avatarStyleEntry.value);
        setStylePromptText(avatarStyleEntry.value);
      }

      // Compute unfilled roles: roles with no active persona matching that roleId
      // ONLY ENABLE: lead, researcher, developer
      const enabledRoleSlugs = ["lead", "researcher", "developer"];
      const filledRoleIds = new Set(allPersonas.map((p) => p.roleId).filter(Boolean));
      const unfilled = allRoles
        .filter((r) => enabledRoleSlugs.includes(r.slug))
        .filter((r) => !filledRoleIds.has(r.id));
      setUnfilledRoles(unfilled);

      // Only skip step 0 if style is set AND some personas already exist
      // (meaning art direction was already completed for a previous project/session)
      if (styleSet && unfilled.length < allRoles.length) {
        setStep(1);
      } else {
        // Auto-generate a preview on first load
        autoGenerateOnLoad.current = true;
      }
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
    }
    setLoading(false);
  }

  // Resolve the active style prompt: saved DB value > default
  function getStylePrompt(): string {
    return savedStylePrompt || DEFAULT_STYLE;
  }

  function genderToText(g: "male" | "female" | "non-binary"): string {
    if (g === "male") return "a man";
    if (g === "female") return "a woman";
    return "a non-binary person";
  }

  // Get the role for the current hire step (step 1 = unfilledRoles[0], etc.)
  function currentRole(): Role | null {
    if (step < 1) return null;
    return unfilledRoles[step - 1] || null;
  }

  // ── Step 0: Style preview & save ──

  async function generateStylePreview(styleOverride?: string | React.MouseEvent) {
    // Guard against being called directly as onClick handler
    if (typeof styleOverride !== "string") styleOverride = undefined;
    setGeneratingPreview(true);
    try {
      const roles = ["developer", "designer", "lead", "researcher"];
      const role = roles[Math.floor(Math.random() * roles.length)];
      const genders = ["male", "female", "non-binary"] as const;
      const g = genders[Math.floor(Math.random() * genders.length)];

      const genRes = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, gender: g }),
      });
      const genData = await genRes.json();
      if (genData.code === "gemini_key_missing") {
        setGeneratingPreview(false);
        setGeminiRetryFn(() => () => generateStylePreview(styleOverride));
        setShowGeminiSetup(true);
        return;
      }

      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genData.name || "Sample",
          role,
          personality: styleImage
            ? `${genderToText(g)}${genData.appearance ? ". " + genData.appearance : ""}`
            : (genData.appearance || ""),
          style: styleImage ? null : (styleOverride || stylePromptText),
          styleImage: styleImage || null,
        }),
      });
      const avatarData = await avatarRes.json();
      if (avatarData.code === "gemini_key_missing") {
        setGeneratingPreview(false);
        setGeminiRetryFn(() => () => generateStylePreview(styleOverride));
        setShowGeminiSetup(true);
        return;
      }
      if (avatarData.avatar) setPreviewAvatar(avatarData.avatar);
    } catch (err) {
      console.error("[generateStylePreview] failed:", err);
    }
    setGeneratingPreview(false);
  }

  async function randomizeStyle() {
    setRandomizing(true);
    try {
      const res = await fetch("/api/generate-style", { method: "POST" });
      const data = await res.json();
      if (data.code === "gemini_key_missing") {
        setRandomizing(false);
        setGeminiRetryFn(() => () => randomizeStyle());
        setShowGeminiSetup(true);
        return;
      }
      if (data.style) {
        setStylePromptText(data.style);
        await generateStylePreview(data.style);
      }
    } catch (err) {
      console.error("[randomizeStyle] failed:", err);
    }
    setRandomizing(false);
  }

  function loadImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setStyleImage(dataUrl);
      setStyleMode("photo");
      generateStylePreview();
    };
    reader.readAsDataURL(file);
  }

  function handleStyleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setStyleDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  }

  function handleStyleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadImageFile(file);
    e.target.value = "";
  }

  async function handleCreateTeam() {
    if (styleMode === "photo" && styleImage) {
      await fetch("/api/settings/style-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: styleImage }),
      });
      // Clear text style so the image takes precedence
      await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "prompt_avatar_style", value: "" }),
      });
    } else {
      await fetch("/api/settings/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "prompt_avatar_style", value: stylePromptText }),
      });
      // Clear any saved style image
      await fetch("/api/settings/style-image", { method: "DELETE" });
    }
    setSavedStylePrompt(styleMode === "text" ? stylePromptText : null);
    setStep(1);
    resetForm();
  }

  async function handleAcceptRandomTeam() {
    setSaving(true);
    setGeneratingWorkers([]);
    try {
      // Randomize art style first if using text mode
      let finalStyle = stylePromptText;
      if (!styleImage) {
        const styleRes = await fetch("/api/generate-style", { method: "POST" });
        const styleData = await styleRes.json();
        if (styleData.code === "gemini_key_missing") {
          setGeminiRetryFn(() => handleAcceptRandomTeam);
          setShowGeminiSetup(true);
          setSaving(false);
          return;
        }
        if (styleData.style) {
          finalStyle = styleData.style;
          setStylePromptText(finalStyle);
        }
      }

      // Save art style
      if (styleImage) {
        await fetch("/api/settings/style-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: styleImage }),
        });
        await fetch("/api/settings/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "prompt_avatar_style", value: "" }),
        });
      } else {
        await fetch("/api/settings/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "prompt_avatar_style", value: finalStyle }),
        });
        await fetch("/api/settings/style-image", { method: "DELETE" });
      }

      // Generate all team members
      const allNames: string[] = [...existingPersonas.map(p => p.name)];
      for (const role of unfilledRoles) {
        const g = randomGender();

        // Generate worker data
        const genRes = await fetch("/api/generate-worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: role.slug, gender: g, existingNames: allNames }),
        });
        const genData = await genRes.json();
        if (genData.code === "gemini_key_missing") {
          setGeminiRetryFn(() => handleAcceptRandomTeam);
          setShowGeminiSetup(true);
          setSaving(false);
          return;
        }

        // Generate avatar
        const avatarRes = await fetch("/api/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: genData.name || "Worker",
            role: role.slug,
            personality: styleImage
              ? `${genderToText(g)}${genData.appearance ? ". " + genData.appearance : ""}`
              : (genData.appearance || ""),
            style: styleImage ? null : finalStyle,
            styleImage: styleImage || null,
          }),
        });
        const avatarData = await avatarRes.json();

        // Save persona
        const personality = [genData.appearance?.trim(), genData.commStyle?.trim()].filter(Boolean).join("\n\n");
        const personaRes = await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: genData.name?.trim() || role.title,
            roleId: role.id,
            role: role.slug,
            personality: personality || undefined,
            avatar: avatarData.avatar || undefined,
            skills: [],
            processes: [],
            goals: [],
            permissions: { tools: [], folders: [] },
            projectId: projectId || undefined,
          }),
        });
        const personaData = await personaRes.json();

        // Add to generating workers for UI display
        if (personaData.persona) {
          setGeneratingWorkers(prev => [...prev, personaData.persona]);
        }

        if (genData.name) allNames.push(genData.name);
      }

      // Redirect to board after all team members created
      router.push(`/p/${slug}/board`);
    } catch (err) {
      console.error("[handleAcceptRandomTeam] failed:", err);
      setGeneratingWorkers([]);
    }
    setSaving(false);
  }

  // ── Step transitions ──

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
          router.push(`/p/${slug}`);
        } else {
          router.push(`/p/${slug}/new-ticket`);
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
      if (genData.code === "gemini_key_missing") {
        setGenerating(false);
        setGeneratingPhase("");
        setGeminiRetryFn(() => () => generateWorker(roleSlug, genderOverride));
        setShowGeminiSetup(true);
        return;
      }
      if (genData.name) setName(genData.name);
      if (genData.appearance) setAppearance(genData.appearance);

      setGeneratingPhase("avatar");
      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genData.name || "Worker",
          role: roleSlug,
          personality: styleImage
            ? `${genderToText(g)}${genData.appearance ? ". " + genData.appearance : ""}`
            : (genData.appearance || ""),
          style: styleImage ? null : getStylePrompt(),
          styleImage: styleImage || null,
        }),
        signal,
      });
      const avatarData = await avatarRes.json();
      if (signal.aborted) return;
      if (avatarData.code === "gemini_key_missing") {
        setGenerating(false);
        setGeneratingPhase("");
        setGeminiRetryFn(() => () => generateWorker(roleSlug, genderOverride));
        setShowGeminiSetup(true);
        return;
      }
      if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
    } catch {
      if (signal.aborted) return;
    }
    setGenerating(false);
    setGeneratingPhase("");
  }

  useEffect(() => {
    queueMicrotask(() => fetchInitialData());
  }, []);

  // Auto-generate style preview on first load
  useEffect(() => {
    if (!loading && autoGenerateOnLoad.current) {
      autoGenerateOnLoad.current = false;
      generateStylePreview();
    }
  }, [loading]);

  // Weighted random gender: 45% male, 45% female, 10% non-binary
  function randomGender(): "male" | "female" | "non-binary" {
    const r = Math.random();
    if (r < 0.45) return "male";
    if (r < 0.90) return "female";
    return "non-binary";
  }

  // Auto-generate worker with random gender when entering a hire step
  useEffect(() => {
    if (step < 1 || unfilledRoles.length === 0) return;
    const role = unfilledRoles[step - 1];
    if (!role) return;
    const g = randomGender();
    queueMicrotask(() => {
      setGender(g);
      generateWorker(role.slug, g);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, unfilledRoles]);

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
    const g = randomGender();
    setGender(g);
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl("");
    generateWorker(role.slug, g);
  }

  async function rerollName() {
    const role = currentRole();
    if (!role) return;
    setRerolling("name");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: role.slug,
          field: "name",
          gender,
          existingNames: [
            ...existingPersonas.map((p) => p.name),
            ...hiredWorkers.map((p) => p.name),
          ],
        }),
      });
      const data = await res.json();
      if (data.name) setName(data.name);
    } catch {}
    setRerolling("");
  }

  async function rerollAppearance() {
    const role = currentRole();
    if (!role) return;
    setRerolling("appearance");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role.slug, field: "appearance", gender }),
      });
      const data = await res.json();
      if (data.appearance) setAppearance(data.appearance);
      // Chain avatar regen to match new appearance
      if (data.appearance) {
        setRerolling("avatar");
        try {
          const avatarRes = await fetch("/api/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              role: role.slug,
              personality: styleImage
                ? `${genderToText(gender)}${data.appearance ? ". " + data.appearance : ""}`
                : data.appearance,
              style: styleImage ? null : getStylePrompt(),
              styleImage: styleImage || null,
            }),
          });
          const avatarData = await avatarRes.json();
          if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
        } catch {}
      }
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
          personality: styleImage
            ? `${genderToText(gender)}${appearance ? ". " + appearance : ""}`
            : appearance,
          style: styleImage ? null : getStylePrompt(),
          styleImage: styleImage || null,
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
  // STEP 0: Art Style — Textarea + Test Avatar
  // ══════════════════════════════════════════════
  if (step === 0) {
    const styleAccent = "#6366f1";
    return (
      <div
        className="flex flex-col h-full relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at 50% 20%, ${styleAccent}10 0%, transparent 50%), var(--bg-primary)`,
        }}
      >
        <div className="flex-1 overflow-y-auto" style={{ padding: "32px 40px 0" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>

            {/* ── Hero: Avatar + Title + Action Buttons ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
              {/* Avatar */}
              <div style={{ position: "relative", marginBottom: 16 }}>
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: "50%",
                    border: `3px solid ${styleAccent}`,
                    overflow: "hidden",
                    position: "relative",
                    isolation: "isolate",
                    boxShadow: `0 0 40px ${styleAccent}30, 0 0 80px ${styleAccent}15`,
                  }}
                >
                  {previewAvatar ? (
                    <img
                      src={previewAvatar}
                      alt="Style preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: "50%",
                        opacity: generatingPreview ? 0.4 : 1,
                        transition: "opacity 0.3s",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: `${styleAccent}15`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {generatingPreview ? (
                        <svg className="w-10 h-10 animate-spin" style={{ color: styleAccent }} fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-10 h-10" style={{ color: `${styleAccent}50` }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      )}
                    </div>
                  )}
                  {generatingPreview && previewAvatar && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg className="w-8 h-8 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                  {/* Reroll overlay */}
                  {previewAvatar && !generatingPreview && (
                    <button
                      onClick={generateStylePreview}
                      className="avatar-reroll-overlay"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        opacity: 0,
                        transition: "opacity 0.2s",
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        backgroundColor: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Title */}
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                Art Direction
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                This style applies to all team avatars
              </p>

              {/* Action: Generate Test Avatar */}
              <button
                onClick={generateStylePreview}
                disabled={generatingPreview || !stylePromptText.trim()}
                style={{
                  padding: "7px 16px",
                  borderRadius: 6,
                  border: `1px solid ${styleAccent}50`,
                  backgroundColor: `${styleAccent}12`,
                  color: styleAccent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: generatingPreview || !stylePromptText.trim() ? "not-allowed" : "pointer",
                  opacity: generatingPreview || !stylePromptText.trim() ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.2s",
                }}
              >
                {generatingPreview && !randomizing ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Generate Test Avatar
                  </>
                )}
              </button>
            </div>

            {/* ── Style Prompt / Image Drop ── */}
            <input
              ref={styleFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleStyleFileInput}
              style={{ display: "none" }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setStyleDragOver(true); }}
              onDragLeave={() => setStyleDragOver(false)}
              onDrop={handleStyleFileDrop}
              style={{
                border: `1px solid ${styleDragOver ? styleAccent + "80" : generatingPreview || randomizing ? styleAccent + "60" : styleAccent + "20"}`,
                borderRadius: 10,
                backgroundColor: styleDragOver ? `${styleAccent}10` : `${styleAccent}04`,
                padding: "16px 18px",
                position: "relative",
                transition: "all 0.15s",
              }}
            >
              {(generatingPreview || randomizing) && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 10,
                  backgroundColor: "rgba(0,0,0,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                  gap: 8,
                }}>
                  <svg className="w-4 h-4 animate-spin" style={{ color: styleAccent }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: styleAccent }}>
                    {randomizing ? "Generating style..." : "Generating avatar..."}
                  </span>
                </div>
              )}

              {/* Header row — always visible */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Style Prompt
                </label>
                {/* Randomize — only in text mode */}
                {!styleImage && (
                  <button
                    onClick={randomizeStyle}
                    disabled={generatingPreview}
                    title="Randomize style"
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: "none",
                      backgroundColor: "transparent", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: generatingPreview ? "not-allowed" : "pointer",
                      opacity: generatingPreview ? 0.3 : 0.5,
                      transition: "opacity 0.2s", padding: 0,
                    }}
                    onMouseEnter={(e) => { if (!generatingPreview) e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { if (!generatingPreview) e.currentTarget.style.opacity = "0.5"; }}
                  >
                    <svg className={`w-3.5 h-3.5 ${randomizing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  </button>
                )}
                {/* Upload photo button */}
                <button
                  onClick={() => styleFileInputRef.current?.click()}
                  title="Upload style reference photo"
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: "none",
                    backgroundColor: "transparent", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s", padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </button>
                {/* Clear image — only when image is set */}
                {styleImage && (
                  <button
                    onClick={() => { setStyleImage(null); setStyleMode("text"); }}
                    title="Remove photo, use text prompt"
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: "none",
                      backgroundColor: "transparent", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s", padding: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Image preview when a photo is set, textarea otherwise */}
              {styleImage ? (
                <div
                  onClick={() => styleFileInputRef.current?.click()}
                  style={{ position: "relative", cursor: "pointer", borderRadius: 6, overflow: "hidden" }}
                >
                  <img
                    src={styleImage}
                    alt="Style reference"
                    style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block", borderRadius: 6 }}
                  />
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 6,
                    background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)",
                    display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 10,
                  }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Click or drag to replace
                    </span>
                  </div>
                </div>
              ) : (
                <textarea
                  value={stylePromptText}
                  onChange={(e) => setStylePromptText(e.target.value)}
                  rows={6}
                  placeholder="Describe the art style, or drag a reference photo onto this box..."
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 6, fontSize: 12,
                    backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)", outline: "none", resize: "vertical", lineHeight: 1.6,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = styleAccent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom: Create Team + Back ── */}
        <div style={{ padding: "20px 40px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={() => router.push("/onboard/project")}
              style={{
                padding: "12px 24px",
                borderRadius: 10,
                border: "1px solid var(--border-medium)",
                backgroundColor: "transparent",
                color: "var(--text-secondary)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Back
            </button>
            <button
              onClick={handleCreateTeam}
              disabled={(styleMode === "photo" ? !styleImage : !previewAvatar) || generatingPreview}
              style={{
                padding: "12px 40px",
                borderRadius: 10,
                border: `2px solid ${styleAccent}`,
                backgroundColor: styleAccent,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.05em",
                cursor: !previewAvatar || generatingPreview ? "not-allowed" : "pointer",
                opacity: !previewAvatar || generatingPreview ? 0.4 : 1,
                boxShadow: `0 0 16px ${styleAccent}30`,
                transition: "all 0.3s",
              }}
            >
              Create Your Team
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em" }}>or</div>
          <button
            onClick={handleAcceptRandomTeam}
            disabled={generatingPreview || saving}
            style={{
              padding: "10px 32px",
              borderRadius: 8,
              border: "1px solid var(--border-medium)",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: generatingPreview || saving ? "not-allowed" : "pointer",
              opacity: generatingPreview || saving ? 0.4 : 1,
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating team...
              </>
            ) : (
              "Accept Random Team"
            )}
          </button>

          {/* Show generating workers progressively */}
          {generatingWorkers.length > 0 && (
            <div style={{
              display: "flex",
              gap: 12,
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 8,
              backgroundColor: `${styleAccent}08`,
              border: `1px solid ${styleAccent}20`,
            }}>
              {generatingWorkers.map((worker, idx) => (
                <div key={`gen-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      border: `2px solid ${worker.color || styleAccent}`,
                      overflow: "hidden",
                      boxShadow: `0 0 12px ${worker.color || styleAccent}30`,
                    }}
                  >
                    {worker.avatar ? (
                      <img src={worker.avatar} alt={worker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: worker.color || styleAccent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#fff"
                      }}>
                        {worker.name[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: worker.color || styleAccent,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {worker.name}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      textTransform: "capitalize",
                    }}>
                      {worker.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`
          .avatar-reroll-overlay:hover {
            opacity: 1 !important;
          }
        `}</style>
        <GeminiSetupModal
          open={showGeminiSetup}
          onClose={() => setShowGeminiSetup(false)}
          onSuccess={() => {
            setShowGeminiSetup(false);
            geminiRetryFn?.();
          }}
        />
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
        <div className="flex items-end gap-3">
          {/* Already-hired from previous sessions */}
          {existingPersonas.map((w) => (
            <div key={`existing-${w.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: `2px solid ${w.color || "var(--border-medium)"}`,
                  overflow: "hidden",
                }}
              >
                {w.avatar ? (
                  <img src={w.avatar} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", backgroundColor: w.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {w.name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, color: w.color || "var(--text-muted)", maxWidth: 52, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
            </div>
          ))}
          {/* Newly hired this session */}
          {hiredWorkers.map((w) => (
            <div key={`hired-${w.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: `2px solid ${w.color || "var(--border-medium)"}`,
                  overflow: "hidden",
                }}
              >
                {w.avatar ? (
                  <img src={w.avatar} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", backgroundColor: w.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {w.name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, color: w.color || "var(--text-muted)", maxWidth: 52, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
            </div>
          ))}
          {/* Current role slot — pulsing ring */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: `2px solid ${accent}`,
                boxShadow: `0 0 12px ${accent}50`,
                overflow: "hidden",
                animation: "gauntlet-pulse 2s ease-in-out infinite",
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
            <span style={{ fontSize: 9, fontWeight: 600, color: accent, maxWidth: 52, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.trim() || role.title}</span>
          </div>
          {/* Remaining locked slots */}
          {unfilledRoles.slice(step).map((r, i) => (
            <div key={`locked-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: `2px solid ${r.color}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${r.color}08`,
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={`${r.color}40`} strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, color: `${r.color}40`, maxWidth: 52, textAlign: "center" }}>{r.title}</span>
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
                  onClick={rerollName}
                  disabled={!!rerolling || generating}
                  title="Reroll name"
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
                    onClick={rerollAppearance}
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
      <GeminiSetupModal
        open={showGeminiSetup}
        onClose={() => setShowGeminiSetup(false)}
        onSuccess={() => {
          setShowGeminiSetup(false);
          geminiRetryFn?.();
        }}
      />
    </div>
  );
}
