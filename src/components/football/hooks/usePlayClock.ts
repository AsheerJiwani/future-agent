"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlayClock(durationMs: number) {
  const [t, setT] = useState(0); // 0..1
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const tRef = useRef(0);
  useEffect(() => { tRef.current = t; }, [t]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
  }, []);

  const tick = useCallback((now: number) => {
    const elapsed = now - startTimeRef.current;
    const u = Math.min(1, Math.max(0, elapsed / durationMs));
    setT(u);
    if (u < 1) rafRef.current = requestAnimationFrame(tick);
    else {
      rafRef.current = null;
      setPlaying(false);
    }
  }, [durationMs]);

  const start = useCallback(() => {
    // Cancel any existing frame and start fresh to avoid stale guards
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPlaying(true);
    // resume support: place startTime so that current t is respected
    startTimeRef.current = performance.now() - tRef.current * durationMs;
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, tick]);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setT(0);
  }, []);

  // Keep RAF cleaned up on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Explicit seek helper for external controls
  const seek = useCallback((newT: number) => {
    const clamped = Math.max(0, Math.min(1, newT));
    setT(clamped);
    if (playing) {
      startTimeRef.current = performance.now() - clamped * durationMs;
    }
  }, [playing, durationMs]);

  return { t, setT, seek, playing, start, stop, reset } as const;
}
