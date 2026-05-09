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
  SquareCode,
} from "lucide-react";
import { AssetMode } from "./components/AssetMode";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { CodeMode, isEditableFile } from "./components/CodeMode";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ExplorerList } from "./components/ExplorerList";
import { ExplorerTree } from "./components/ExplorerTree";
import { GraphView } from "./components/GraphView";
import { HelpMenuDialogs } from "./components/HelpDialogs";
import { Inspector } from "./components/Inspector";
import { SearchPanel } from "./components/SearchPanel";
import { SettingsPanel, type EditorMode, type PerformanceMode } from "./components/SettingsPanel";
import { Splitter } from "./components/Splitter";
import { UnifiedHeader } from "./components/UnifiedHeader";
import { IconEditor } from "./components/IconEditor";
import { useIconTheme } from "./hooks/useIconTheme";
import { useDebounce } from "./hooks/useDebounce";
import { useOpenFiles } from "./hooks/useOpenFiles";
import { usePersistedState } from "./hooks/usePersistedState";
import { useViewPersistence } from "./hooks/useViewPersistence";
import { tauriInvoke } from "./lib/tauriCommands";
import { CacheStatus, FileRecord, GraphNode, GraphPayload, PreviewPayload, ScanProgress } from "./types";
import { formatDate, shortPath } from "./utils";
import "./styles.css";

type ExplorerViewMode = "list" | "tree";
type LeftPanel = "explorer" | "search" | "assets";
type RightPanel = "inspector" | "code";

const BOOKMARKS_KEY = "orbit:bookmarks";
const MAX_BOOKMARKS = 12;
const SETTINGS_KEYS = {
  performanceMode: "orbit:settings:performanceMode",
  thumbnailMemoryCap: "orbit:settings:thumbnailMemoryCap",
  editorMode: "orbit:settings:editorMode",
  monacoMinimap: "orbit:settings:monacoMinimap",
  deepScan: "orbit:settings:deepScan",
  visibleFolderRescan: "orbit:settings:visibleFolderRescan",
};

const PERFORMANCE_PRESETS: Record<
  PerformanceMode,
  { thumbnailMemoryCap: number; monacoMinimap: boolean; deepScan: boolean }
> = {
  eco: { thumbnailMemoryCap: 100, monacoMinimap: false, deepScan: false },
  balanced: { thumbnailMemoryCap: 300, monacoMinimap: false, deepScan: false },
  full: { thumbnailMemoryCap: 800, monacoMinimap: true, deepScan: true },
};

function persistSetting(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage is best-effort */
  }
}

function App() {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("explorer");
  const [rightPanel, setRightPanel] = useState<RightPanel>("inspector");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(340);
  const [rootPath, setRootPath] = useState("");
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

  const debouncedQuery = useDebounce(query, 300);
  const [performanceMode, setPerformanceMode] = usePersistedState<PerformanceMode>(SETTINGS_KEYS.performanceMode, "balanced");
  const [thumbnailMemoryCap, setThumbnailMemoryCap] = usePersistedState<number>(SETTINGS_KEYS.thumbnailMemoryCap, 300);
  const [editorMode, setEditorMode] = usePersistedState<EditorMode>(SETTINGS_KEYS.editorMode, "light");
  const [monacoMinimap, setMonacoMinimap] = usePersistedState<boolean>(SETTINGS_KEYS.monacoMinimap, false);
  const [deepScan, setDeepScan] = usePersistedState<boolean>(SETTINGS_KEYS.deepScan, false);
  const [visibleFolderRescan, setVisibleFolderRescan] = usePersistedState<boolean>(SETTINGS_KEYS.visibleFolderRescan, true);

  const { openFileInEditor } = useOpenFiles({
    onSwitchToCodeMode: () => {
      setRightPanel("code");
      setRightCollapsed(false);
    },
  });

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

  const loadGraph = useCallback(async (scopePath: string, expanded: string[] = expandedGraphFolders) => {
    console.log("[Main] loadGraph called for path:", scopePath);
    if (!rootPath) {
      console.log("[Main] loadGraph aborted - no rootPath");
      return;
    }
    setIsGraphLoading(true);
    const startTime = performance.now();
    try {
      setStatus("Loading graph...");
      const payload = await tauriInvoke("load_graph", {
        request: {
          rootPath,
          scopePath,
          mode: "workspace",
          expandedFolders: expanded,
        },
      });
      console.log("[Main] loadGraph received payload:", payload?.nodes?.length, "nodes");
      setGraphPayload(payload);
      const duration = Math.round(performance.now() - startTime);
      setStatus(`${payload.nodes.length} graph nodes (${duration}ms)`);
    } catch (err) {
      console.error("[Main] loadGraph error:", err);
      setError(String(err));
      setStatus("Error loading graph");
    } finally {
      setIsGraphLoading(false);
    }
  }, [expandedGraphFolders, rootPath]);

  const selectRecord = useCallback(async (record: FileRecord) => {
    setSelected(record);
    setRightPanel("inspector");
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

  const applyWorkspace = useCallback(async (path: string, statusText = "Workspace selected") => {
    setIsWorkspaceLoading(true);
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
        await loadGraph(path);
      } else {
        // Empty or stale cache: auto-scan
        setStatus(status.fileCount === 0 ? "Scanning new workspace…" : "Refreshing stale cache…");
        const progress = await tauriInvoke("scan_workspace", { rootPath: path });
        setScan(progress);
        setLogPath(progress.logPath ?? null);
        await loadChildren(progress.rootPath);
        await loadGraph(progress.rootPath);
        await checkCacheStatus(progress.rootPath);
        setStatus(`Scanned ${progress.scanned.toLocaleString()} entries`);

        // Background analysis (mirrors scanWorkspace flow)
        void (async () => {
          try {
            const buckets = await tauriInvoke("list_analyzable_files", {
              rootPath: progress.rootPath,
            });
            if (buckets.code.length > 0) {
              await tauriInvoke("batch_analyze_code_files", { paths: buckets.code });
            }
            if (buckets.markdown.length > 0) {
              await tauriInvoke("batch_analyze_markdown_files", { paths: buckets.markdown });
            }
            if (buckets.code.length + buckets.markdown.length > 0) {
              await loadGraph(progress.rootPath);
            }
            await tauriInvoke("compute_workspace_phashes", { rootPath: progress.rootPath });
          } catch (analysisErr) {
            console.warn("Post-scan analysis failed:", analysisErr);
          }
        })();
      }
    } catch (err) {
      console.error("applyWorkspace failed:", err);
      setError(String(err));
      setStatus("Workspace load failed");
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [checkCacheStatus, loadChildren, loadGraph]);

  const chooseFolder = useCallback(async () => {
    const selectedFolder = await tauriInvoke("choose_folder");
    if (!selectedFolder) return;
    await applyWorkspace(selectedFolder);
  }, [applyWorkspace]);

  const handleOpenInEditor = useCallback(async (record: FileRecord) => {
    if (!isEditableFile(record)) {
      setError(`Cannot edit file type: ${record.extension || "unknown"}`);
      return;
    }

    try {
      await openFileInEditor(record);
    } catch (err) {
      setError(`Failed to open file: ${err}`);
    }
  }, [openFileInEditor]);

  // Bridge: markdown preview emits `orbit:open-file` with a resolved path; look it up
  // in the index and route through the standard edit flow.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail) return;
      try {
        const file = await tauriInvoke("get_file", { path: detail });
        if (file) {
          if (file.isDir) {
            setCurrentPath(file.path);
            setLeftPanel("explorer");
            setLeftCollapsed(false);
          } else {
            await handleOpenInEditor(file);
          }
        }
      } catch (err) {
        console.warn("Open-from-link failed:", err);
      }
    };
    window.addEventListener("orbit:open-file", handler);
    return () => window.removeEventListener("orbit:open-file", handler);
  }, [handleOpenInEditor]);

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
      setScan(progress);
      setCurrentPath(progress.rootPath);
      setLogPath(progress.logPath ?? logPath);
      await loadChildren(progress.rootPath);
      await loadGraph(progress.rootPath);
      await checkCacheStatus(progress.rootPath);
      const totalDuration = Math.round(performance.now() - scanStartTime);
      setStatus(`Scanned ${progress.scanned.toLocaleString()} entries in ${totalDuration}ms`);

      // Background: extract import/markdown link relationships so the graph
      // gains real edges. Reload the graph once analysis completes.
      void (async () => {
        try {
          const buckets = await tauriInvoke("list_analyzable_files", {
            rootPath: progress.rootPath,
          });
          const total = buckets.code.length + buckets.markdown.length;
          if (total === 0) return;
          setStatus(`Analyzing ${total} file${total === 1 ? "" : "s"} for relationships…`);
          if (buckets.code.length > 0) {
            await tauriInvoke("batch_analyze_code_files", { paths: buckets.code });
          }
          if (buckets.markdown.length > 0) {
            await tauriInvoke("batch_analyze_markdown_files", { paths: buckets.markdown });
          }
          await loadGraph(progress.rootPath);
          setStatus(`Analysis complete · ${total.toLocaleString()} file${total === 1 ? "" : "s"}`);
        } catch (analysisErr) {
          console.warn("Post-scan analysis failed:", analysisErr);
        }
        try {
          const hashed = await tauriInvoke("compute_workspace_phashes", {
            rootPath: progress.rootPath,
          });
          if (hashed > 0) {
            console.log(`[Orbit] Indexed ${hashed} new image hash${hashed === 1 ? "" : "es"}`);
          }
        } catch (hashErr) {
          console.warn("Image hash computation failed:", hashErr);
        }
      })();
    } catch (err) {
      setError(String(err));
      setStatus("Scan failed");
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [checkCacheStatus, loadChildren, loadGraph, logPath, rootPath]);

  const handleSearchQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    if (newQuery.trim()) {
      setLeftPanel("search");
      setLeftCollapsed(false);
    }
  }, []);

  const handleExpandCluster = useCallback(async (folderPath: string) => {
    const newExpanded = [...expandedGraphFolders, folderPath];
    setExpandedGraphFolders(newExpanded);
    await loadGraph(currentPath || rootPath, newExpanded);
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

  const showRightPanel = useCallback((panel: RightPanel) => {
    setRightPanel(panel);
    setRightCollapsed(false);
  }, []);

  const openSelected = useCallback(() => {
    if (!selected) return;
    void openPath(selected.path);
  }, [openPath, selected]);

  const openSelectedInEditor = useCallback(async () => {
    if (!selected || selected.isDir) return;
    try {
      await tauriInvoke("open_in_terminal_editor", { path: selected.path });
      setStatus("Opened selected file in $EDITOR");
    } catch (err) {
      setError(String(err));
      setStatus("External editor failed");
    }
  }, [selected]);

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
    setMonacoMinimap(preset.monacoMinimap);
    setDeepScan(preset.deepScan);
    persistSetting(SETTINGS_KEYS.thumbnailMemoryCap, preset.thumbnailMemoryCap);
    persistSetting(SETTINGS_KEYS.monacoMinimap, preset.monacoMinimap);
    persistSetting(SETTINGS_KEYS.deepScan, preset.deepScan);
    document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
    setStatus(`Performance mode: ${mode === "full" ? "Full Visuals" : mode[0].toUpperCase() + mode.slice(1)}`);
  }, [setDeepScan, setMonacoMinimap, setPerformanceMode, setThumbnailMemoryCap]);

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
      void loadChildren(currentPath);
    }
  }, [currentPath, loadChildren]);

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
    let lastRescan = 0;
    const RESCAN_COOLDOWN_MS = 2_500;
    const refresh = async () => {
      const now = Date.now();
      const target = currentPath || rootPath;
      // Always re-list the visible folder for cheap/instant feedback
      void loadChildren(target);
      // Don't burn CPU on every alt-tab — rescan at most every few seconds
      if (now - lastRescan < RESCAN_COOLDOWN_MS) return;
      lastRescan = now;
      try {
        await tauriInvoke("scan_workspace", { rootPath });
        await loadChildren(target);
        await loadGraph(target);
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
        } else if (isEditableFile(selected)) {
          void handleOpenInEditor(selected);
        } else {
          void openPath(selected.path);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [graphNavHistory, breadcrumbNodes, selected, handleOpenInEditor, openPath, loadGraph, showLeftPanel]);

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
        onRefreshGraph={() => void loadGraph(currentPath || rootPath)}
        onOpenSelected={openSelected}
        onCopySelected={copySelectedPath}
        onAddBookmark={addCurrentBookmark}
        onShowExplorer={() => showLeftPanel("explorer")}
        onShowSearch={() => showLeftPanel("search")}
        onShowAssets={() => showLeftPanel("assets")}
        onShowInspector={() => showRightPanel("inspector")}
        onShowCode={() => showRightPanel("code")}
        onOpenSettings={() => setSettingsOpen(true)}
        onNavigateToPath={(path) => {
          if (!path) return;
          // Path-bar / breadcrumb navigation: jump explorer + graph and ensure
          // the left panel is visible so the user actually sees the change.
          setCurrentPath(path);
          setLeftPanel("explorer");
          setLeftCollapsed(false);
          void loadGraph(path);
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
              onSelectPath={selectPathInsideOrbit}
              onOpenPath={openPath}
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
          <div className="right-tabs" aria-label="Right panel">
            <PanelButton active={rightPanel === "inspector"} label="Inspector" onClick={() => setRightPanel("inspector")} icon={<Info size={15} />} />
            <PanelButton active={rightPanel === "code"} label="Code" onClick={() => setRightPanel("code")} icon={<SquareCode size={15} />} />
          </div>

          {rightPanel === "inspector" ? (
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
              onEdit={handleOpenInEditor}
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
          ) : (
            <CodeMode selectedFile={selected} />
          )}
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
        editorMode={editorMode}
        onEditorModeChange={(value) => {
          setEditorMode(value);
          setMonacoMinimap(value === "full");
          persistSetting(SETTINGS_KEYS.editorMode, value);
          persistSetting(SETTINGS_KEYS.monacoMinimap, value === "full");
          document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
        }}
        monacoMinimap={monacoMinimap}
        onMonacoMinimapChange={(value) => {
          setMonacoMinimap(value);
          persistSetting(SETTINGS_KEYS.monacoMinimap, value);
          document.dispatchEvent(new CustomEvent("orbit:settings-changed"));
        }}
        deepScan={deepScan}
        onDeepScanChange={setDeepScan}
        visibleFolderRescan={visibleFolderRescan}
        onVisibleFolderRescanChange={setVisibleFolderRescan}
        onOpenThemesFolder={() => void openThemesFolder()}
        onClearSelectedThumbnailCache={() => void clearSelectedThumbnailCache()}
        canClearSelectedThumbnailCache={Boolean(selected && !selected.isDir)}
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
