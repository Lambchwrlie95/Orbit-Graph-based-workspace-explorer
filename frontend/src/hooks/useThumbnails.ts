import { useState, useCallback, useRef, useEffect } from 'react';
import { tauriInvoke } from '../lib/tauriCommands';
import type { ThumbnailInfo, ThumbnailResponse } from '../types';

export function useThumbnails() {
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const pendingRequests = useRef<Set<string>>(new Set());

  const getThumbnailKey = (fileId: number, size: number): string => 
    `${fileId}_${size}`;

  const ensureThumbnail = useCallback(async (
    fileId: number, 
    filePath: string,
    fileModifiedAt: number,
    size: number
  ): Promise<string | null> => {
    const key = getThumbnailKey(fileId, size);
    
    // Return cached
    if (thumbnails.has(key)) {
      return thumbnails.get(key)!;
    }
    
    // Skip if already loading or pending
    if (loading.has(key) || pendingRequests.current.has(key)) {
      return null;
    }
    
    pendingRequests.current.add(key);
    setLoading(prev => new Set(prev).add(key));
    
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
        // Convert to asset URL for Tauri
        const assetUrl = `asset://localhost${response.path}`;
        
        setThumbnails(prev => new Map(prev).set(key, assetUrl));
        setErrors(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        
        return assetUrl;
      } else if (response.status === 'error') {
        setErrors(prev => new Map(prev).set(key, response.error || 'Unknown error'));
        return null;
      }
      // status === 'generating' - will be cached on next call
      return null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setErrors(prev => new Map(prev).set(key, errorMsg));
      return null;
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      pendingRequests.current.delete(key);
    }
  }, [thumbnails, loading]);

  const getThumbnailInfo = useCallback(async (fileId: number): Promise<ThumbnailInfo[]> => {
    try {
      return await tauriInvoke('get_thumbnail_info', { fileId });
    } catch (err) {
      console.error('Failed to get thumbnail info:', err);
      return [];
    }
  }, []);

  const isLoading = useCallback((fileId: number, size: number): boolean => {
    return loading.has(getThumbnailKey(fileId, size));
  }, [loading]);

  const getError = useCallback((fileId: number, size: number): string | undefined => {
    return errors.get(getThumbnailKey(fileId, size));
  }, [errors]);

  const loadingCount = loading.size;

  return {
    thumbnails,
    ensureThumbnail,
    getThumbnailInfo,
    isLoading,
    getError,
    loadingCount,
  };
}

export default useThumbnails;
