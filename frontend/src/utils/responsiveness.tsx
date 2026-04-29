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
    const measureFrame = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTime.current;
      lastFrameTime.current = now;

      frameTimes.current.push(frameTime);
      if (frameTimes.current.length > 30) {
        frameTimes.current.shift();
      }

      const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
      const currentFps = Math.round(1000 / avgFrameTime);
      
      setFps(currentFps);
      setIsPoorPerformance(currentFps < 30);

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
 * Component that shows a warning when performance is poor
 */
export interface ResponsivenessWarningProps {
  fps: number;
  slowRenderCount: number;
  onDismiss?: () => void;
  onOptimize?: () => void;
}

export function ResponsivenessWarning({
  fps,
  slowRenderCount,
  onDismiss,
  onOptimize,
}: ResponsivenessWarningProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;
  if (fps >= 30 && slowRenderCount === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        background: "#3a2a1a",
        border: "1px solid #fbbf24",
        borderRadius: 8,
        padding: 16,
        maxWidth: 300,
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <strong style={{ color: "#fbbf24" }}>Performance Warning</strong>
      </div>
      
      {fps < 30 && (
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#e5edf4" }}>
          Low frame rate detected ({fps} FPS)
        </p>
      )}
      
      {slowRenderCount > 0 && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#e5edf4" }}>
          {slowRenderCount} slow renders detected
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {onOptimize && (
          <button
            onClick={onOptimize}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              background: "#fbbf24",
              color: "#1a1a1a",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Optimize
          </button>
        )}
        <button
          onClick={() => {
            setIsDismissed(true);
            onDismiss?.();
          }}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            background: "transparent",
            color: "#8ca1af",
            border: "1px solid #3d596c",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
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
  ResponsivenessWarning,
  debounce,
  throttle,
  useRenderTime,
};
