"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";

export function ProjectSettings({ project }: { project: Project }) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [ghOwner, setGhOwner] = useState(project.githubOwner || "");
  const [ghRepo, setGhRepo] = useState(project.githubRepo || "");
  const connected = !!(ghOwner && ghRepo);

  async function handleConnectGithub() {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/projects/connect-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect GitHub");
      } else {
        setGhOwner(data.owner);
        setGhRepo(data.repo);
      }
    } catch {
      setError("Network error");
    }
    setConnecting(false);
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-10 py-6 border-b"
        style={{ borderBottomColor: "var(--border-subtle)" }}
      >
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Project settings
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
          style={{ color: "var(--text-secondary)" }}
        >
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div className="max-w-lg flex flex-col gap-8">
          {/* Local Path */}
          <section>
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              Local Directory
            </h2>
            <div
              className="rounded-lg px-5 py-4 border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-medium)",
              }}
            >
              <code className="text-sm" style={{ color: "var(--text-primary)" }}>
                {project.localPath || "Not set"}
              </code>
            </div>
          </section>

          {/* GitHub Repository */}
          <section>
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              GitHub Repository
            </h2>

            {connected ? (
              <div
                className="rounded-lg px-5 py-4 border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-medium)",
                }}
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <a
                    href={`https://github.com/${ghOwner}/${ghRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline"
                    style={{ color: "var(--accent-blue)" }}
                  >
                    {ghOwner}/{ghRepo}
                  </a>
                  <span
                    className="ml-auto text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(52, 211, 153, 0.15)", color: "#34d399" }}
                  >
                    Connected
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="rounded-lg px-5 py-5 border flex flex-col items-center gap-3"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-medium)",
                }}
              >
                <svg
                  className="w-8 h-8"
                  style={{ color: "var(--text-muted)" }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
                  No GitHub repository connected.
                  <br />
                  <span style={{ color: "var(--text-muted)" }}>
                    Bonsai will create a private repo named <strong>{project.slug}</strong>
                  </span>
                </p>
                <button
                  onClick={handleConnectGithub}
                  disabled={connecting}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                >
                  {connecting ? "Connecting..." : "Create & connect repo"}
                </button>
                {error && (
                  <p className="text-xs" style={{ color: "#ef4444" }}>
                    {error}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
