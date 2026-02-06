"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

type Section = "preferences" | "api-keys" | "prompts";

const sections: { id: Section; label: string }[] = [
  { id: "preferences", label: "User preferences" },
  { id: "api-keys", label: "API Keys" },
  { id: "prompts", label: "Prompts" },
];

interface SettingsData {
  name: string;
  githubLogin: string;
  githubAvatarUrl: string;
  tokenConnected: boolean;
}

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeSection, setActiveSection] = useState<Section>("preferences");
  const [data, setData] = useState<SettingsData | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setEditingName(false);
    Promise.all([
      fetch("/api/onboard/user").then((r) => r.json()),
      fetch("/api/github/user").then((r) => r.json()),
    ]).then(([userData, githubData]) => {
      const d: SettingsData = {
        name: userData.user?.name ?? "",
        githubLogin: githubData.login ?? "",
        githubAvatarUrl: githubData.avatarUrl ?? "",
        tokenConnected: !!githubData.login,
      };
      setData(d);
      setNameValue(d.name);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  async function handleSaveName() {
    if (!nameValue.trim() || nameValue === data?.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    await fetch("/api/settings/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setData((d) => (d ? { ...d, name: nameValue.trim() } : d));
    setEditingName(false);
    setSaving(false);
  }

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-medium)",
          width: 640,
          height: 500,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10 z-10"
          style={{ color: "var(--text-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left nav */}
        <div
          className="w-48 shrink-0 py-4 px-3 flex flex-col gap-1 border-r"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-wider px-3 mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Settings
          </h2>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor:
                  activeSection === s.id
                    ? "rgba(91, 141, 249, 0.1)"
                    : "transparent",
                color:
                  activeSection === s.id
                    ? "var(--accent-blue)"
                    : "var(--text-secondary)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div className="flex-1 py-5 px-6 overflow-y-auto">
          {!data ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                Loading...
              </span>
            </div>
          ) : activeSection === "preferences" ? (
            <PreferencesSection
              data={data}
              editingName={editingName}
              nameValue={nameValue}
              saving={saving}
              onEditName={() => setEditingName(true)}
              onNameChange={setNameValue}
              onSaveName={handleSaveName}
              onCancelEdit={() => setEditingName(false)}
            />
          ) : activeSection === "api-keys" ? (
            <ApiKeysSection />
          ) : (
            <PromptsSection />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function PreferencesSection({
  data,
  editingName,
  nameValue,
  saving,
  onEditName,
  onNameChange,
  onSaveName,
  onCancelEdit,
}: {
  data: SettingsData;
  editingName: boolean;
  nameValue: string;
  saving: boolean;
  onEditName: () => void;
  onNameChange: (v: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          User preferences
        </h3>
      </div>

      {/* Avatar */}
      <div>
        <label
          className="text-xs font-medium mb-1.5 block"
          style={{ color: "var(--text-muted)" }}
        >
          Avatar
        </label>
        {data.githubAvatarUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={data.githubAvatarUrl}
              alt={data.name}
              className="w-14 h-14 rounded-full object-cover"
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Synced from GitHub
            </span>
          </div>
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium text-white"
            style={{ backgroundColor: "var(--accent-indigo)" }}
          >
            {data.name ? data.name[0].toUpperCase() : "?"}
          </div>
        )}
      </div>

      {/* Name */}
      <div>
        <label
          className="text-xs font-medium mb-1.5 block"
          style={{ color: "var(--text-muted)" }}
        >
          Display name
        </label>
        {editingName ? (
          <div className="flex gap-2 max-w-sm">
            <input
              type="text"
              value={nameValue}
              onChange={(e) => onNameChange(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveName();
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <button
              onClick={onSaveName}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-medium text-white"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {saving ? "..." : "Save"}
            </button>
          </div>
        ) : (
          <button
            onClick={onEditName}
            className="px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {data.name || "Not set"}
          </button>
        )}
      </div>

      {/* GitHub account */}
      <div>
        <label
          className="text-xs font-medium mb-1.5 block"
          style={{ color: "var(--text-muted)" }}
        >
          GitHub account
        </label>
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg max-w-sm"
          style={{ backgroundColor: "var(--bg-input)" }}
        >
          {data.tokenConnected ? (
            <>
              <svg
                className="w-4 h-4 shrink-0"
                style={{ color: "#22c55e" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {data.githubLogin}
              </span>
            </>
          ) : (
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Not connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface VaultKey {
  key: string;
  type: string;
  createdAt: string;
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  useEffect(() => {
    loadKeys();
  }, []);

  function loadKeys() {
    setLoading(true);
    fetch("/api/settings/keys")
      .then((r) => r.json())
      .then((data) => {
        setKeys(data.keys ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  async function handleReveal(key: string) {
    if (revealed[key]) {
      setRevealed((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
      return;
    }
    const res = await fetch("/api/settings/keys/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (data.value) {
      setRevealed((r) => ({ ...r, [key]: data.value }));
    }
  }

  async function handleSave(key: string) {
    if (!editValue.trim()) {
      setEditing(null);
      return;
    }
    setSaving(true);
    await fetch("/api/settings/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: editValue.trim(), type: "api_key" }),
    });
    setEditing(null);
    setEditValue("");
    setRevealed((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    setSaving(false);
    loadKeys();
  }

  async function handleDelete(key: string) {
    await fetch("/api/settings/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    setRevealed((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    loadKeys();
  }

  async function handleAddKey() {
    if (!newKeyName.trim() || !newKeyValue.trim()) return;
    setSaving(true);
    await fetch("/api/settings/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: newKeyName.trim().toLowerCase().replace(/\s+/g, "_"),
        value: newKeyValue.trim(),
        type: "api_key",
      }),
    });
    setAdding(false);
    setNewKeyName("");
    setNewKeyValue("");
    setSaving(false);
    loadKeys();
  }

  const displayLabel = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-5">
      <div>
        <h3
          className="text-base font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          API Keys
        </h3>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Encrypted at rest using your Bonsai vault. Decrypted server-side only when needed.
        </p>
      </div>

      {loading ? (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading...
        </span>
      ) : (
        <>
          {keys.map((k) => (
            <div key={k.key}>
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-muted)" }}
              >
                {displayLabel(k.key)}
              </label>

              {editing === k.key ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                    placeholder="Enter new value"
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-mono outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                    style={{
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-primary)",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave(k.key);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <button
                    onClick={() => handleSave(k.key)}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-white shrink-0"
                    style={{ backgroundColor: "var(--accent-blue)" }}
                  >
                    {saving ? "..." : "Save"}
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: "var(--bg-input)" }}
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    style={{ color: "#22c55e" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  <span
                    className="flex-1 text-sm font-mono truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {revealed[k.key] ?? "••••••••••••••••"}
                  </span>

                  {/* Show/Hide */}
                  <button
                    onClick={() => handleReveal(k.key)}
                    className="p-1 rounded transition-colors hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                    title={revealed[k.key] ? "Hide" : "Show"}
                  >
                    {revealed[k.key] ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      setEditing(k.key);
                      setEditValue("");
                    }}
                    className="p-1 rounded transition-colors hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                    title="Replace"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(k.key)}
                    className="p-1 rounded transition-colors hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}

          {keys.length === 0 && !adding && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No keys stored yet.
            </p>
          )}

          {/* Add new key */}
          {adding ? (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
              }}
            >
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. openai)"
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Value"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddKey();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAdding(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddKey}
                  disabled={saving || !newKeyName.trim() || !newKeyValue.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                >
                  {saving ? "..." : "Encrypt & save"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--accent-blue)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add key
            </button>
          )}
        </>
      )}
    </div>
  );
}

const PROMPT_OPTIONS = [
  { key: "prompt_avatar_style", label: "Team Avatar Style", description: "Art direction for generated worker avatar images" },
];

function PromptsSection() {
  const [selectedKey, setSelectedKey] = useState(PROMPT_OPTIONS[0].key);
  const [prompts, setPrompts] = useState<Record<string, { value: string; isDefault: boolean }>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/settings/prompts")
      .then((r) => r.json())
      .then((data) => {
        setPrompts(data.prompts ?? {});
        setDefaults(data.defaults ?? {});
        const current = data.prompts?.[PROMPT_OPTIONS[0].key];
        setEditValue(current?.value ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleSelectPrompt(key: string) {
    setSelectedKey(key);
    setEditValue(prompts[key]?.value ?? defaults[key] ?? "");
    setDirty(false);
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedKey, value: editValue }),
    });
    setPrompts((prev) => ({
      ...prev,
      [selectedKey]: { value: editValue, isDefault: false },
    }));
    setDirty(false);
    setSaving(false);
  }

  async function handleReset() {
    const res = await fetch("/api/settings/prompts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedKey }),
    });
    const data = await res.json();
    const defaultVal = data.value ?? defaults[selectedKey] ?? "";
    setEditValue(defaultVal);
    setPrompts((prev) => ({
      ...prev,
      [selectedKey]: { value: defaultVal, isDefault: true },
    }));
    setDirty(false);
  }

  const selected = PROMPT_OPTIONS.find((o) => o.key === selectedKey)!;

  return (
    <div className="space-y-5">
      <div>
        <h3
          className="text-base font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Prompts
        </h3>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Customize the AI prompts used for generating team content.
        </p>
      </div>

      {loading ? (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading...
        </span>
      ) : (
        <>
          {/* Prompt selector dropdown */}
          <div>
            <label
              className="text-xs font-medium mb-1.5 block"
              style={{ color: "var(--text-muted)" }}
            >
              Prompt
            </label>
            <select
              value={selectedKey}
              onChange={(e) => handleSelectPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[var(--accent-blue)] appearance-none cursor-pointer"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
              }}
            >
              {PROMPT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {selected.description}
            </p>
          </div>

          {/* Prompt editor */}
          <div>
            <label
              className="text-xs font-medium mb-1.5 block"
              style={{ color: "var(--text-muted)" }}
            >
              Content
            </label>
            <textarea
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setDirty(true);
              }}
              rows={8}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[var(--accent-blue)] resize-y"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border-medium)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                lineHeight: "1.5",
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)" }}
            >
              Reset to default
            </button>
          </div>
        </>
      )}
    </div>
  );
}
