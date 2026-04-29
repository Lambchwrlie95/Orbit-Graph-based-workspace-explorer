import { useEffect, useRef, useState, useCallback } from "react";

export interface FrameMetrics {
  fps: number;
  droppedFrames: number;
  averageFrameTime: number;
}

export interface UsePerformanceMonitorOptions {
  /** Enable FPS monitoring */
  monitorFps?: boolean;
  /** Enable long task detection */
  monitorLongTasks?: boolean;
  /** Threshold for slow render (ms) */
  slowRenderThreshold?: number;
  /** Callback when slow render detected */
  onSlowRender?: (duration: number, componentName: string) => void;
  /** Callback when FPS drops */
  onLowFps?: (fps: number) => void;
}

export interface UsePerformanceMonitorReturn {
  /** Current FPS */
  fps: number;
  /** Whether performance is poor (FPS < 30) */
  isPoorPerformance: boolean;
  /** Start timing a render */
  startRender: (componentName: string) => () => void;
  /** Frame metrics */
  frameMetrics: FrameMetrics;
  /** Slow render count */
  slowRenderCount: number;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Hook for monitoring component and animation performance
 */
export function usePerformanceMonitor({
  monitorFps = true,
  monitorLongTasks = true,
  slowRenderThreshold = 100,
  onSlowRender,
  onLowFps,
}: UsePerformanceMonitorOptions = {}): UsePerformanceMonitorReturn {
  const [fps, setFps] = useState(60);
  const [isPoorPerformance, setIsPoorPerformance] = useState(false);
  const [slowRenderCount, setSlowRenderCount] = useState(0);
  const [frameMetrics, setFrameMetrics] = useState<FrameMetrics>({
    fps: 60,
    droppedFrames: 0,
    averageFrameTime: 16.67,
  });

  const renderTimings = useRef<Map<string, number>>(new Map());
  const frameTimes = useRef<number[]>([]);
  const lastFrameTime = useRef<number>(performance.now());
  const rafId = useRef<number | null>(null);
  const slowRenderCountRef = useRef(0);

  // FPS monitoring
  useEffect(() => {
    if (!monitorFps) return;

    const measureFrame = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTime.current;
      lastFrameTime.current = now;

      // Keep last 60 frame times
      frameTimes.current.push(frameTime);
      if (frameTimes.current.length > 60) {
        frameTimes.current.shift();
      }

      // Calculate FPS
      const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
      const currentFps = Math.round(1000 / avgFrameTime);
      
      // Count dropped frames (> 33ms = < 30fps)
      const droppedFrames = frameTimes.current.filter((t) => t > 33).length;

      setFps(currentFps);
      setFrameMetrics({
        fps: currentFps,
        droppedFrames,
        averageFrameTime: avgFrameTime,
      });

      const poorPerf = currentFps < 30;
      setIsPoorPerformance(poorPerf);

      if (poorPerf && onLowFps) {
        onLowFps(currentFps);
      }

      rafId.current = requestAnimationFrame(measureFrame);
    };

    rafId.current = requestAnimationFrame(measureFrame);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [monitorFps, onLowFps]);

  // Long task monitoring
  useEffect(() => {
    if (!monitorLongTasks || typeof PerformanceObserver === "undefined") return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > slowRenderThreshold) {
            slowRenderCountRef.current += 1;
            setSlowRenderCount(slowRenderCountRef.current);
            if (onSlowRender) {
              onSlowRender(entry.duration, "longtask");
            }
          }
        }
      });

      observer.observe({ entryTypes: ["longtask"] });
      return () => observer.disconnect();
    } catch {
      // PerformanceObserver not supported
    }
  }, [monitorLongTasks, slowRenderThreshold, onSlowRender]);

  // Start timing a render
  const startRender = useCallback((componentName: string) => {
    const startTime = performance.now();
    renderTimings.current.set(componentName, startTime);

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (duration > slowRenderThreshold) {
        slowRenderCountRef.current += 1;
        setSlowRenderCount(slowRenderCountRef.current);
        if (onSlowRender) {
          onSlowRender(duration, componentName);
        }
      }

      renderTimings.current.delete(componentName);
    };
  }, [slowRenderThreshold, onSlowRender]);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    frameTimes.current = [];
    slowRenderCountRef.current = 0;
    setSlowRenderCount(0);
    setFps(60);
    setIsPoorPerformance(false);
    setFrameMetrics({
      fps: 60,
      droppedFrames: 0,
      averageFrameTime: 16.67,
    });
  }, []);

  return {
    fps,
    isPoorPerformance,
    startRender,
    frameMetrics,
    slowRenderCount,
    resetMetrics,
  };
}

export default usePerformanceMonitor;
