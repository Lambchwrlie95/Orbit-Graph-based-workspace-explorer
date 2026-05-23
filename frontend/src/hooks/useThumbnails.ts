import { useState, useCallback, useRef, useEffect } from 'react';
import { tauriInvoke } from '../lib/tauriCommands';
import type { ThumbnailInfo, ThumbnailResponse } from '../types';

const THUMBNAIL_CAP_KEY = "orbit:settings:thumbnailMemoryCap";
const MAX_CONCURRENT = 6;

export function useThumbnails() {
  // Render state — only what the UI reads.
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [loadingCount, setLoadingCount] = useState(0);

  // Refs for mutation tracking — read inside callbacks without causing cascade.
  const thumbnailsRef = useRef<Map<string, string>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());
  const memoryCapRef = useRef(readNumberSetting(THUMBNAIL_CAP_KEY, 300));
  const concurrentRef = useRef(0);
  const queue = useRef<Array<() => void>>([]);

  useEffect(() => {
    const refreshCap = () => { memoryCapRef.current = readNumberSetting(THUMBNAIL_CAP_KEY, 300); };
    const clearCache = () => {
      thumbnailsRef.current = new Map();
      inFlight.current = new Set();
      setThumbnails(new Map());
    };
    document.addEventListener("orbit:settings-changed", refreshCap);
    document.addEventListener("orbit:thumbnail-cache-changed", clearCache);
    return () => {
      document.removeEventListener("orbit:settings-changed", refreshCap);
      document.removeEventListener("orbit:thumbnail-cache-changed", clearCache);
    };
  }, []);

  const drainQueue = useCallback(() => {
    while (concurrentRef.current < MAX_CONCURRENT && queue.current.length > 0) {
      const next = queue.current.shift();
      next?.();
    }
  }, []);

  // Stable callback — no state in deps, reads refs instead.
  const ensureThumbnail = useCallback((
    fileId: number,
    filePath: string,
    fileModifiedAt: number,
    size: number,
  ): void => {
    const key = `${fileId}_${size}`;
    if (thumbnailsRef.current.has(key) || inFlight.current.has(key)) return;

    inFlight.current.add(key);

    const run = async () => {
      concurrentRef.current += 1;
      setLoadingCount(c => c + 1);
      try {
        const response: ThumbnailResponse = await tauriInvoke('ensure_thumbnail', {
          request: {
            file_id: fileId,
            file_path: filePath,
            file_modified_at: fileModifiedAt,
            size,
          }
        });
        if (response.status === 'ready' && response.path) {
          const assetUrl = `asset://localhost${response.path}`;
          thumbnailsRef.current.delete(key);
          thumbnailsRef.current.set(key, assetUrl);
          while (thumbnailsRef.current.size > memoryCapRef.current) {
            const oldest = thumbnailsRef.current.keys().next().value;
            if (oldest === undefined) break;
            thumbnailsRef.current.delete(oldest);
          }
          setThumbnails(new Map(thumbnailsRef.current));
        }
      } catch {
        // silently drop; tile stays as placeholder
      } finally {
        inFlight.current.delete(key);
        concurrentRef.current -= 1;
        setLoadingCount(c => Math.max(0, c - 1));
        drainQueue();
      }
    };

    if (concurrentRef.current < MAX_CONCURRENT) {
      void run();
    } else {
      queue.current.push(() => void run());
    }
  }, [drainQueue]);

  const getThumbnailInfo = useCallback(async (fileId: number): Promise<ThumbnailInfo[]> => {
    try {
      return await tauriInvoke('get_thumbnail_info', { fileId });
    } catch {
      return [];
    }
  }, []);

  const isLoading = useCallback((fileId: number, size: number): boolean => {
    return inFlight.current.has(`${fileId}_${size}`);
  }, []);

  return { thumbnails, ensureThumbnail, getThumbnailInfo, isLoading, loadingCount };
}

export default useThumbnails;

function readNumberSetting(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
