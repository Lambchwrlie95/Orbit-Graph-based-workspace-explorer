import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook to monitor frame rate
 * Returns current FPS and whether performance is poor
 */
export function useFrameRateMonitor() {
  const [fps, setFps] = useState(60);
  const [isPoorPerformance, setIsPoorPerformance] = useState(false);
  const frameTimes = useRef<number[]>([]);
  const lastFrameTime = useRef<number>(performance.now());
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 500; // Update state max every 500ms

    const measureFrame = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTime.current;
      lastFrameTime.current = now;

      frameTimes.current.push(frameTime);
      if (frameTimes.current.length > 30) {
        frameTimes.current.shift();
      }

      // Only update React state periodically, not every frame
      if (now - lastUpdate >= UPDATE_INTERVAL) {
        lastUpdate = now;

        const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
        const currentFps = Math.round(1000 / avgFrameTime);
        
        setFps(currentFps);
        setIsPoorPerformance(currentFps < 30);
      }

      rafId.current = requestAnimationFrame(measureFrame);
    };

    rafId.current = requestAnimationFrame(measureFrame);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return { fps, isPoorPerformance };
}

/**
 * Hook to detect long running tasks that block the main thread
 */
export function useLongTaskDetector(thresholdMs: number = 100) {
  const [longTaskCount, setLongTaskCount] = useState(0);
  const [lastLongTask, setLastLongTask] = useState<{ duration: number; timestamp: number } | null>(null);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > thresholdMs) {
            setLongTaskCount((prev) => prev + 1);
            setLastLongTask({
              duration: entry.duration,
              timestamp: Date.now(),
            });
          }
        }
      });

      observer.observe({ entryTypes: ["longtask"] });
      return () => observer.disconnect();
    } catch {
      // PerformanceObserver not supported
    }
  }, [thresholdMs]);

  return { longTaskCount, lastLongTask };
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Hook to measure component render time
 */
export function useRenderTime(componentName: string, thresholdMs: number = 50) {
  const renderStart = useRef<number>(performance.now());
  const [renderTime, setRenderTime] = useState(0);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const endTime = performance.now();
    const duration = endTime - renderStart.current;
    setRenderTime(duration);
    setIsSlow(duration > thresholdMs);

    if (duration > thresholdMs) {
      console.warn(`[Performance] ${componentName} rendered slowly: ${duration.toFixed(2)}ms`);
    }

    // Reset for next render
    renderStart.current = performance.now();
  });

  return { renderTime, isSlow };
}

export default {
  useFrameRateMonitor,
  useLongTaskDetector,
  debounce,
  throttle,
  useRenderTime,
};
