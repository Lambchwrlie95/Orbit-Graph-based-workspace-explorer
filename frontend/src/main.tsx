import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { ExplorerList } from "./components/ExplorerList";
import { ExplorerTree } from "./components/ExplorerTree";
import { SearchPanel } from "./components/SearchPanel";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { useDebounce } from "./hooks/useDebounce";
import { usePerformanceMonitor } from "./hooks/usePerformanceMonitor";
import { ResponsivenessWarning } from "./utils/responsiveness.tsx";
import { FileRecord, ScanProgress, PreviewPayload, GraphPayload, Mode, CacheStatus, PerformanceMetrics } from "./types";
import { shortPath, formatDate } from "./utils";
import "./styles.css";

const modeLabels: Array<[Mode, string]> = [
  ["graph", "Graph"],
  ["explorer", "Explorer"],
  ["assets", "Assets"],
  ["code", "Code"],
  ["search", "Search"],
];

type ExplorerViewMode = "list" | "tree";

function App() {
  // Mode and navigation state
  const [mode, setMode] = useState<Mode>("graph");
  const [explorerViewMode, setExplorerViewMode] = useState<ExplorerViewMode>("list");
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");

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
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
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

  // Performance monitoring (only in graph mode)
  const { fps, isPoorPerformance, slowRenderCount, resetMetrics } = usePerformanceMonitor({
    monitorFps: mode === "graph",
    monitorLongTasks: true,
    slowRenderThreshold: 100,
    onLowFps: (lowFps) => {
      console.warn(`[Performance] Low FPS detected: ${lowFps}`);
    },
    onSlowRender: (duration, component) => {
      console.warn(`[Performance] Slow render in ${component}: ${duration}ms`);
    },
  });

  // Reset metrics when switching to graph mode
  useEffect(() => {
    if (mode === "graph") {
      resetMetrics();
    }
  }, [mode, resetMetrics]);

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
    // Load performance metrics
    loadPerformanceMetrics();
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

  // Load performance metrics
  const loadPerformanceMetrics = async () => {
    try {
      const metrics = await invoke<PerformanceMetrics>("get_performance_metrics");
      setPerformanceMetrics(metrics);
    } catch (err) {
      console.error("Failed to load performance metrics:", err);
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
      await loadPerformanceMetrics();
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

  return (
    <main className="app-shell">
      {/* Top Bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <div>
            <h1>Orbit</h1>
            <p>{rootPath ? shortPath(rootPath) : "No workspace"}</p>
          </div>
        </div>
        <div className="top-actions">
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
          <button onClick={() => setMode("search")}>Search</button>
          <button onClick={chooseFolder}>Open Folder</button>
          <button className="primary" onClick={scanWorkspace}>Scan</button>
        </div>
      </header>

      {/* Mode Bar */}
      <section className="modebar">
        {modeLabels.map(([key, label]) => (
          <button
            key={key}
            className={mode === key ? "active" : ""}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </section>

      {/* Main Workspace */}
      <section className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <h2>Workspace</h2>
          <button
            className="path-chip"
            onClick={() => rootPath && setCurrentPath(rootPath)}
          >
            {shortPath(rootPath) || "Choose folder"}
          </button>

          <h2>Current</h2>
          <button
            className="path-chip"
            onClick={() => currentPath && setMode("explorer")}
          >
            {shortPath(currentPath) || "—"}
          </button>

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
            performanceMetrics={performanceMetrics}
            onRefreshCache={() => rootPath && checkCacheStatus(rootPath)}
            fps={mode === "graph" ? fps : null}
          />
        </aside>

        {/* Main Surface */}
        <section className="main-surface">
          {mode === "graph" && (
            <GraphView
              payload={graphPayload}
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
                </div>
              </div>
              {explorerViewMode === "list" ? (
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

          {(mode === "assets" || mode === "code") && (
            <div className="surface-panel">
              <div className="surface-header">
                <h2>{mode === "assets" ? "Assets" : "Code Files"}</h2>
              </div>
              <div className="empty-state">
                <p>{mode === "assets" ? "Assets view coming soon" : "Code view coming soon"}</p>
              </div>
            </div>
          )}
        </section>

        {/* Inspector */}
        <Inspector
          record={selected}
          preview={preview}
          isLoadingPreview={isPreviewLoading}
          onOpen={openPath}
          onNavigate={setCurrentPath}
        />
      </section>

      {/* Performance Warning */}
      <ResponsivenessWarning
        fps={fps}
        slowRenderCount={slowRenderCount}
        onOptimize={() => {
          // Reset graph view to improve performance
          setExpandedGraphFolders([]);
          if (currentPath) {
            loadGraph(currentPath, []);
          }
        }}
      />
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
  performanceMetrics: PerformanceMetrics | null;
  onRefreshCache: () => void;
  fps: number | null;
}

function StatusBlock({ 
  status, 
  scan, 
  logPath, 
  error, 
  cacheStatus, 
  isCheckingCache,
  performanceMetrics,
  onRefreshCache,
  fps,
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

      {/* Performance Metrics */}
      {performanceMetrics && performanceMetrics.operationCount > 0 && (
        <div className="performance-metrics">
          <div className="metric">
            <span>Operations:</span>
            <span>{performanceMetrics.operationCount}</span>
          </div>
          {performanceMetrics.slowOperations.length > 0 && (
            <div className="performance-warning">
              ⚠ {performanceMetrics.slowOperations.length} slow ops
            </div>
          )}
        </div>
      )}

      {/* FPS Counter (Graph Mode) */}
      {fps !== null && (
        <div className="performance-metrics">
          <div className="metric">
            <span>FPS:</span>
            <span style={{ color: fps < 30 ? '#fbbf24' : '#86efac' }}>{fps}</span>
          </div>
        </div>
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
