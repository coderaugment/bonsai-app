"use client";

import { useState, useRef, useCallback } from "react";
import type { Persona, ProjectMessage, CommentAttachment } from "@/types";
import { CommentInput } from "./comment-input";
import { usePolling } from "@/hooks/use-polling";

interface ProjectChatPanelProps {
  projectId: string;
  personas: Persona[];
  open: boolean;
  onClose: () => void;
  initialMentionPersonaId?: string | null;
}

export function ProjectChatPanel({
  projectId,
  personas,
  open,
  onClose,
  initialMentionPersonaId: _initialMentionPersonaId,
}: ProjectChatPanelProps) {
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [typingPersona, setTypingPersona] = useState<{
    name: string;
    color?: string;
    avatarUrl?: string;
  } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  // Fetch messages callback
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chat?limit=100`);
      if (res.ok) {
        const fresh: ProjectMessage[] = await res.json();
        setMessages(fresh);

        // Clear typing indicator if new messages arrived
        if (fresh.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
          setTypingPersona(null);
          setTimeout(
            () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
            100
          );
        }
        prevMessageCountRef.current = fresh.length;
      }
    } catch {
      /* skip */
    }
  }, [projectId]);

  // Poll messages while open
  usePolling(fetchMessages, open ? 10_000 : null);

  async function handlePost(text: string, attachments: CommentAttachment[]) {
    if (!text.trim() && attachments.length === 0) return;

    // Optimistic: add message immediately
    const optimistic: ProjectMessage = {
      id: Date.now(),
      projectId: Number(projectId),
      authorType: "human",
      author: { name: "You" },
      content: text.trim(),
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    prevMessageCountRef.current += 1;
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50
    );

    // Post to server
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });

    if (res.ok) {
      // Show typing indicator if we mentioned someone
      // Show typing indicator — find mentioned persona or default to lead
      const mentioned = personas.find((p) => {
        const pat = new RegExp(
          `@${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        return pat.test(text);
      });
      const responder = mentioned || personas.find((p) => p.role === "researcher");
      if (responder) {
        setTypingPersona({
          name: responder.name,
          color: responder.color,
          avatarUrl: responder.avatar,
        });
        if (typingTimeoutRef.current)
          clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(
          () => setTypingPersona(null),
          120_000
        );
      }

      // Refresh to get server-side message with proper ID
      setTimeout(fetchMessages, 500);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        width: "380px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-primary)",
        borderLeft: "1px solid var(--border-medium)",
        flexShrink: 0,
      }}
    >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ color: "var(--text-muted)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
              />
            </svg>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Project Chat
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {messages.length} messages
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-muted)" }}
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{ minHeight: 0 }}
        >
          {messages.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full gap-3"
              style={{ color: "var(--text-muted)" }}
            >
              <svg
                className="w-12 h-12 opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
              <span className="text-sm">Start a conversation with your team</span>
              <span className="text-xs">
                Use @name to mention a team member
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {/* Typing indicator */}
              {typingPersona && (
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
                    style={{
                      backgroundColor:
                        typingPersona.color || "var(--accent-indigo)",
                    }}
                  >
                    {typingPersona.avatarUrl ? (
                      <img
                        src={typingPersona.avatarUrl}
                        alt={typingPersona.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      typingPersona.name?.[0]?.toUpperCase() || "A"
                    )}
                  </div>
                  <div className="flex items-center gap-1 py-2">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {typingPersona.name}
                    </span>
                    <span className="flex gap-0.5 ml-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: "var(--text-muted)",
                            animation: `chat-typing-dot 1.4s infinite ${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <CommentInput
          personasList={personas}
          placeholder="Message your team... @ to mention"
          onPost={handlePost}
          enableVoice={false}
        />

      <style>{`
        @keyframes chat-typing-dot {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ message }: { message: ProjectMessage }) {
  const isHuman = message.authorType === "human";
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  function renderContent(text: string) {
    const parts = text.split(/(@[\w\p{L}-]+)/gu);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span
          key={i}
          className="font-medium"
          style={{ color: "var(--accent-blue)" }}
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
        style={{
          backgroundColor: message.author?.color || (isHuman ? "var(--accent-blue)" : "var(--accent-indigo)"),
        }}
      >
        {message.author?.avatarUrl ? (
          <img
            src={message.author.avatarUrl}
            alt={message.author?.name || (isHuman ? "You" : "Agent")}
            className="w-full h-full object-cover"
          />
        ) : (
          (message.author?.name?.[0] || (isHuman ? "Y" : "A")).toUpperCase()
        )}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: name, badge, timestamp */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {message.author?.name || (isHuman ? "You" : "Agent")}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: isHuman ? "rgba(59, 130, 246, 0.15)" : "rgba(139, 92, 246, 0.15)",
              color: isHuman ? "#60a5fa" : "#a78bfa",
            }}
          >
            {!isHuman && message.author?.role ? message.author.role : message.authorType}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {time}
          </span>
        </div>
        {/* Message content - no bubble styling */}
        {message.content && (
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            {renderContent(message.content)}
          </div>
        )}
        {/* Message attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att, i) => {
              const isImage = att.type?.startsWith("image/");
              return isImage ? (
                <img
                  key={i}
                  src={att.data}
                  alt={att.name}
                  className="max-w-[200px] max-h-[150px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  style={{
                    border: "1px solid var(--border-medium)",
                    backgroundColor: "#1a1a1a",
                    backgroundImage:
                      "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), " +
                      "linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), " +
                      "linear-gradient(45deg, transparent 75%, #2a2a2a 75%), " +
                      "linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  }}
                />
              ) : (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span>{att.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
