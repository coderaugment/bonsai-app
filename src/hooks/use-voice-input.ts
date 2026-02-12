"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Web Speech API TypeScript declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface WindowWithSpeechRecognition {
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  SpeechRecognition?: SpeechRecognitionConstructor;
}

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
  /** If true, send transcript to /api/generate-title for cleanup. Default: true */
  aiCleanup?: boolean;
  /** Which generate-title field to use for AI cleanup. Default: "massage" */
  aiField?: string;
}

export function useVoiceInput({ onTranscript, aiCleanup = true, aiField = "massage" }: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks whether onend should process the transcript (stop) vs discard (cancel/error)
  const shouldProcessRef = useRef(false);
  const finalTranscriptRef = useRef("");

  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  useEffect(() => {
    setIsSpeechSupported(
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  const processTranscript = useCallback(
    async (transcript: string) => {
      if (!transcript) {
        setInterimTranscript("");
        return;
      }

      if (!aiCleanup) {
        onTranscript(transcript);
        setInterimTranscript("");
        return;
      }

      setIsProcessingAI(true);
      try {
        const res = await fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: transcript, field: aiField }),
        });
        const data = await res.json();
        onTranscript(data[aiField] || transcript);
      } catch {
        onTranscript(transcript);
      } finally {
        setIsProcessingAI(false);
        setInterimTranscript("");
      }
    },
    [onTranscript, aiCleanup, aiField]
  );

  const startRecording = useCallback(() => {
    if (!isSpeechSupported) return;

    try {
      const speechWindow = window as unknown as WindowWithSpeechRecognition;
      const Ctor =
        speechWindow.webkitSpeechRecognition ||
        speechWindow.SpeechRecognition;
      if (!Ctor) return;
      const recognition: SpeechRecognition = new Ctor();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      finalTranscriptRef.current = "";
      shouldProcessRef.current = false;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += t + " ";
          } else {
            interim += t;
          }
        }
        setInterimTranscript(finalTranscriptRef.current + interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // "aborted" fires when cancelRecording() calls abort() — not a real error
        if (event.error === "aborted") return;
        console.error("Speech recognition error:", event.error);
        shouldProcessRef.current = false;
        setIsRecording(false);
        setInterimTranscript("");
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (shouldProcessRef.current) {
          shouldProcessRef.current = false;
          processTranscript(finalTranscriptRef.current.trim());
        } else {
          setInterimTranscript("");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);

      // Safety timeout: auto-stop after 2 minutes
      recordingTimeoutRef.current = setTimeout(() => {
        shouldProcessRef.current = true;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        recordingTimeoutRef.current = null;
      }, 120000);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [isSpeechSupported, processTranscript]);

  const stopRecording = useCallback(() => {
    shouldProcessRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    shouldProcessRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setIsRecording(false);
    setInterimTranscript("");
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessingAI,
    interimTranscript,
    isSpeechSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
  };
}
