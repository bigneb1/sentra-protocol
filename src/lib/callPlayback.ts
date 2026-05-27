import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CallPlaybackState = "idle" | "playing" | "paused" | "unsupported";

function speechChunks(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (next.length > 220 && current) {
      chunks.push(current);
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function useCallPlayback(text: string, audioUrl?: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance[]>([]);
  const chunkIndexRef = useRef(0);
  const [state, setState] = useState<CallPlaybackState>("idle");

  const supported = useMemo(
    () =>
      Boolean(audioUrl) ||
      (typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        "SpeechSynthesisUtterance" in window),
    [audioUrl],
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = [];
    chunkIndexRef.current = 0;
    setState(supported ? "idle" : "unsupported");
  }, [supported]);

  const play = useCallback(() => {
    const chunks = speechChunks(text);
    if (!supported || (!audioUrl && chunks.length === 0)) {
      setState("unsupported");
      return;
    }

    if (audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => setState("idle");
        audioRef.current.onerror = () => setState("idle");
      }
      void audioRef.current.play();
      setState("playing");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("unsupported");
      return;
    }

    window.speechSynthesis.cancel();
    chunkIndexRef.current = 0;
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find(
        (item) => /en/i.test(item.lang) && /female|samantha|aria|jenny/i.test(item.name),
      ) ??
      voices.find((item) => /en/i.test(item.lang)) ??
      null;
    const utterances = chunks.map((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voice) utterance.voice = voice;
      utterance.volume = 1;
      utterance.rate = 0.92;
      utterance.pitch = 0.98;
      utterance.onend = () => {
        if (index === utterances.length - 1) setState("idle");
      };
      utterance.onerror = () => setState("idle");
      return utterance;
    });
    utteranceRef.current = utterances;
    utterances.forEach((utterance) => window.speechSynthesis.speak(utterance));
    setState("playing");
  }, [audioUrl, supported, text]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState("paused");
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setState("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.play();
      setState("playing");
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      setState("playing");
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "playing") {
      pause();
      return;
    }
    if (state === "paused") {
      resume();
      return;
    }
    play();
  }, [pause, play, resume, state]);

  useEffect(() => stop, [stop]);

  return { state, playing: state === "playing", supported, play, pause, resume, stop, toggle };
}
