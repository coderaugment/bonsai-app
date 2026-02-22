"use client";

import { useState, useRef, useEffect } from "react";

interface PreviewPanelProps {
  url: string | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  ticketId?: number;
}

export function PreviewPanel({ url, loading, error, onClose, ticketId }: PreviewPanelProps) {
  const [iframeKey, setIframeKey] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRebuild = async () => {
    if (!ticketId || rebuilding) return;

    setRebuilding(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/rebuild-preview`, {
        method: "POST",
      });

      if (res.ok) {
        // Refresh iframe after rebuild completes
        setIframeKey(prev => prev + 1);
      } else {
        const data = await res.json();
        alert(`Rebuild failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Rebuild failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRebuilding(false);
    }
  };

  // Prevent browser from navigating when files are dragged over/dropped on iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    iframe.addEventListener('dragover', preventDefaults);
    iframe.addEventListener('drop', preventDefaults);

    return () => {
      iframe.removeEventListener('dragover', preventDefaults);
      iframe.removeEventListener('drop', preventDefaults);
    };
  }, [iframeKey]); // Re-attach listeners when iframe is refreshed

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-8" style={{ color: "var(--text-secondary)" }}>
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <div className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Preview not available</div>
            <pre className="text-xs text-left whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>{error}</pre>
          </div>
          <div className="flex gap-3">
            {ticketId && (
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="px-4 py-2 rounded-lg text-sm transition-opacity"
                style={{
                  backgroundColor: rebuilding ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.2)",
                  color: rebuilding ? "rgba(147, 197, 253, 0.5)" : "rgba(147, 197, 253, 1)",
                  cursor: rebuilding ? "not-allowed" : "pointer",
                  opacity: rebuilding ? 0.5 : 1,
                }}
              >
                {rebuilding ? "Rebuilding..." : "Rebuild & Run"}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-opacity"
                style={{ backgroundColor: "var(--bg-input)", color: "var(--text-secondary)" }}
              >
                Back to board
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Starting dev server...</span>
        </div>
      </div>
    );
  }

  if (!url) {
    return null;
  }

  return (
    <>
      {/* Refresh and Rebuild buttons - Apple glass style */}
      <div className="flex items-center justify-center gap-3 py-3 px-8">
        <button
          onClick={() => setIframeKey(prev => prev + 1)}
          className="p-2 rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
          title="Refresh preview"
          disabled={rebuilding}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: rebuilding ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.9)" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>

        {ticketId && (
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="px-4 py-2 rounded-full transition-all hover:scale-105 active:scale-95 text-sm font-medium"
            style={{
              backgroundColor: rebuilding ? "rgba(255, 255, 255, 0.05)" : "rgba(59, 130, 246, 0.2)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: `1px solid ${rebuilding ? "rgba(255, 255, 255, 0.1)" : "rgba(59, 130, 246, 0.3)"}`,
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
              color: rebuilding ? "rgba(255, 255, 255, 0.4)" : "rgba(147, 197, 253, 1)",
              cursor: rebuilding ? "not-allowed" : "pointer",
            }}
            title="Rebuild and restart dev server"
          >
            {rebuilding ? "Rebuilding..." : "Rebuild & Run"}
          </button>
        )}
      </div>
      <iframe
        ref={iframeRef}
        key={iframeKey}
        src={url}
        className="flex-1 w-full border-0"
        style={{ backgroundColor: "var(--bg-primary)" }}
        title="Live Preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      />
    </>
  );
}
