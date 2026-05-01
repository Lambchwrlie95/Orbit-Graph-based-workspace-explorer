import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { ExplorerList } from "./components/ExplorerList";
import { ExplorerTree } from "./components/ExplorerTree";
import { ExplorerGrid } from "./components/ExplorerGrid";
import { ExplorerColumns } from "./components/ExplorerColumns";
import { SearchPanel } from "./components/SearchPanel";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AssetMode } from "./components/AssetMode";
import { CodeMode, isEditableFile } from "./components/CodeMode";
import { useEditorStore } from "./stores/editorStore";
import { useOpenFiles } from "./hooks/useOpenFiles";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { TitleBar } from "./components/TitleBar";
import { useDebounce } from "./hooks/useDebounce";
import { useViewPersistence } from "./hooks/useViewPersistence";
import { FolderOpen } from "lucide-react";
import { FileRecord, ScanProgress, PreviewPayload, GraphPayload, Mode, CacheStatus } from "./types";
import { shortPath, formatDate } from "./utils";
import "./styles.css";

type ExplorerViewMode = "list" | "tree" | "grid" | "columns";

function App() {
  // Mode and navigation state
  const [mode, setMode] = useState<Mode>("graph");
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");

  // View persistence state
  const {
    viewMode: explorerViewMode,
    setViewMode: setExplorerViewMode,
    iconSize: gridIconSize,
    setIconSize: setGridIconSize,
  } = useViewPersistence(currentPath, "list");

  // Data state
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
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // UI state
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [isCheckingCache, setIsCheckingCache] = useState(false);

  // Debounced search query
  const debouncedQuery = useDebounce(query, 300);

  // File opening hook for Code Editor
  const { openFileInEditor } = useOpenFiles({
    onSwitchToCodeMode: () => setMode("code"),
  });

  // Handle opening a file in the Code Editor
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



  // Initialize
  useEffect(() => {
    invoke<string>("default_root_path")
      .then((path) => {
        setRootPath(path);
        setCurrentPath(path);
        // Check cache status after setting root
        checkCacheStatus(path);
      })
      .catch(() => undefined);
    invoke<string | null>("get_log_path").then(setLogPath).catch(() => undefined);
  }, []);

  // Check cache status
  const checkCacheStatus = async (path: string) => {
    if (!path) return;
    setIsCheckingCache(true);
    try {
      const status = await invoke<CacheStatus>("check_cache_status", { rootPath: path });
      setCacheStatus(status);
      if (status.isStale) {
        setStatus(`Cache stale: ${status.staleReason}`);
      } else if (status.isFresh) {
        setStatus(`Cache fresh: ${status.fileCount.toLocaleString()} files`);
      } else if (status.fileCount === 0) {
        setStatus("No cached data - scan required");
      }
    } catch (err) {
      console.error("Cache check failed:", err);
    } finally {
      setIsCheckingCache(false);
    }
  };

  // Load children when current path changes
  useEffect(() => {
    if (currentPath) {
      loadChildren(currentPath);
    }
  }, [currentPath]);

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim() && rootPath) {
      runSearch(debouncedQuery);
    } else {
      setSearchResults([]);
    }
  }, [debouncedQuery, rootPath]);

  // Load graph when in graph mode
  useEffect(() => {
    if (mode === "graph" && rootPath) {
      loadGraph(currentPath || rootPath);
    }
  }, [mode, rootPath, currentPath]);

  const loadChildren = async (path: string) => {
    if (!path) return;
    try {
      setStatus("Loading...");
      const result = await invoke<FileRecord[]>("list_children", { parentPath: path });
      setChildren(result);
      setStatus(`${result.length} items`);
    } catch (err) {
      setError(String(err));
      setStatus("Error loading directory");
    }
  };

  const loadGraph = async (scopePath: string, expanded: string[] = expandedGraphFolders) => {
    if (!rootPath) return;
    setIsGraphLoading(true);
    const startTime = performance.now();
    try {
      setStatus("Loading graph...");
      const payload = await invoke<GraphPayload>("load_graph", {
        request: {
          rootPath,
          scopePath,
          mode: "workspace",
          limit: 200,
          expandedFolders: expanded,
        },
      });
      setGraphPayload(payload);
      const duration = Math.round(performance.now() - startTime);
      setStatus(payload.capped 
        ? `Graph capped at ${payload.nodeLimit} nodes (${duration}ms)` 
        : `${payload.nodes.length} graph nodes (${duration}ms)`
      );
    } catch (err) {
      setError(String(err));
      setStatus("Error loading graph");
    } finally {
      setIsGraphLoading(false);
    }
  };

  // Handle cluster expansion
  const handleExpandCluster = async (folderPath: string) => {
    const newExpanded = [...expandedGraphFolders, folderPath];
    setExpandedGraphFolders(newExpanded);
    // Reload graph with expanded folders
    await loadGraph(currentPath || rootPath, newExpanded);
  };

  const runSearch = async (searchQuery: string) => {
    if (!rootPath || !searchQuery.trim()) return;
    try {
      setIsSearching(true);
      setStatus("Searching...");
      const matches = await invoke<FileRecord[]>("search_files", { 
        rootPath, 
        query: searchQuery 
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

  const selectRecord = async (record: FileRecord) => {
    setSelected(record);
    setError(null);
    setPreview(null);
    
    // Only load preview for files (not folders)
    if (record.isDir) {
      return;
    }
    
    setIsPreviewLoading(true);
    try {
      const previewData = await invoke<PreviewPayload>("get_preview", { path: record.path });
      setPreview(previewData);
    } catch (err) {
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const openPath = async (path: string) => {
    try {
      await invoke("open_path", { path });
    } catch (err) {
      setError(`Failed to open: ${err}`);
    }
  };

  const chooseFolder = async () => {
    const selectedFolder = await invoke<string | null>("choose_folder");
    if (!selectedFolder) return;
    setRootPath(selectedFolder);
    setCurrentPath(selectedFolder);
    setChildren([]);
    setSearchResults([]);
    setGraphPayload(null);
    setSelected(null);
    setPreview(null);
    setScan(null);
    setStatus("Workspace selected");
    // Check cache for new folder
    await checkCacheStatus(selectedFolder);
  };

  const scanWorkspace = async () => {
    if (!rootPath) return;
    setError(null);
    setStatus("Scanning...");
    const scanStartTime = performance.now();
    try {
      const progress = await invoke<ScanProgress>("scan_workspace", { rootPath });
      setScan(progress);
      setCurrentPath(progress.rootPath);
      setLogPath(progress.logPath ?? logPath);
      await loadChildren(progress.rootPath);
      await loadGraph(progress.rootPath);
      // Refresh cache status after scan
      await checkCacheStatus(progress.rootPath);
      const totalDuration = Math.round(performance.now() - scanStartTime);
      setStatus(`Scanned ${progress.scanned.toLocaleString()} entries in ${totalDuration}ms`);
    } catch (err) {
      setError(String(err));
      setStatus("Scan failed");
    }
  };

  const handleSearchQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    if (newQuery.trim()) {
      setMode("search");
    }
  };

  const isTauriRuntime =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const handleGraphNodeSelect = async (path: string) => {
    // Handle cluster nodes - they have synthetic paths
    if (path.includes("/__cluster__")) {
      const folderPath = path.replace("/__cluster__", "");
      const record = await invoke<FileRecord | null>("get_file", { path: folderPath });
      if (record) {
        await selectRecord(record);
      }
      return;
    }
    
    const record = await invoke<FileRecord | null>("get_file", { path });
    if (record) {
      await selectRecord(record);
    }
  };

  // Extract workspace name from rootPath
  const workspaceName = rootPath ? rootPath.split("/").pop() || rootPath : undefined;

  return (
    <main className="app-shell">
      {/* Title Bar */}
      <TitleBar workspaceName={workspaceName} />

      {/* Top Bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <div>
            <h1>Orbit</h1>
            <p>{rootPath ? shortPath(rootPath) : "No workspace"}</p>
          </div>
        </div>
        {isTauriRuntime ? <div className="topbar-drag-fill" data-tauri-drag-region /> : null}
        <div className="top-actions">
          <button type="button" onClick={chooseFolder}>
            Open Folder
          </button>
          <input
            className="search-input"
            value={query}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                setMode("search");
                runSearch(query);
              }
            }}
            placeholder="Search files..."
          />
          <button type="button" className="primary" onClick={scanWorkspace}>
            Scan
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <section className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <h2>Workspace</h2>
          <div className="sidebar-mode-row">
            <ModeSwitcher
              currentMode={mode}
              onModeChange={setMode}
              modes={["graph", "explorer", "assets", "search"]}
              variant="toolbar"
              className="sidebar-mode-toolbar"
              toolbarLeading={
                <button
                  type="button"
                  className="sidebar-workspace-folder"
                  onClick={() => {
                    if (rootPath) setCurrentPath(rootPath);
                    else void chooseFolder();
                  }}
                  title={
                    rootPath
                      ? `${shortPath(rootPath)} — workspace root (click)`
                      : "Choose folder"
                  }
                  aria-label={
                    rootPath ? "Go to workspace root" : "Choose folder"
                  }
                >
                  <FolderOpen className="sidebar-workspace-folder-icon" size={14} strokeWidth={1.75} aria-hidden />
                </button>
              }
            />
          </div>

          <h2>View</h2>
          {mode === "explorer" && (
            <div className="view-toggle">
              <button
                className={explorerViewMode === "list" ? "active" : ""}
                onClick={() => setExplorerViewMode("list")}
              >
                List
              </button>
              <button
                className={explorerViewMode === "tree" ? "active" : ""}
                onClick={() => setExplorerViewMode("tree")}
              >
                Tree
              </button>
              <button
                className={explorerViewMode === "grid" ? "active" : ""}
                onClick={() => setExplorerViewMode("grid")}
              >
                Grid
              </button>
              <button
                className={explorerViewMode === "columns" ? "active" : ""}
                onClick={() => setExplorerViewMode("columns")}
              >
                Columns
              </button>
            </div>
          )}

          <h2>Status</h2>
          <StatusBlock
            status={status}
            scan={scan}
            logPath={logPath}
            error={error}
            cacheStatus={cacheStatus}
            isCheckingCache={isCheckingCache}
            onRefreshCache={() => rootPath && checkCacheStatus(rootPath)}
          />
        </aside>

        {/* Main Surface */}
        <section className="main-surface">
          {mode === "graph" && (
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
                onSelectPath={handleGraphNodeSelect}
                onOpenPath={openPath}
                onFocusFolder={(path) => {
                  setCurrentPath(path);
                  loadGraph(path);
                }}
                onExpandCluster={handleExpandCluster}
                expandedFolders={expandedGraphFolders}
                isLoading={isGraphLoading}
              />
            </ErrorBoundary>
          )}

          {mode === "explorer" && (
            <div className="surface-panel">
              <div className="surface-header">
                <div>
                  <h2>Explorer</h2>
                  <p>{currentPath}</p>
                </div>
                <div className="view-toggle inline">
                  <button
                    className={explorerViewMode === "list" ? "active" : ""}
                    onClick={() => setExplorerViewMode("list")}
                  >
                    List
                  </button>
                  <button
                    className={explorerViewMode === "tree" ? "active" : ""}
                    onClick={() => setExplorerViewMode("tree")}
                  >
                    Tree
                  </button>
                  <button
                    className={explorerViewMode === "grid" ? "active" : ""}
                    onClick={() => setExplorerViewMode("grid")}
                  >
                    Grid
                  </button>
                  <button
                    className={explorerViewMode === "columns" ? "active" : ""}
                    onClick={() => setExplorerViewMode("columns")}
                  >
                    Columns
                  </button>
                </div>
              </div>
              {explorerViewMode === "columns" ? (
                <ExplorerColumns
                  rootPath={rootPath}
                  currentPath={currentPath}
                  selectedPath={selected?.path}
                  onSelect={selectRecord}
                  onNavigate={setCurrentPath}
                />
              ) : explorerViewMode === "grid" ? (
                <ExplorerGrid
                  currentPath={currentPath}
                  rootPath={rootPath}
                  items={children}
                  selectedPath={selected?.path}
                  onSelect={selectRecord}
                  onNavigate={setCurrentPath}
                  iconSize={gridIconSize}
                  onIconSizeChange={setGridIconSize}
                />
              ) : explorerViewMode === "list" ? (
                <ExplorerList
                  currentPath={currentPath}
                  rootPath={rootPath}
                  items={children}
                  selectedPath={selected?.path}
                  onSelect={selectRecord}
                  onNavigate={setCurrentPath}
                />
              ) : (
                <ExplorerTree
                  rootPath={rootPath}
                  selectedPath={selected?.path}
                  onSelect={selectRecord}
                  onNavigate={setCurrentPath}
                />
              )}
            </div>
          )}

          {mode === "search" && (
            <SearchPanel
              rootPath={rootPath}
              query={query}
              results={searchResults}
              selectedPath={selected?.path}
              isLoading={isSearching}
              onQueryChange={handleSearchQueryChange}
              onSelect={selectRecord}
              onOpen={(record) => openPath(record.path)}
            />
          )}

          {mode === "assets" && (
            <AssetMode
              files={children}
              currentPath={currentPath}
              onSelect={selectRecord}
            />
          )}

          {mode === "code" && (
            <CodeMode />
          )}
        </section>

        {/* Inspector */}
        <Inspector
          record={selected}
          preview={preview}
          isLoadingPreview={isPreviewLoading}
          onOpen={openPath}
          onNavigate={setCurrentPath}
          onEdit={handleOpenInEditor}
          currentMode={mode}
          onModeChange={setMode}
        />
      </section>

      <footer className="statusbar">
        <span>{mode}</span>
        <span title={status}>{status}</span>
        <span>{selected ? selected.name : "No selection"}</span>
        <span>{cacheStatus?.fileCount ? `${cacheStatus.fileCount.toLocaleString()} indexed` : "No cache"}</span>
        {logPath && <span title={logPath}>Log {shortPath(logPath)}</span>}
      </footer>

    </main>
  );
}

interface StatusBlockProps {
  status: string;
  scan: ScanProgress | null;
  logPath: string | null;
  error: string | null;
  cacheStatus: CacheStatus | null;
  isCheckingCache: boolean;
  onRefreshCache: () => void;
}

function StatusBlock({
  status,
  scan,
  logPath,
  error,
  cacheStatus,
  isCheckingCache,
  onRefreshCache,
}: StatusBlockProps) {
  const getCacheStatusClass = () => {
    if (!cacheStatus || cacheStatus.fileCount === 0) return "empty";
    if (cacheStatus.isStale) return "stale";
    if (cacheStatus.isFresh) return "fresh";
    return "empty";
  };

  const getCacheLabel = () => {
    if (isCheckingCache) return "Checking...";
    if (!cacheStatus || cacheStatus.fileCount === 0) return "No cache";
    if (cacheStatus.isStale) return "Stale";
    if (cacheStatus.isFresh) return "Fresh";
    return "Unknown";
  };

  return (
    <div className="status-block">
      <strong className={status.toLowerCase().includes("scanning") ? "scanning-indicator" : ""}>
        {status}
      </strong>
      
      {/* Cache Status */}
      {cacheStatus && (
        <div className="cache-section" style={{ marginTop: 12 }}>
          <div className={`cache-status ${getCacheStatusClass()}`}>
            <span>Cache: {getCacheLabel()}</span>
          </div>
          {cacheStatus.fileCount > 0 && (
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              {cacheStatus.fileCount.toLocaleString()} files
              {cacheStatus.lastScanTime && (
                <span> • {formatDate(cacheStatus.lastScanTime)}</span>
              )}
            </p>
          )}
          {cacheStatus.isStale && cacheStatus.staleReason && (
            <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {cacheStatus.staleReason}
            </p>
          )}
          <button 
            onClick={onRefreshCache}
            disabled={isCheckingCache}
            style={{ fontSize: 11, marginTop: 6, padding: "2px 8px", height: 24 }}
          >
            {isCheckingCache ? "Checking..." : "Refresh Check"}
          </button>
        </div>
      )}

      {scan && (
        <dl>
          <dt>Scanned</dt>
          <dd>{scan.scanned.toLocaleString()}</dd>
          <dt>Changed</dt>
          <dd>{scan.insertedOrUpdated.toLocaleString()}</dd>
          <dt>Skipped</dt>
          <dd>{scan.skippedUnchanged.toLocaleString()}</dd>
        </dl>
      )}

      {logPath && (
        <p className="muted" title={logPath}>
          Log: {shortPath(logPath)}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
