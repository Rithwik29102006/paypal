"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/**
 * Talk to the agent instead of typing (browser speech recognition; hidden where unsupported).
 * Calls onText with the live transcript and onDone with the final sentence.
 */
export function VoiceButton({ onText, onDone, disabled }: { onText: (t: string) => void; onDone: (t: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  // Keep the latest callbacks: the recognizer is created once, the parent re-renders often.
  const cb = useRef({ onText, onDone });
  cb.current = { onText, onDone };

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((res) => res[0].transcript).join(" ").trim();
      finalText.current = text;
      cb.current.onText(text);
    };
    r.onend = () => {
      setListening(false);
      if (finalText.current) cb.current.onDone(finalText.current);
      finalText.current = "";
    };
    r.onerror = () => setListening(false);
    rec.current = r;
    setSupported(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (!rec.current) return;
    if (listening) {
      rec.current.stop();
    } else {
      finalText.current = "";
      rec.current.start();
      setListening(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Speak to the agent"}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        listening ? "bg-stop text-white animate-pulse" : "text-ink-600 hover:bg-mist hover:text-pp"
      )}
    >
      <Mic className="h-5 w-5" />
    </button>
  );
}
