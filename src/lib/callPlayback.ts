import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CallPlaybackState = "idle" | "playing" | "paused" | "unsupported";

export function useCallPlayback(text: string, audioUrl?: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
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
    utteranceRef.current = null;
    setState(supported ? "idle" : "unsupported");
  }, [supported]);

  const play = useCallback(() => {
    if (!supported) {
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
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 0.92;
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
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
