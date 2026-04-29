import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { ExplorerList } from "./components/ExplorerList";
import { ExplorerTree } from "./components/ExplorerTree";
import { SearchPanel } from "./components/SearchPanel";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { useDebounce } from "./hooks/useDebounce";
import { FileRecord, ScanProgress, PreviewPayload, GraphPayload, Mode } from "./types";
import { shortPath } from "./utils";
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

  // UI state
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);

  // Debounced search query
  const debouncedQuery = useDebounce(query, 300);

  // Initialize
  useEffect(() => {
    invoke<string>("default_root_path")
      .then((path) => {
        setRootPath(path);
        setCurrentPath(path);
      })
      .catch(() => undefined);
    invoke<string | null>("get_log_path").then(setLogPath).catch(() => undefined);
  }, []);

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

  const loadGraph = async (scopePath: string) => {
    if (!rootPath) return;
    try {
      setStatus("Loading graph...");
      const payload = await invoke<GraphPayload>("load_graph", {
        request: {
          rootPath,
          scopePath,
          mode: "workspace",
          limit: 1500,
        },
      });
      setGraphPayload(payload);
      setStatus(payload.capped 
        ? `Graph capped at ${payload.nodeLimit} nodes` 
        : `${payload.nodes.length} graph nodes`
      );
    } catch (err) {
      setError(String(err));
      setStatus("Error loading graph");
    }
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
    try {
      const previewData = await invoke<PreviewPayload>("get_preview", { path: record.path });
      setPreview(previewData);
    } catch (err) {
      setPreview(null);
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
  };

  const scanWorkspace = async () => {
    if (!rootPath) return;
    setError(null);
    setStatus("Scanning...");
    try {
      const progress = await invoke<ScanProgress>("scan_workspace", { rootPath });
      setScan(progress);
      setCurrentPath(progress.rootPath);
      setLogPath(progress.logPath ?? logPath);
      await loadChildren(progress.rootPath);
      await loadGraph(progress.rootPath);
      setStatus(`Scanned ${progress.scanned} entries in ${progress.durationMs}ms`);
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
    const record = await invoke<FileRecord | null>("get_file", { path });
    if (record) {
      await selectRecord(record);
      if (record.isDir) {
        setCurrentPath(record.path);
      }
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
          <StatusBlock status={status} scan={scan} logPath={logPath} error={error} />
        </aside>

        {/* Main Surface */}
        <section className="main-surface">
          {mode === "graph" && (
            <GraphView
              payload={graphPayload}
              onSelectPath={handleGraphNodeSelect}
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
          onOpen={openPath}
          onNavigate={setCurrentPath}
        />
      </section>
    </main>
  );
}

interface StatusBlockProps {
  status: string;
  scan: ScanProgress | null;
  logPath: string | null;
  error: string | null;
}

function StatusBlock({ status, scan, logPath, error }: StatusBlockProps) {
  return (
    <div className="status-block">
      <strong>{status}</strong>
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
