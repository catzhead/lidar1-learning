import { useEffect, useRef } from "react";

interface AdaptivePerformanceOptions {
  fps: number;
  getPointBudget: () => number;
  setPointBudget: (budget: number) => void;
}

const MIN_BUDGET = 500_000;
const MAX_BUDGET = 5_000_000;
const TARGET_LOW = 40;
const TARGET_HIGH = 60;
const CHECK_INTERVAL_MS = 2000;

/**
 * Auto-adjusts point budget to maintain 40-60 fps.
 * Checks every 2 seconds:
 * - Below 40fps: reduce budget by 20% (min 500K)
 * - Above 60fps: increase budget by 10% (max 5M)
 */
export function useAdaptivePerformance({
  fps,
  getPointBudget,
  setPointBudget,
}: AdaptivePerformanceOptions): void {
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  const getRef = useRef(getPointBudget);
  getRef.current = getPointBudget;

  const setRef = useRef(setPointBudget);
  setRef.current = setPointBudget;

  useEffect(() => {
    const id = setInterval(() => {
      const currentFps = fpsRef.current;
      const currentBudget = getRef.current();

      if (currentFps > 0 && currentFps < TARGET_LOW) {
        const newBudget = Math.max(MIN_BUDGET, Math.round(currentBudget * 0.8));
        setRef.current(newBudget);
      } else if (currentFps > TARGET_HIGH) {
        const newBudget = Math.min(MAX_BUDGET, Math.round(currentBudget * 1.1));
        setRef.current(newBudget);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);
}
