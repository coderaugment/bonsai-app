"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Ticket } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";

interface TicketCardProps {
  ticket: Ticket;
  onDragStart?: (ticketId: string) => void;
  onDragEnd?: () => void;
  onEdit?: (ticket: Ticket) => void;
}

const AGENT_ACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

function isAgentActive(lastAgentActivity?: string): boolean {
  if (!lastAgentActivity) return false;
  const last = new Date(lastAgentActivity).getTime();
  return Date.now() - last < AGENT_ACTIVE_THRESHOLD_MS;
}

type DocStatus = "none" | "pending" | "approved";

function getDocStatus(completedAt?: string, approvedAt?: string): DocStatus {
  if (!completedAt) return "none";
  if (!approvedAt) return "pending";
  return "approved";
}

const statusColors = {
  none: { color: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.03)", opacity: 0.4 },
  pending: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.18)", opacity: 1 },
  approved: { color: "#4ade80", bg: "rgba(74, 222, 128, 0.18)", opacity: 1 },
};


export function TicketCard({ ticket, onDragStart, onDragEnd, onEdit }: TicketCardProps) {
  const style = ticketTypes[ticket.type];
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const researchStatus = getDocStatus(ticket.researchCompletedAt, ticket.researchApprovedAt);
  const planStatus = getDocStatus(ticket.planCompletedAt, ticket.planApprovedAt);

  const agentActive = isAgentActive(ticket.lastAgentActivity);
  const activeAgentId = agentActive ? ticket.assignee?.id : undefined;

  // Build avatar list: creator first, then all agent participants
  const avatars: { label: string; color?: string; imageUrl?: string; isAgent?: boolean; isWorking?: boolean }[] = [];
  if (ticket.creator) {
    avatars.push({
      label: ticket.creator.name,
      imageUrl: ticket.creator.avatarUrl,
      color: "var(--accent-indigo)",
    });
  }
  // Add all unique agent participants (assignee + research/plan authors)
  const seen = new Set<string>();
  for (const p of ticket.participants ?? []) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    avatars.push({
      label: p.name,
      color: p.color,
      imageUrl: p.avatar,
      isAgent: true,
      isWorking: p.id === activeAgentId,
    });
  }
  // Fallback: if no participants but there's an assignee, show them
  if (seen.size === 0 && ticket.assignee) {
    avatars.push({
      label: ticket.assignee.name,
      color: ticket.assignee.color,
      imageUrl: ticket.assignee.avatar,
      isAgent: true,
      isWorking: agentActive,
    });
  }
  const visibleAvatars = avatars.slice(0, 4);
  const overflow = avatars.length - 4;

  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragging(true);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ticket.id);
        onDragStart?.(ticket.id);
      }}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd?.();
      }}
      onClick={() => onEdit?.(ticket)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-2xl p-6 cursor-pointer active:cursor-grabbing"
      style={{
        backgroundColor: "var(--bg-card)",
        border: dragging
          ? "1px solid rgba(91, 141, 249, 0.5)"
          : "1px solid var(--border-subtle)",
        boxShadow: dragging
          ? "0 20px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(91, 141, 249, 0.15), 0 0 24px rgba(91, 141, 249, 0.08)"
          : "0 1px 3px rgba(0, 0, 0, 0.1)",
        transform: dragging ? "scale(1.03) rotate(-2deg)" : "scale(1) rotate(0deg)",
        opacity: dragging ? 0.85 : 1,
        zIndex: dragging ? 10 : "auto",
        transition: "all 180ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      {/* Edit button - appears on hover */}
      {hovered && !dragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(ticket);
          }}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            color: "rgba(255,255,255,0.9)",
          }}
          title="Edit ticket"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
        </button>
      )}

      {/* Badge row */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="px-3 py-1 rounded-lg text-xs font-semibold"
          style={{
            backgroundColor: `color-mix(in srgb, ${style.bg} 15%, transparent)`,
            color: style.text,
          }}
        >
          {style.label}
        </span>
        {agentActive && ticket.assignee && (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.12)",
              color: "#4ade80",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#4ade80" }}
            />
            {ticket.assignee.name} working
          </span>
        )}
        {!agentActive && ticket.createdAt && (
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {ticket.createdAt}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-lg font-bold mb-2.5 leading-tight tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {ticket.title}
      </h3>

      {/* Description */}
      <div
        className="text-[15px] leading-relaxed mb-5 font-normal"
        style={{ color: "rgba(255, 255, 255, 0.7)" }}
      >
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-2">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
            em: ({ children }) => <em>{children}</em>,
            code: ({ children }) => <code className="bg-white/10 px-1 rounded text-[13px]">{children}</code>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            br: () => <br />,
          }}
        >
          {ticket.description.length > 1000
            ? ticket.description.slice(0, 1000) + "..."
            : ticket.description}
        </ReactMarkdown>
      </div>

      {/* Footer: avatar stack + action icons */}
      <div className="flex items-center justify-between">
        {/* Avatar stack */}
        <div className="flex items-center">
          {visibleAvatars.map((av, i) => (
            <div
              key={i}
              style={{
                marginLeft: i > 0 ? -10 : 0,
                zIndex: i + 1,
                position: "relative",
              }}
              title={av.isWorking ? `${av.label} — working` : av.label}
            >
              {/* Pulsing ring for active agent */}
              {av.isWorking && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    border: "2px solid #4ade80",
                    opacity: 0.6,
                  }}
                />
              )}
              {av.isWorking && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    border: "2px solid #4ade80",
                  }}
                />
              )}
              <div
                className="rounded-full flex items-center justify-center text-xs font-semibold text-white"
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: av.color ?? "var(--accent-indigo)",
                  border: av.isWorking ? "2px solid #4ade80" : "2px solid var(--bg-card)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {av.imageUrl ? (
                  <img
                    src={av.imageUrl}
                    alt={av.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  av.label[0]?.toUpperCase()
                )}
              </div>
              {/* Small green dot indicator for working agent */}
              {av.isWorking && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full"
                  style={{
                    backgroundColor: "#4ade80",
                    border: "2px solid var(--bg-card)",
                  }}
                />
              )}
            </div>
          ))}
          {overflow > 0 && (
            <div
              className="rounded-full flex items-center justify-center text-xs font-semibold"
              style={{
                width: 40,
                height: 40,
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "2px solid var(--bg-card)",
                color: "var(--text-muted)",
                marginLeft: -10,
                position: "relative",
              }}
            >
              +{overflow}
            </div>
          )}
          {avatars.length === 0 && (
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                border: "1.5px dashed var(--border-medium)",
                color: "var(--text-muted)",
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
            </div>
          )}
        </div>

        {/* Action icon buttons */}
        <div className="flex items-center gap-2">
          {/* Acceptance criteria indicator */}
          <div
            className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 transition-opacity"
            style={{
              backgroundColor: ticket.acceptanceCriteria ? "rgba(139, 92, 246, 0.18)" : "rgba(255,255,255,0.03)",
              color: ticket.acceptanceCriteria ? "#a78bfa" : "rgba(255,255,255,0.2)",
              opacity: ticket.acceptanceCriteria ? 1 : 0.4,
            }}
            title={ticket.acceptanceCriteria ? "Has acceptance criteria" : "No acceptance criteria"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] font-semibold">AC</span>
          </div>

          {/* Research document status */}
          <div
            className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 transition-opacity"
            style={{
              backgroundColor: statusColors[researchStatus].bg,
              color: statusColors[researchStatus].color,
              opacity: statusColors[researchStatus].opacity,
            }}
            title={`Research: ${researchStatus === "none" ? "Not started" : researchStatus === "pending" ? "Awaiting approval" : "Approved"}`}
          >
            {researchStatus === "pending" && (
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: statusColors[researchStatus].color }}
              />
            )}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-[10px] font-semibold">R</span>
            {researchStatus === "approved" && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>

          {/* Plan document status */}
          <div
            className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 transition-opacity"
            style={{
              backgroundColor: statusColors[planStatus].bg,
              color: statusColors[planStatus].color,
              opacity: statusColors[planStatus].opacity,
            }}
            title={`Plan: ${planStatus === "none" ? "Not started" : planStatus === "pending" ? "Awaiting approval" : "Approved"}`}
          >
            {planStatus === "pending" && (
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: statusColors[planStatus].color }}
              />
            )}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <span className="text-[10px] font-semibold">P</span>
            {planStatus === "approved" && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>

          {/* Comment icon + count */}
          <div
            className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 transition-opacity"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.2)",
              opacity: ticket.commentCount > 0 ? 1 : 0.4,
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-xs font-medium">{ticket.commentCount}</span>
          </div>

          {/* Attachment icon + count */}
          <div
            className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 transition-opacity"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.2)",
              opacity: ticket.hasAttachments ? 1 : 0.4,
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            <span className="text-xs font-medium">{ticket.hasAttachments ? 1 : 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
