import { useCallback, useEffect, useRef, useState } from 'react';

export function useGameTimer(initialElapsedMs = 0, startPaused = false) {
  const [elapsedMs, setElapsedMs] = useState(initialElapsedMs);
  const [paused, setPaused] = useState(startPaused);
  const baseRef = useRef(initialElapsedMs);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    if (startedAtRef.current === null) startedAtRef.current = performance.now();
    const id = window.setInterval(() => {
      const started = startedAtRef.current ?? performance.now();
      setElapsedMs(baseRef.current + (performance.now() - started));
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const pause = useCallback(() => {
    if (paused) return;
    if (startedAtRef.current !== null) {
      baseRef.current += performance.now() - startedAtRef.current;
    }
    startedAtRef.current = null;
    setElapsedMs(baseRef.current);
    setPaused(true);
  }, [paused]);

  const resume = useCallback(() => {
    if (!paused) return;
    startedAtRef.current = performance.now();
    setPaused(false);
  }, [paused]);

  const reset = useCallback((ms = 0, startRunning = true) => {
    baseRef.current = ms;
    startedAtRef.current = startRunning ? performance.now() : null;
    setElapsedMs(ms);
    setPaused(!startRunning);
  }, []);

  return { elapsedMs, paused, pause, resume, reset };
}
