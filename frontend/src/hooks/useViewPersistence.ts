import { useState, useEffect, useCallback } from "react";

export type ExplorerViewMode = "list" | "tree" | "grid" | "columns";

const STORAGE_KEY = (path: string) => `orbit:view:${path}`;
const STORAGE_KEY_ICON_SIZE = (path: string) => `orbit:view:iconSize:${path}`;
const STORAGE_KEY_SORT = (path: string) => `orbit:view:sort:${path}`;

export interface ViewPersistenceState {
  viewMode: ExplorerViewMode;
  setViewMode: (mode: ExplorerViewMode) => void;
  iconSize: 48 | 64 | 96 | 128;
  setIconSize: (size: 48 | 64 | 96 | 128) => void;
  sortBy: "name" | "size" | "modified";
  setSortBy: (sort: "name" | "size" | "modified") => void;
  sortDirection: "asc" | "desc";
  setSortDirection: (dir: "asc" | "desc") => void;
  isLoaded: boolean;
}

/**
 * useViewPersistence - Hook for persisting and retrieving view mode per folder path
 *
 * Supports all Explorer view modes: list, tree, grid, and columns (Miller columns/Finder-style).
 *
 * Stores view preferences in localStorage with the following keys:
 * - `orbit:view:${folderPath}` - The view mode (list, tree, grid, columns)
 * - `orbit:view:iconSize:${folderPath}` - Grid icon size (48, 64, 96, 128)
 * - `orbit:view:sort:${folderPath}` - Sort configuration object
 *
 * @param folderPath - The current folder path to persist view for
 * @param defaultView - Default view mode if none stored
 * @returns ViewPersistenceState with view settings and setters
 */
export function useViewPersistence(
  folderPath: string,
  defaultView: ExplorerViewMode = "list"
): ViewPersistenceState {
  const [viewMode, setViewModeState] = useState<ExplorerViewMode>(defaultView);
  const [iconSize, setIconSizeState] = useState<48 | 64 | 96 | 128>(64);
  const [sortBy, setSortByState] = useState<"name" | "size" | "modified">("name");
  const [sortDirection, setSortDirectionState] = useState<"asc" | "desc">("asc");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted state from localStorage on mount or folder change
  useEffect(() => {
    if (!folderPath) {
      setIsLoaded(true);
      return;
    }

    try {
      // Load view mode
      const storedView = localStorage.getItem(STORAGE_KEY(folderPath));
      if (storedView) {
        const validModes: ExplorerViewMode[] = ["list", "tree", "grid", "columns"];
        if (validModes.includes(storedView as ExplorerViewMode)) {
          setViewModeState(storedView as ExplorerViewMode);
        }
      }

      // Load icon size
      const storedIconSize = localStorage.getItem(STORAGE_KEY_ICON_SIZE(folderPath));
      if (storedIconSize) {
        const size = parseInt(storedIconSize, 10);
        if ([48, 64, 96, 128].includes(size)) {
          setIconSizeState(size as 48 | 64 | 96 | 128);
        }
      }

      // Load sort configuration
      const storedSort = localStorage.getItem(STORAGE_KEY_SORT(folderPath));
      if (storedSort) {
        const parsed = JSON.parse(storedSort);
        if (parsed.by && ["name", "size", "modified"].includes(parsed.by)) {
          setSortByState(parsed.by);
        }
        if (parsed.dir && ["asc", "desc"].includes(parsed.dir)) {
          setSortDirectionState(parsed.dir);
        }
      }
    } catch {
      // Ignore localStorage errors (SSR, disabled, quota exceeded, etc.)
    }

    setIsLoaded(true);
  }, [folderPath, defaultView]);

  // Persist view mode changes
  const setViewMode = useCallback((mode: ExplorerViewMode) => {
    setViewModeState(mode);
    if (!folderPath || !isLoaded) return;
    
    try {
      localStorage.setItem(STORAGE_KEY(folderPath), mode);
    } catch {
      // Ignore localStorage errors
    }
  }, [folderPath, isLoaded]);

  // Persist icon size changes
  const setIconSize = useCallback((size: 48 | 64 | 96 | 128) => {
    setIconSizeState(size);
    if (!folderPath || !isLoaded) return;
    
    try {
      localStorage.setItem(STORAGE_KEY_ICON_SIZE(folderPath), String(size));
    } catch {
      // Ignore localStorage errors
    }
  }, [folderPath, isLoaded]);

  // Persist sort changes
  const setSortBy = useCallback((sort: "name" | "size" | "modified") => {
    setSortByState(sort);
    if (!folderPath || !isLoaded) return;
    
    try {
      const currentDir = sortDirection;
      localStorage.setItem(
        STORAGE_KEY_SORT(folderPath),
        JSON.stringify({ by: sort, dir: currentDir })
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [folderPath, isLoaded, sortDirection]);

  // Persist sort direction changes
  const setSortDirection = useCallback((dir: "asc" | "desc") => {
    setSortDirectionState(dir);
    if (!folderPath || !isLoaded) return;
    
    try {
      localStorage.setItem(
        STORAGE_KEY_SORT(folderPath),
        JSON.stringify({ by: sortBy, dir })
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [folderPath, isLoaded, sortBy]);

  return {
    viewMode,
    setViewMode,
    iconSize,
    setIconSize,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    isLoaded,
  };
}

/**
 * Clear the stored view preference for a specific folder path
 * @param folderPath - The folder path to clear preferences for
 */
export function clearViewPreference(folderPath: string): void {
  if (!folderPath) return;
  
  try {
    localStorage.removeItem(STORAGE_KEY(folderPath));
    localStorage.removeItem(STORAGE_KEY_ICON_SIZE(folderPath));
    localStorage.removeItem(STORAGE_KEY_SORT(folderPath));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Clear all Orbit view preferences from localStorage
 * Use with caution - this removes all view mode, icon size, and sort preferences
 */
export function clearAllViewPreferences(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("orbit:view:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Ignore localStorage errors
  }
}

export default useViewPersistence;
