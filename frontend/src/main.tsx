import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  Folder,
  Image as ImageIcon,
  Info,
  List,
  Network,
  Search as SearchIcon,
} from "lucide-react";
import { AssetMode } from "./components/AssetMode";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ExplorerList } from "./components/ExplorerList";
import { ExplorerTree } from "./components/ExplorerTree";
import { GraphView } from "./components/GraphView";
import { HelpMenuDialogs } from "./components/HelpDialogs";
import { Inspector } from "./components/Inspector";
import { SearchPanel } from "./components/SearchPanel";
import { SettingsPanel, type PerformanceMode } from "./components/SettingsPanel";
import { Splitter } from "./components/Splitter";
import { UnifiedHeader } from "./components/UnifiedHeader";
import { IconEditor } from "./components/IconEditor";
import { useIconTheme } from "./hooks/useIconTheme";
import { useDebounce } from "./hooks/useDebounce";
import { usePersistedState } from "./hooks/usePersistedState";
import { useViewPersistence } from "./hooks/useViewPersistence";
import { tauriInvoke } from "./lib/tauriCommands";
import { clearWikilinkCache } from "./lib/wikilinkResolver";
import { applyFlavor, applyOmarchyColors, loadStoredFlavor } from "./lib/theme";
import { CacheStatus, FileRecord, GraphNode, GraphPayload, GraphWallpaper, PreviewPayload, ScanProgress } from "./types";
import { formatDate, shortPath } from "./utils";
// Zed's UI typography — IBM Plex Sans (OFL) Regular + SemiBold + Italic.
// Loaded via @fontsource so Vite bundles the woff2s with content hashes; we
// don't have to maintain @font-face declarations or download URLs by hand.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./styles.css";

type ExplorerViewMode = "list" | "tree";
type LeftPanel = "explorer" | "search" | "assets";

const BOOKMARKS_KEY = "orbit:bookmarks";
const MAX_BOOKMARKS = 12;
const SETTINGS_KEYS = {
  performanceMode: "orbit:settings:performanceMode",
  thumbnailMemoryCap: "orbit:settings:thumbnailMemoryCap",
  deepScan: "orbit:settings:deepScan",
  graphNodeLimit: "orbit:settings:graphNodeLimit",
  visibleFolderRescan: "orbit:settings:visibleFolderRescan",
  editorCommand: "orbit:settings:editorCommand",
  graph3dWallpaper: "orbit:settings:graph3dWallpaper",
};

const PERFORMANCE_PRESETS: Record<
  PerformanceMode,
  { thumbnailMemoryCap: number; deepScan: boolean; graphNodeLimit: number }
> = {
  eco: { thumbnailMemoryCap: 100, deepScan: false, graphNodeLimit: 300 },
  balanced: { thumbnailMemoryCap: 300, deepScan: false, graphNodeLimit: 900 },
  full: { thumbnailMemoryCap: 800, deepScan: true, graphNodeLimit: 1800 },
};

const POST_SCAN_ANALYSIS_LIMITS: Record<PerformanceMode, { code: number; markdown: number }> = {
  eco: { code: 60, markdown: 40 },
  balanced: { code: 250, markdown: 150 },
  full: { code: Number.POSITIVE_INFINITY, markdown: Number.POSITIVE_INFINITY },
};

const FOCUS_RESCAN_COOLDOWN_MS = 5 * 60_000;
const LARGE_WORKSPACE_AUTO_RESCAN_LIMIT = 25_000;

function capPaths(paths: string[], limit: number) {
  return Number.isFinite(limit) ? paths.slice(0, limit) : paths;
}

function normalizePathForCompare(path: string) {
  return path.replace(/\/+$/, "");
}

function isPathInsideRoot(path: string, rootPath: string) {
  if (!path || !rootPath) return false;
  const normalizedPath = normalizePathForCompare(path);
  const normalizedRoot = normalizePathForCompare(rootPath);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function scopePathInsideRoot(path: string, rootPath: string) {
  return isPathInsideRoot(path, rootPath) ? path : rootPath;
}

function persistSetting(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage is best-effort */
  }
}

function App() {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("explorer");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(340);
  const [rootPath, setRootPath] = useState("");
  const rootPathRef = useRef("");
  const [currentPath, setCurrentPath] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const bookmarksLoadedRef = useRef(false);

  const {
    viewMode: explorerViewMode,
    setViewMode: setExplorerViewMode,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
  } = useViewPersistence(currentPath, "list");

  const [children, setChildren] = useState<FileRecord[]>([]);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [graphPayload, setGraphPayload] = useState<GraphPayload | null>(null);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [expandedGraphFolders, setExpandedGraphFolders] = useState<string[]>([]);
  const [graphNavHistory, setGraphNavHistory] = useState<string[]>([]); // Breadcrumb trail for graph navigation
  const [breadcrumbNodes, setBreadcrumbNodes] = useState<GraphNode[]>([]); // Parent folder nodes to keep visible
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const graphRequestSeqRef = useRef(0);
  const graphInFlightKeyRef = useRef<string | null>(null);
  const lastLoadedGraphKeyRef = useRef<string | null>(null);
  const hasGraphRef = useRef(false);
  const lastFocusRescanRef = useRef(0);

  const debouncedQuery = useDebounce(query, 300);
  const [performanceMode, setPerformanceMode] = usePersistedState<PerformanceMode>(SETTINGS_KEYS.performanceMode, "balanced");
  const [thumbnailMemoryCap, setThumbnailMemoryCap] = usePersistedState<number>(SETTINGS_KEYS.thumbnailMemoryCap, 300);
  const [deepScan, setDeepScan] = usePersistedState<boolean>(SETTINGS_KEYS.deepScan, false);
  const [graphNodeLimit, setGraphNodeLimit] = usePersistedState<number>(SETTINGS_KEYS.graphNodeLimit, 900);
  const [visibleFolderRescan, setVisibleFolderRescan] = usePersistedState<boolean>(SETTINGS_KEYS.visibleFolderRescan, true);
  const [editorCommand, setEditorCommand] = usePersistedState<string>(SETTINGS_KEYS.editorCommand, "kitty -e nvim {file}");
  const [graph3dWallpaper, setGraph3dWallpaper] = usePersistedState<string | null>(SETTINGS_KEYS.graph3dWallpaper, null);
  const [graphWallpapers, setGraphWallpapers] = useState<GraphWallpaper[]>([]);

  useEffect(() => {
    tauriInvoke("list_graph_wallpapers").then(setGraphWallpapers).catch(() => {});
  }, []);

  useEffect(() => {
    rootPathRef.current = rootPath;
  }, [rootPath]);

  // Apply the user's saved flavor (or "Follow Omarchy") at startup, and
  // keep listening for live Omarchy theme changes so the graph + UI follow
  // along whenever colors.toml flips.
  useEffect(() => {
    applyFlavor(loadStoredFlavor()).catch(() => {});

    const unlistenPromise = listen("omarchy-theme-changed", (event) => {
      if (loadStoredFlavor() !== "omarchy") return;
      const payload = event.payload as { available?: boolean } | null;
      if (!payload?.available) return;
      applyOmarchyColors(payload as Parameters<typeof applyOmarchyColors>[0]);
      window.dispatchEvent(new CustomEvent("orbit:omarchy-theme-changed", { detail: payload }));
    });

    const unlistenFlavor = () => {};
    window.addEventListener("orbit:flavor-changed", unlistenFlavor);
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("orbit:flavor-changed", unlistenFlavor);
    };
  }, []);

  const checkCacheStatus = useCallback(async (path: string) => {
    if (!path) return;
    setIsCheckingCache(true);
    try {
      const nextStatus = await tauriInvoke("check_cache_status", { rootPath: path });
      setCacheStatus(nextStatus);
      if (nextStatus.isStale) {
        setStatus(`Cache stale: ${nextStatus.staleReason}`);
      } else if (nextStatus.isFresh) {
        setStatus(`Cache fresh: ${nextStatus.fileCount.toLocaleString()} files`);
      } else if (nextStatus.fileCount === 0) {
        setStatus("No cached data - scan required");
      }
    } catch (err) {
      console.error("Cache check failed:", err);
    } finally {
      setIsCheckingCache(false);
    }
  }, []);

  const loadChildren = useCallback(async (path: string) => {
    if (!path) return;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      // Don't blast the status with "Loading..." for cached-cheap lookups —
      // most folders return in <50ms; only show the indicator if it's slow.
      slowTimer = setTimeout(() => setStatus("Loading folder…"), 120);
      const result = await tauriInvoke("list_children", { parentPath: path });
      setChildren(result);
      setStatus(`${result.length} item${result.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError(String(err));
      setStatus("Error loading directory");
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
    }
  }, []);

  const loadGraph = useCallback(async (
    scopePath: string,
    expanded: string[] = expandedGraphFolders,
    options: { force?: boolean; rootPath?: string } = {},
  ) => {
    console.log("[Main] loadGraph called for path:", scopePath);
    const requestRoot = options.rootPath ?? rootPath;
    if (!requestRoot) {
      console.log("[Main] loadGraph aborted - no rootPath");
      return;
    }
    const safeScopePath = scopePathInsideRoot(scopePath, requestRoot);
    if (safeScopePath !== scopePath) {
      console.warn("[Main] loadGraph scope outside root; using workspace root", { rootPath: requestRoot, scopePath });
    }
    const expandedKey = [...expanded].sort().join("|");
    const requestKey = `${requestRoot}\n${safeScopePath}\n${graphNodeLimit}\n${expandedKey}`;
    if (!options.force && (graphInFlightKeyRef.current === requestKey || lastLoadedGraphKeyRef.current === requestKey)) {
      return;
    }
    const requestSeq = graphRequestSeqRef.current + 1;
    graphRequestSeqRef.current = requestSeq;
    graphInFlightKeyRef.current = requestKey;
    const startTime = performance.now();
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      slowTimer = setTimeout(() => {
        if (graphRequestSeqRef.current === requestSeq) setStatus("Loading graph...");
      }, 120);
      // Show loading overlay immediately if no graph is visible (first load).
      // Defer 300ms if an old graph is still showing — avoids flash on fast loads.
      if (!hasGraphRef.current) {
        setIsGraphLoading(true);
      } else {
        loadingTimer = setTimeout(() => {
          if (graphRequestSeqRef.current === requestSeq) setIsGraphLoading(true);
        }, 300);
      }
      const payload = await tauriInvoke("load_graph", {
        request: {
          rootPath: requestRoot,
          scopePath: safeScopePath,
          mode: "workspace",
          expandedFolders: expanded,
          nodeLimit: graphNodeLimit,
        },
      });
      if (graphRequestSeqRef.current !== requestSeq) return;
      console.log("[Main] loadGraph received payload:", payload?.nodes?.length, "nodes");
      setGraphPayload(payload);
      hasGraphRef.current = true;
      lastLoadedGraphKeyRef.current = requestKey;
      const duration = Math.round(performance.now() - startTime);
      setStatus(
        payload.capped
          ? `${payload.nodes.length.toLocaleString()} graph nodes / ${payload.totalInScope.toLocaleString()} indexed (${duration}ms)`
          : `${payload.nodes.length.toLocaleString()} graph nodes (${duration}ms)`,
      );
    } catch (err) {
      if (graphRequestSeqRef.current !== requestSeq) return;
      console.error("[Main] loadGraph error:", err);
      setError(String(err));
      setStatus("Error loading graph");
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
      if (loadingTimer) clearTimeout(loadingTimer);
      if (graphInFlightKeyRef.current === requestKey) {
        graphInFlightKeyRef.current = null;
      }
      if (graphRequestSeqRef.current === requestSeq) {
        setIsGraphLoading(false);
      }
    }
  }, [expandedGraphFolders, graphNodeLimit, rootPath]);

  const selectRecord = useCallback(async (record: FileRecord) => {
    setSelected(record);
    setRightCollapsed(false);
    setError(null);
    setPreview(null);
    setIsPreviewLoading(true);

    try {
      const previewData = await tauriInvoke("get_preview", { path: record.path });
      setPreview(previewData);
    } catch {
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  const selectPathInsideOrbit = useCallback(async (path: string) => {
    const normalizedPath = path.includes("/__cluster__") ? path.replace("/__cluster__", "") : path;
    const record = await tauriInvoke("get_file", { path: normalizedPath });
    if (!record) {
      setError(`Path is not indexed: ${normalizedPath}`);
      return;
    }
    await selectRecord(record);
    if (record.isDir) {
      setCurrentPath(record.path);
      setLeftPanel("explorer");
      setLeftCollapsed(false);
    }
  }, [selectRecord]);

  const openPath = useCallback(async (path: string) => {
    try {
      await tauriInvoke("open_path", { path });
    } catch (err) {
      setError(`Failed to open: ${err}`);
    }
  }, []);

  const runPostScanAnalysis = useCallback((progress: ScanProgress) => {
    const root = progress.rootPath;
    void (async () => {
      try {
        const buckets = await tauriInvoke("list_analyzable_files", { rootPath: root });
        if (rootPathRef.current !== root) return;

        const limits = deepScan
          ? POST_SCAN_ANALYSIS_LIMITS.full
          : POST_SCAN_ANALYSIS_LIMITS[performanceMode];
        const codePaths = capPaths(buckets.code, limits.code);
        const markdownPaths = capPaths(buckets.markdown, limits.markdown);
        const selectedTotal = codePaths.length + markdownPaths.length;
        const deferredTotal = buckets.code.length + buckets.markdown.length - selectedTotal;

        if (selectedTotal > 0) {
          setStatus(
            deferredTotal > 0
              ? `Analyzing ${selectedTotal.toLocaleString()} files (${deferredTotal.toLocaleString()} deferred)...`
              : `Analyzing ${selectedTotal.toLocaleString()} files for relationships...`,
          );
          if (codePaths.length > 0) {
            await tauriInvoke("batch_analyze_code_files", { paths: codePaths });
          }
          if (markdownPaths.length > 0) {
            await tauriInvoke("batch_analyze_markdown_files", { paths: markdownPaths });
          }
          if (rootPathRef.current !== root) return;
          await loadGraph(root, undefined, { force: true, rootPath: root });
          setStatus(
            deferredTotal > 0
              ? `Analysis complete - ${deferredTotal.toLocaleString()} files deferred`
              : `Analysis complete - ${selectedTotal.toLocaleString()} files`,
          );
        }
      } catch (analysisErr) {
        console.warn("Post-scan analysis failed:", analysisErr);
      }

      if (!deepScan || rootPathRef.current !== root) return;
      try {
        const hashed = await tauriInvoke("compute_workspace_phashes", { rootPath: root });
        if (hashed > 0) {
          console.log(`[Orbit] Indexed ${hashed} new image hash${hashed === 1 ? "" : "es"}`);
        }
      } catch (hashErr) {
        console.warn("Image hash computation failed:", hashErr);
      }
    })();
  }, [deepScan, loadGraph, performanceMode]);

  const applyWorkspace = useCallback(async (path: string, statusText = "Workspace selected") => {
    setIsWorkspaceLoading(true);
    graphRequestSeqRef.current += 1;
    graphInFlightKeyRef.current = null;
    lastLoadedGraphKeyRef.current = null;
    hasGraphRef.current = false;
    // Any wikilink resolutions cached from a previous workspace are now
    // suspect: paths may not even exist in the new workspace, and a
    // returning-to-the-same-workspace flow may have stale results if files
    // moved between visits. Drop the lot on every root change.
    clearWikilinkCache();
    rootPathRef.current = path;
    setRootPath(path);
    setCurrentPath(path);
    setChildren([]);
    setSearchResults([]);
    setGraphPayload(null);
    setExpandedGraphFolders([]);
    setSelected(null);
    setPreview(null);
    setScan(null);
    setStatus(statusText);
    setLeftPanel("explorer");
    setLeftCollapsed(false);

    // If the cache is fresh, populate the UI from it. Otherwise trigger a scan
    // so the user isn't left staring at an empty workbench.
    try {
      setStatus("Checking workspace cache…");
      const status = await tauriInvoke("check_cache_status", { rootPath: path });
      setCacheStatus(status);
      if (status.fileCount > 0 && !status.isStale) {
        setStatus(`Cache fresh · ${status.fileCount.toLocaleString()} files`);
        await loadChildren(path);
        await loadGraph(path, undefined, { rootPath: path });
      } else {
        // Empty or stale cache: auto-scan
        setStatus(status.fileCount === 0 ? "Scanning new workspace…" : "Refreshing stale cache…");
        const progress = await tauriInvoke("scan_workspace", { rootPath: path });
        // Filesystem has been re-indexed — any prior wikilink misses might
        // now be hits and any prior hits might point at moved/renamed files.
        clearWikilinkCache();
        rootPathRef.current = progress.rootPath;
        setRootPath(progress.rootPath);
        setScan(progress);
        setLogPath(progress.logPath ?? null);
        await loadChildren(progress.rootPath);
        await loadGraph(progress.rootPath, undefined, { force: true, rootPath: progress.rootPath });
        await checkCacheStatus(progress.rootPath);
        setStatus(`Scanned ${progress.scanned.toLocaleString()} entries`);
        runPostScanAnalysis(progress);
      }
    } catch (err) {
      console.error("applyWorkspace failed:", err);
      setError(String(err));
      setStatus("Workspace load failed");
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [checkCacheStatus, loadChildren, loadGraph, runPostScanAnalysis]);

  const chooseFolder = useCallback(async () => {
    const selectedFolder = await tauriInvoke("choose_folder");
    if (!selectedFolder) return;
    await applyWorkspace(selectedFolder);
  }, [applyWorkspace]);

  // Icon Editor wiring — opened from the View → Icon Theme → Edit Icons menu.
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const { theme: iconThemePayload, reload: reloadIconTheme } = useIconTheme();
  useEffect(() => {
    const handler = () => setIconEditorOpen(true);
    document.addEventListener("orbit:open-icon-editor", handler);
    return () => document.removeEventListener("orbit:open-icon-editor", handler);
  }, []);

  const scanWorkspace = useCallback(async () => {
    if (!rootPath) return;
    setIsWorkspaceLoading(true);
    setError(null);
    setStatus("Scanning...");
    const scanStartTime = performance.now();
    try {
      const progress = await tauriInvoke("scan_workspace", { rootPath });
      // Same invalidation as the workspace-switch scan path: file index
      // changed, so cached wikilink resolutions can no longer be trusted.
      clearWikilinkCache();
      rootPathRef.current = progress.rootPath;
      setRootPath(progress.rootPath);
      setScan(progress);
      setCurrentPath(progress.rootPath);
      setLogPath(progress.logPath ?? logPath);
      await loadChildren(progress.rootPath);
      await loadGraph(progress.rootPath, undefined, { force: true, rootPath: progress.rootPath });
      await checkCacheStatus(progress.rootPath);
      const totalDuration = Math.round(performance.now() - scanStartTime);
      setStatus(`Scanned ${progress.scanned.toLocaleString()} entries in ${totalDuration}ms`);
      runPostScanAnalysis(progress);
    } catch (err) {
      setError(String(err));
      setStatus("Scan failed");
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [checkCacheStatus, loadChildren, loadGraph, logPath, rootPath, runPostScanAnalysis]);

  const handleSearchQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    if (newQuery.trim()) {
      setLeftPanel("search");
      setLeftCollapsed(false);
    }
  }, []);

  const handleExpandCluster = useCallback(async (folderPath: string) => {
    const newExpanded = Array.from(new Set([...expandedGraphFolders, folderPath]));
    setExpandedGraphFolders(newExpanded);
    await loadGraph(scopePathInsideRoot(currentPath || rootPath, rootPath), newExpanded);
  }, [currentPath, expandedGraphFolders, loadGraph, rootPath]);

  const addCurrentBookmark = useCallback(() => {
    if (!rootPath) return;
    setBookmarks((current) => [rootPath, ...current.filter((path) => path !== rootPath)].slice(0, MAX_BOOKMARKS));
  }, [rootPath]);

  const removeCurrentBookmark = useCallback(() => {
    if (!rootPath) return;
    setBookmarks((current) => current.filter((path) => path !== rootPath));
  }, [rootPath]);

  const openBookmark = useCallback(async (path: string) => {
    await applyWorkspace(path, "Bookmark opened");
  }, [applyWorkspace]);

  const showLeftPanel = useCallback((panel: LeftPanel) => {
    setLeftPanel(panel);
    setLeftCollapsed(false);
  }, []);

  const showRightPanel = useCallback(() => {
    setRightCollapsed(false);
  }, []);

  const openSelected = useCallback(() => {
    if (!selected) return;
    void openPath(selected.path);
  }, [openPath, selected]);

  const openSelectedInEditor = useCallback(async () => {
    if (!selected || selected.isDir) return;
    try {
      await tauriInvoke("open_in_terminal_editor", { path: selected.path, editorCommand });
      setStatus(`Opened selected file with ${editorCommand || "$EDITOR"}`);
    } catch (err) {
      setError(String(err));
      setStatus("External editor failed");
    }
  }, [editorCommand, selected]);

  const copySelectedPath = useCallback(() => {
    if (!selected) return;
    void navigator.clipboard?.writeText(selected.path);
    setStatus("Copied selected path");
  }, [selected]);

  const openThemesFolder = useCallback(async () => {
    try {
      const dir = await tauriInvoke("open_icon_themes_dir");
      await tauriInvoke("open_path", { path: dir });
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const openOrbitConfigDir = useCallback(async () => {
    try {
      const dir = await tauriInvoke("get_orbit_config_dir");
      await tauriInvoke("open_path", { path: dir });
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const clearSelectedThumbnailCache = useCallback(async () => {
    if (!selected || selected.isDir) return;
    try {
      await tauriInvoke("delete_thumbnails", { fileId: selected.id });
      document.dispatchEvent(new CustomEvent("orbit:thumbnail-cache-changed"));
      setStatus("Cleared selected thumbnail cache");
    } catch (err) {
      setError(String(err));
      setStatus("Thumbnail cache clear failed");
    }
  }, [selected]);

  const applyPerformanceMode = useCallback((mode: PerformanceMode) => {
    const preset = PERFORMANCE_PRESETS[mode];
    setPerformanceMode(mode);
    setThumbnailMemoryCap(preset.thumbnailMemoryCap);
    setDeepScan(preset.deepScan);
    setGraphNodeLimit(preset.graphNodeLimit);
    persistSetting(SETTINGS_KEYS.thumbnailMemoryCap, preset.thumbnailMemoryCap);
    persistSetting(SETTINGS_KEYS.deepScan, preset.deepScan);
    persistSetting(SETTINGS_KEYS.graphNodeLimit, preset.graphNodeLimit);
    document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
    setStatus(`Performance mode: ${mode === "full" ? "Full Visuals" : mode[0].toUpperCase() + mode.slice(1)}`);
  }, [setDeepScan, setGraphNodeLimit, setPerformanceMode, setThumbnailMemoryCap]);

  useEffect(() => {
    const saved = localStorage.getItem(BOOKMARKS_KEY);
    if (!saved) {
      bookmarksLoadedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setBookmarks(parsed.filter((path) => typeof path === "string").slice(0, MAX_BOOKMARKS));
      }
    } catch {
      setBookmarks([]);
    }
    bookmarksLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!bookmarksLoadedRef.current) return;
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    tauriInvoke("default_root_path")
      .then((path) => {
        rootPathRef.current = path;
        setRootPath(path);
        setCurrentPath(path);
        void checkCacheStatus(path);
      })
      .catch(() => undefined)
      .finally(() => setIsInitialLoading(false));
    tauriInvoke("get_log_path").then(setLogPath).catch(() => undefined);
  }, [checkCacheStatus]);

  useEffect(() => {
    if (currentPath) {
      const target = rootPath ? scopePathInsideRoot(currentPath, rootPath) : currentPath;
      if (target !== currentPath) {
        setCurrentPath(target);
        return;
      }
      void loadChildren(target);
    }
  }, [currentPath, loadChildren, rootPath]);

  useEffect(() => {
    if (debouncedQuery.trim() && rootPath) {
      const runSearch = async () => {
        try {
          setIsSearching(true);
          setStatus("Searching...");
          const matches = await tauriInvoke("search_files", {
            rootPath,
            query: debouncedQuery,
          });
          setSearchResults(matches);
          setStatus(`${matches.length} matches`);
        } catch (err) {
          setError(String(err));
          setStatus("Search failed");
        } finally {
          setIsSearching(false);
        }
      };
      void runSearch();
    } else {
      setSearchResults([]);
    }
  }, [debouncedQuery, rootPath]);

  // Debounce graph reloads triggered by directory navigation so rapid clicks
  // through subfolders don't fire N expensive scope queries back-to-back.
  useEffect(() => {
    if (!rootPath) return;
    const target = currentPath || rootPath;
    const timer = setTimeout(() => {
      void loadGraph(target);
    }, 180);
    return () => clearTimeout(timer);
  }, [currentPath, loadGraph, rootPath]);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];
    unlisteners.push(listen("menu-open-folder", () => void chooseFolder()));
    return () => {
      unlisteners.forEach((unlisten) => void unlisten.then((fn) => fn()));
    };
  }, [chooseFolder]);

  // External fs changes (folders created in another app, files moved, etc.) are
  // not piped through Tauri yet. When the window regains focus, kick off a
  // background rescan so newly-created folders show up without the user having
  // to click "Scan". Debounced so app-switching doesn't thrash the indexer.
  useEffect(() => {
    if (!rootPath || !visibleFolderRescan) return undefined;
    const refresh = async () => {
      const now = Date.now();
      const target = scopePathInsideRoot(currentPath || rootPath, rootPath);
      // Always re-list the visible folder for cheap/instant feedback
      void loadChildren(target);
      // Don't burn CPU on every alt-tab; sample cache health first and only
      // rescan small stale workspaces automatically.
      if (now - lastFocusRescanRef.current < FOCUS_RESCAN_COOLDOWN_MS) return;
      lastFocusRescanRef.current = now;
      try {
        const nextStatus = await tauriInvoke("check_cache_status", { rootPath });
        setCacheStatus(nextStatus);
        if (!nextStatus.isStale || nextStatus.fileCount > LARGE_WORKSPACE_AUTO_RESCAN_LIMIT) {
          return;
        }
        await tauriInvoke("scan_workspace", { rootPath });
        // Background rescan refreshed the file index; wipe wikilink cache
        // so any open inspector resolves links against the new state.
        clearWikilinkCache();
        await loadChildren(target);
        await loadGraph(target, undefined, { force: true });
        await checkCacheStatus(rootPath);
      } catch (err) {
        console.warn("Background rescan failed:", err);
      }
    };
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rootPath, currentPath, loadChildren, loadGraph, checkCacheStatus, visibleFolderRescan]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+B - toggle left sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      }
      // Cmd/Ctrl+Shift+B - toggle right sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "b" && e.shiftKey) {
        e.preventDefault();
        setRightCollapsed((v) => !v);
      }
      // Cmd/Ctrl+J - toggle bottom panel (placeholder for future)
      if ((e.metaKey || e.ctrlKey) && e.key === "j" && !e.shiftKey) {
        e.preventDefault();
        // Future: toggle bottom panel
      }
      // Cmd/Ctrl+1-3 - switch left panel tabs
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        const panels: LeftPanel[] = ["explorer", "search", "assets"];
        const index = parseInt(e.key, 10) - 1;
        if (panels[index]) {
          showLeftPanel(panels[index]);
          setLeftCollapsed(false);
        }
      }
      // Ctrl+P - command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((value) => !value);
        return;
      }
      // Ctrl+L - edit path in header
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("orbit:edit-path"));
      }

      // Ignore the rest while typing in inputs / contenteditable
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      // ? - keyboard shortcuts dialog
      if (e.key === "?") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("orbit:keyboard-help"));
      }

      // Alt/Backspace - graph back navigation
      if (e.key === "Backspace") {
        e.preventDefault();
        if (graphNavHistory.length > 0) {
          const previous = graphNavHistory[graphNavHistory.length - 1];
          setGraphNavHistory(graphNavHistory.slice(0, -1));
          setBreadcrumbNodes(breadcrumbNodes.filter((n) => n.path !== previous));
          setCurrentPath(previous);
          showLeftPanel("explorer");
          void loadGraph(previous);
        }
      }
      // Space - quick-launch the OS image viewer when an image is selected
      if (e.key === " " && selected && !selected.isDir) {
        const ext = (selected.extension ?? "").toLowerCase();
        if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "svg"].includes(ext)) {
          e.preventDefault();
          void openPath(selected.path);
          return;
        }
      }

      // Enter - open / drill into the selection
      if (e.key === "Enter" && selected) {
        e.preventDefault();
        if (selected.isDir) {
          setCurrentPath(selected.path);
          showLeftPanel("explorer");
          void loadGraph(selected.path);
        } else {
          void openPath(selected.path);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [graphNavHistory, breadcrumbNodes, selected, openPath, loadGraph, showLeftPanel]);

  const leftPanelLabel = {
    explorer: "Explorer",
    search: "Search",
    assets: "Assets",
  }[leftPanel];

  const appBusy = isInitialLoading || isWorkspaceLoading || isGraphLoading || isCheckingCache || isSearching;
  const busyLabel = isInitialLoading
    ? "Starting Orbit…"
    : isWorkspaceLoading
      ? status
      : isGraphLoading
        ? "Loading graph…"
        : isCheckingCache
          ? "Checking cache…"
          : isSearching
            ? "Searching…"
            : status;

  const paletteCommands = useMemo<PaletteCommand[]>(() => [
    { id: "open-folder", label: "Open folder", hint: "Workspace", run: chooseFolder },
    { id: "rescan", label: "Rescan workspace", hint: rootPath ? shortPath(rootPath) : "No workspace", disabled: !rootPath, run: () => void scanWorkspace() },
    { id: "toggle-labels", label: "Toggle labels", hint: "Graph", run: () => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-labels")) },
    { id: "toggle-icons", label: "Toggle icons mode", hint: "Graph", run: () => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-icons")) },
    {
      id: "open-selected-editor",
      label: "Open selected in $EDITOR",
      hint: selected?.name,
      disabled: !selected || selected.isDir,
      run: () => void openSelectedInEditor(),
    },
    {
      id: "copy-selected",
      label: "Copy selected path",
      hint: selected?.name,
      disabled: !selected,
      run: copySelectedPath,
    },
    {
      id: "icon-editor",
      label: "Open icon editor",
      hint: "Icons",
      run: () => document.dispatchEvent(new CustomEvent("orbit:open-icon-editor")),
    },
    { id: "themes-folder", label: "Open themes folder", hint: "Icons", run: () => void openThemesFolder() },
    {
      id: "clear-thumbnail-cache",
      label: "Clear thumbnail cache",
      hint: selected ? selected.name : "Select a file first",
      disabled: !selected || selected.isDir,
      run: () => void clearSelectedThumbnailCache(),
    },
    { id: "settings", label: "Open settings", hint: "General / Performance / Editor", run: () => setSettingsOpen(true) },
  ], [
    chooseFolder,
    clearSelectedThumbnailCache,
    copySelectedPath,
    openSelectedInEditor,
    openThemesFolder,
    rootPath,
    scanWorkspace,
    selected,
  ]);

  return (
    <main className="app-shell">
      <UnifiedHeader
        workspacePath={rootPath}
        currentPath={currentPath || rootPath}
        selectedPath={selected?.path}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => setLeftCollapsed((value) => !value)}
        onToggleRight={() => setRightCollapsed((value) => !value)}
        onOpenFolder={chooseFolder}
        onScan={scanWorkspace}
        onRefreshGraph={() => void loadGraph(currentPath || rootPath, undefined, { force: true })}
        onOpenSelected={openSelected}
        onCopySelected={copySelectedPath}
        onAddBookmark={addCurrentBookmark}
        onShowExplorer={() => showLeftPanel("explorer")}
        onShowSearch={() => showLeftPanel("search")}
        onShowAssets={() => showLeftPanel("assets")}
        onShowInspector={() => showRightPanel()}
        onOpenSettings={() => setSettingsOpen(true)}
        onNavigateToPath={(path) => {
          if (!path) return;
          const target = scopePathInsideRoot(path, rootPath);
          // Path-bar / breadcrumb navigation: jump explorer + graph and ensure
          // the left panel is visible so the user actually sees the change.
          setCurrentPath(target);
          setLeftPanel("explorer");
          setLeftCollapsed(false);
          void loadGraph(target);
        }}
      />

      {appBusy && (
        <div className="app-loading-strip" role="status" aria-live="polite">
          <div className="app-loading-bar" />
          <span>{busyLabel}</span>
        </div>
      )}

      <section
        className={`workbench ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`}
        style={{ "--left-width": `${leftWidth}px`, "--right-width": `${rightWidth}px` } as React.CSSProperties}
      >
        <aside className="pane left-pane">
          <div className="side-nav" aria-label="Left panel">
            <PanelButton active={leftPanel === "explorer"} label="Explorer" onClick={() => setLeftPanel("explorer")} icon={<Folder size={15} />} />
            <PanelButton active={leftPanel === "search"} label="Search" onClick={() => setLeftPanel("search")} icon={<SearchIcon size={15} />} />
            <PanelButton active={leftPanel === "assets"} label="Assets" onClick={() => setLeftPanel("assets")} icon={<ImageIcon size={15} />} />
          </div>

          <div className="side-panel-title">
            <h2>{leftPanelLabel}</h2>
          </div>

          <div className="left-panel-content">
            {leftPanel === "explorer" && (
              <ExplorerSidePanel
                explorerViewMode={explorerViewMode}
                setExplorerViewMode={setExplorerViewMode}
                currentPath={currentPath}
                rootPath={rootPath}
                children={children}
                selectedPath={selected?.path}
                selectRecord={selectRecord}
                setCurrentPath={setCurrentPath}
              />
            )}

            {leftPanel === "search" && (
              <SearchPanel
                rootPath={rootPath}
                query={query}
                results={searchResults}
                selectedPath={selected?.path}
                isLoading={isSearching}
                onQueryChange={handleSearchQueryChange}
                onSelect={selectRecord}
                onOpen={(record) => {
                  if (record.isDir) {
                    setCurrentPath(record.path);
                    showLeftPanel("explorer");
                  } else {
                    void openPath(record.path);
                  }
                }}
              />
            )}

            {leftPanel === "assets" && (
              <AssetMode
                files={children}
                currentPath={currentPath}
                onSelect={(record) => void selectRecord(record)}
              />
            )}
          </div>

          <BookmarksPanel
            bookmarks={bookmarks}
            currentRootPath={rootPath}
            onAddCurrent={addCurrentBookmark}
            onRemoveCurrent={removeCurrentBookmark}
            onOpenBookmark={openBookmark}
          />
        </aside>

        <Splitter
          side="left"
          size={leftCollapsed ? 0 : leftWidth}
          onSizeChange={setLeftWidth}
          onToggle={() => setLeftCollapsed(!leftCollapsed)}
          collapsed={leftCollapsed}
        />

        <section className="pane center-pane">
          <ErrorBoundary
            fallbackTitle="Graph unavailable"
            resetKey={[
              currentPath,
              graphPayload?.nodes.length ?? 0,
              graphPayload?.edges.length ?? 0,
              expandedGraphFolders.join("|"),
            ].join(":")}
          >
            <GraphView
              payload={graphPayload}
              selectedPath={selected?.path}
              wallpaper3d={graph3dWallpaper}
              onSelectPath={selectPathInsideOrbit}
              onOpenPath={openPath}
              editorCommand={editorCommand}
              onFocusFolder={(path) => {
                // Build breadcrumb trail: keep history of visited folders
                if (currentPath && currentPath !== path && selected) {
                  // Check if we're navigating back to a previous folder
                  const existingIndex = graphNavHistory.indexOf(path);
                  if (existingIndex !== -1) {
                    // Navigating back - truncate history to that point
                    setGraphNavHistory(graphNavHistory.slice(0, existingIndex));
                    // Remove breadcrumb nodes that are now forward in the trail
                    setBreadcrumbNodes(breadcrumbNodes.filter(n => !graphNavHistory.slice(existingIndex).includes(n.path)));
                  } else {
                    // Navigating forward - add current folder node to breadcrumbs
                    const currentNode: GraphNode = {
                      id: Date.now() + Math.random(), // temporary unique id
                      path: currentPath,
                      label: currentPath.split('/').pop() || currentPath,
                      isDir: true,
                      sizeBytes: 0,
                      childCount: 0,
                      extension: null,
                      isCluster: false,
                    };
                    setGraphNavHistory([...graphNavHistory, currentPath]);
                    setBreadcrumbNodes([...breadcrumbNodes, currentNode]);
                  }
                }
                setCurrentPath(path);
                showLeftPanel("explorer");
                void loadGraph(path);
              }}
              onExpandCluster={handleExpandCluster}
              onGoBack={() => {
                if (graphNavHistory.length === 0) return;
                const previous = graphNavHistory[graphNavHistory.length - 1];
                const nextHistory = graphNavHistory.slice(0, -1);
                const droppedNode = breadcrumbNodes.find((n) => n.path === previous);
                setGraphNavHistory(nextHistory);
                setBreadcrumbNodes(breadcrumbNodes.filter((n) => n.path !== previous));
                setCurrentPath(previous);
                showLeftPanel("explorer");
                void loadGraph(previous);
                if (droppedNode) {
                  void selectPathInsideOrbit(previous);
                }
              }}
              expandedFolders={expandedGraphFolders}
              navHistory={graphNavHistory}
              breadcrumbNodes={breadcrumbNodes}
              isLoading={isGraphLoading}
            />
          </ErrorBoundary>
        </section>

        <Splitter
          side="right"
          size={rightCollapsed ? 0 : rightWidth}
          onSizeChange={setRightWidth}
          onToggle={() => setRightCollapsed(!rightCollapsed)}
          collapsed={rightCollapsed}
        />

        <aside className="pane right-pane">
          <Inspector
            record={selected}
            preview={preview}
            isLoadingPreview={isPreviewLoading}
            rootPath={rootPath}
            onOpen={openPath}
            onSelectPath={selectPathInsideOrbit}
            onNavigate={(path) => {
              setCurrentPath(path);
              setLeftPanel("explorer");
              setLeftCollapsed(false);
            }}
            onRenamed={async (_oldPath, newPath) => {
              void loadChildren(currentPath);
              try {
                const renamed = await tauriInvoke("get_file", { path: newPath });
                if (renamed) await selectRecord(renamed);
              } catch {
                /* selection refresh is best-effort */
              }
            }}
          />
        </aside>
      </section>

      <footer className="statusbar">
        <span>⬡ Graph</span>
        <span>◈ {leftPanelLabel}</span>
        <span className={appBusy ? "status-busy" : ""} title={busyLabel}>
          {appBusy && <i className="mini-spinner" aria-hidden />}
          {busyLabel}
        </span>
        <span>{selected ? `· ${selected.name}` : "◌ No selection"}</span>
        <span>{cacheStatus?.fileCount ? `⊞ ${cacheStatus.fileCount.toLocaleString()} indexed` : "⊟ No cache"}</span>
        {logPath && <span title={logPath}>≡ Log {shortPath(logPath)}</span>}
      </footer>

      <HelpMenuDialogs />

      <IconEditor
        open={iconEditorOpen}
        onClose={() => setIconEditorOpen(false)}
        activeTheme={iconThemePayload}
        onSaved={() => {
          // Re-fetch the active theme so the graph re-resolves icons.
          void reloadIconTheme();
          document.dispatchEvent(new CustomEvent("orbit:icon-theme-changed"));
        }}
      />

      <CommandPalette
        open={commandPaletteOpen}
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        performanceMode={performanceMode}
        onPerformanceModeChange={applyPerformanceMode}
        thumbnailMemoryCap={thumbnailMemoryCap}
        onThumbnailMemoryCapChange={(value) => {
          setThumbnailMemoryCap(value);
          persistSetting(SETTINGS_KEYS.thumbnailMemoryCap, value);
          document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
        }}
        deepScan={deepScan}
        onDeepScanChange={setDeepScan}
        graphNodeLimit={graphNodeLimit}
        onGraphNodeLimitChange={(value) => {
          setGraphNodeLimit(value);
          persistSetting(SETTINGS_KEYS.graphNodeLimit, value);
          lastLoadedGraphKeyRef.current = null;
          document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
        }}
        visibleFolderRescan={visibleFolderRescan}
        onVisibleFolderRescanChange={setVisibleFolderRescan}
        editorCommand={editorCommand}
        onEditorCommandChange={setEditorCommand}
        onOpenThemesFolder={() => void openThemesFolder()}
        onOpenOrbitConfigDir={() => void openOrbitConfigDir()}
        onClearSelectedThumbnailCache={() => void clearSelectedThumbnailCache()}
        canClearSelectedThumbnailCache={Boolean(selected && !selected.isDir)}
        wallpapers={graphWallpapers}
        graph3dWallpaper={graph3dWallpaper}
        onGraph3dWallpaperChange={setGraph3dWallpaper}
      />
    </main>
  );
}

interface PanelButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}

function PanelButton({ active, label, onClick, icon }: PanelButtonProps) {
  return (
    <button
      type="button"
      className={`panel-tab ${active ? "active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

interface ExplorerSidePanelProps {
  explorerViewMode: ExplorerViewMode;
  setExplorerViewMode: (mode: ExplorerViewMode) => void;
  currentPath: string;
  rootPath: string;
  children: FileRecord[];
  selectedPath?: string;
  selectRecord: (record: FileRecord) => Promise<void>;
  setCurrentPath: (path: string) => void;
  onFsChanged?: (newPath?: string) => void;
}

function ExplorerSidePanel({
  explorerViewMode,
  setExplorerViewMode,
  currentPath,
  rootPath,
  children,
  selectedPath,
  selectRecord,
  setCurrentPath,
  onFsChanged,
}: ExplorerSidePanelProps) {
  return (
    <div className="side-explorer">
      <div className="view-toggle icon-toggle" aria-label="Explorer view mode">
        <button className={explorerViewMode === "list" ? "active" : ""} onClick={() => setExplorerViewMode("list")} title="List">
          <List size={13} />
        </button>
        <button className={explorerViewMode === "tree" ? "active" : ""} onClick={() => setExplorerViewMode("tree")} title="Tree">
          <Network size={13} />
        </button>
      </div>

      <div className="side-path" title={currentPath}>{currentPath || rootPath}</div>

      <div className="side-explorer-body">
        {explorerViewMode === "list" ? (
          <ExplorerList
            currentPath={currentPath}
            rootPath={rootPath}
            items={children}
            selectedPath={selectedPath}
            onSelect={selectRecord}
            onNavigate={setCurrentPath}
            onFsChanged={onFsChanged}
          />
        ) : (
          <ExplorerTree
            rootPath={rootPath}
            selectedPath={selectedPath}
            onSelect={selectRecord}
            onNavigate={setCurrentPath}
          />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
