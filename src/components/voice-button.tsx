"use client";

import type { useVoiceInput } from "@/hooks/use-voice-input";

type VoiceState = ReturnType<typeof useVoiceInput>;

interface VoiceButtonProps {
  voice: VoiceState;
  /** Compact style for inline use (e.g. comment bar). Default: false */
  compact?: boolean;
}

export function VoiceButton({ voice, compact = false }: VoiceButtonProps) {
  if (!voice.isSpeechSupported) return null;

  if (voice.isRecording) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
        <button
          type="button"
          onClick={voice.stopRecording}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors bg-green-500/20 text-green-400 hover:bg-green-500/30"
          title="Stop recording and use text"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
        <button
          type="button"
          onClick={voice.cancelRecording}
          className="px-2 py-1 text-xs rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/5"
          title="Cancel and discard"
        >
          Discard
        </button>
      </div>
    );
  }

  if (voice.isProcessingAI) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded opacity-50 text-[var(--text-muted)]">
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Processing...
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={voice.startRecording}
      className={`flex items-center gap-1.5 text-xs rounded transition-colors ${
        compact
          ? "text-[var(--text-muted)] hover:text-white"
          : "px-2.5 py-1 bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-white/10 border border-[var(--border-medium)]"
      }`}
      title="Start voice input"
    >
      <svg className={compact ? "w-4 h-4" : "w-3.5 h-3.5"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={compact ? 1.5 : 2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
      Voice
    </button>
  );
}
