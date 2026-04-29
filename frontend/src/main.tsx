import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import Graph from "graphology";
import Sigma from "sigma";
import "./styles.css";

type Mode = "graph" | "explorer" | "assets" | "code" | "search";

type FileRecord = {
  id: number;
  path: string;
  name: string;
  parentPath?: string | null;
  extension?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
  modifiedAt?: number | null;
  createdAt?: number | null;
  isDir: boolean;
};

type ScanProgress = {
  rootPath: string;
  scanned: number;
  insertedOrUpdated: number;
  skippedUnchanged: number;
  durationMs: number;
  logPath?: string | null;
};

type PreviewPayload = {
  kind: string;
  title: string;
  path: string;
  summary: string;
  content?: string | null;
  metadata: Array<{ key: string; value: string }>;
};

type GraphPayload = {
  rootPath: string;
  mode: string;
  nodes: Array<{
    id: number;
    label: string;
    path: string;
    isDir: boolean;
    sizeBytes: number;
    extension?: string | null;
    isCluster: boolean;
    childCount?: number | null;
    x?: number | null;
    y?: number | null;
  }>;
  edges: Array<{ id: number; sourceId: number; targetId: number; edgeType: string; weight: number }>;
  capped: boolean;
  nodeLimit: number;
  totalInScope: number;
};

const modeLabels: Array<[Mode, string]> = [
  ["graph", "Graph"],
  ["explorer", "Explorer"],
  ["assets", "Assets"],
  ["code", "Code"],
  ["search", "Search"],
];

function App() {
  const [mode, setMode] = useState<Mode>("graph");
  const [rootPath, setRootPath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [children, setChildren] = useState<FileRecord[]>([]);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[]>([]);
  const [graphPayload, setGraphPayload] = useState<GraphPayload | null>(null);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("default_root_path")
      .then((path) => {
        setRootPath(path);
        setCurrentPath(path);
      })
      .catch(() => undefined);
    invoke<string | null>("get_log_path").then(setLogPath).catch(() => undefined);
  }, []);

  const loadChildren = useCallback(async (path: string) => {
    if (!path) return;
    setStatus("Loading explorer");
    const next = await invoke<FileRecord[]>("list_children", { parentPath: path });
    setChildren(next);
    setStatus(`${next.length} items`);
  }, []);

  const loadGraph = useCallback(async (scopePath?: string) => {
    if (!rootPath) return;
    setStatus("Loading graph");
    const payload = await invoke<GraphPayload>("load_graph", {
      request: {
        rootPath,
        scopePath: scopePath ?? (currentPath || rootPath),
        mode: "workspace",
        limit: 1500,
      },
    });
    setGraphPayload(payload);
    setStatus(payload.capped ? `Graph capped at ${payload.nodeLimit} nodes` : `${payload.nodes.length} graph nodes`);
  }, [currentPath, rootPath]);

  const selectRecord = useCallback(async (record: FileRecord) => {
    setSelected(record);
    setError(null);
    try {
      const nextPreview = await invoke<PreviewPayload>("get_preview", { path: record.path });
      setPreview(nextPreview);
    } catch (err) {
      setPreview(null);
      setError(String(err));
    }
  }, []);

  const chooseFolder = useCallback(async () => {
    const selectedFolder = await invoke<string | null>("choose_folder");
    if (!selectedFolder) return;
    setRootPath(selectedFolder);
    setCurrentPath(selectedFolder);
    setChildren([]);
    setResults([]);
    setGraphPayload(null);
    setSelected(null);
    setPreview(null);
    setStatus("Workspace selected");
  }, []);

  const scanWorkspace = useCallback(async () => {
    if (!rootPath) return;
    setError(null);
    setStatus("Scanning workspace");
    try {
      const progress = await invoke<ScanProgress>("scan_workspace", { rootPath });
      setScan(progress);
      setCurrentPath(progress.rootPath);
      setLogPath(progress.logPath ?? logPath);
      await loadChildren(progress.rootPath);
      await loadGraph(progress.rootPath);
      setStatus(`Scanned ${progress.scanned} entries in ${progress.durationMs} ms`);
    } catch (err) {
      setError(String(err));
      setStatus("Scan failed");
    }
  }, [loadChildren, loadGraph, logPath, rootPath]);

  const runSearch = useCallback(async () => {
    if (!rootPath || !query.trim()) {
      setResults([]);
      return;
    }
    setStatus("Searching");
    const matches = await invoke<FileRecord[]>("search_files", { rootPath, query });
    setResults(matches);
    setStatus(`${matches.length} matches`);
  }, [query, rootPath]);

  useEffect(() => {
    if (currentPath) {
      loadChildren(currentPath).catch(() => undefined);
    }
  }, [currentPath, loadChildren]);

  useEffect(() => {
    if (mode === "graph" && rootPath) {
      loadGraph(currentPath || rootPath).catch((err) => setError(String(err)));
    }
  }, [currentPath, loadGraph, mode, rootPath]);

  const visibleList = mode === "search" ? results : children;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <div>
            <h1>Orbit</h1>
            <p>{rootPath || "No workspace selected"}</p>
          </div>
        </div>
        <div className="top-actions">
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setMode("search");
                runSearch().catch((err) => setError(String(err)));
              }
            }}
            placeholder="Search files..."
          />
          <button onClick={() => runSearch().then(() => setMode("search"))}>Search</button>
          <button onClick={chooseFolder}>Open Folder</button>
          <button className="primary" onClick={scanWorkspace}>Scan</button>
        </div>
      </header>

      <section className="modebar">
        {modeLabels.map(([key, label]) => (
          <button key={key} className={mode === key ? "active" : ""} onClick={() => setMode(key)}>
            {label}
          </button>
        ))}
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <h2>Projects</h2>
          <button className="path-chip" onClick={() => rootPath && setCurrentPath(rootPath)}>
            {shortPath(rootPath) || "Choose folder"}
          </button>
          <h2>Filters</h2>
          <div className="filter-list">
            <span>code</span>
            <span>images</span>
            <span>docs</span>
            <span>recent</span>
          </div>
          <h2>Status</h2>
          <StatusBlock status={status} scan={scan} logPath={logPath} error={error} />
        </aside>

        <section className="main-surface">
          {mode === "graph" ? (
            <GraphView payload={graphPayload} onSelectPath={async (path) => {
              const record = await invoke<FileRecord | null>("get_file", { path });
              if (record) {
                await selectRecord(record);
                if (record.isDir) {
                  setCurrentPath(record.path);
                }
              }
            }} />
          ) : (
            <ExplorerView
              mode={mode}
              currentPath={currentPath}
              items={visibleList}
              onOpenFolder={(path) => setCurrentPath(path)}
              onSelect={selectRecord}
            />
          )}
        </section>

        <Inspector record={selected} preview={preview} onOpen={async (path) => {
          await invoke("open_path", { path });
        }} />
      </section>
    </main>
  );
}

function StatusBlock({ status, scan, logPath, error }: { status: string; scan: ScanProgress | null; logPath: string | null; error: string | null }) {
  return (
    <div className="status-block">
      <strong>{status}</strong>
      {scan ? (
        <dl>
          <dt>Scanned</dt>
          <dd>{scan.scanned.toLocaleString()}</dd>
          <dt>Changed</dt>
          <dd>{scan.insertedOrUpdated.toLocaleString()}</dd>
          <dt>Skipped</dt>
          <dd>{scan.skippedUnchanged.toLocaleString()}</dd>
        </dl>
      ) : null}
      {logPath ? <p className="muted" title={logPath}>Log: {shortPath(logPath)}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function ExplorerView({
  mode,
  currentPath,
  items,
  onOpenFolder,
  onSelect,
}: {
  mode: Mode;
  currentPath: string;
  items: FileRecord[];
  onOpenFolder: (path: string) => void;
  onSelect: (record: FileRecord) => void;
}) {
  const title = mode === "search" ? "Search Results" : mode === "assets" ? "Assets" : mode === "code" ? "Code Files" : "Explorer";
  const filtered = useMemo(() => {
    if (mode === "assets") {
      return items.filter((item) => item.isDir || (item.mimeType ?? "").startsWith("image/"));
    }
    if (mode === "code") {
      return items.filter((item) => item.isDir || ["rs", "ts", "tsx", "js", "json", "toml", "md", "css", "html"].includes(item.extension ?? ""));
    }
    return items;
  }, [items, mode]);

  return (
    <div className="surface-panel">
      <div className="surface-header">
        <div>
          <h2>{title}</h2>
          <p>{currentPath}</p>
        </div>
        <span>{filtered.length} items</span>
      </div>
      <div className="file-list">
        {filtered.map((item) => (
          <button
            className="file-row"
            key={item.path}
            onClick={() => onSelect(item)}
            onDoubleClick={() => item.isDir && onOpenFolder(item.path)}
            title={item.path}
          >
            <span className={`file-icon ${item.isDir ? "folder" : "file"}`}>{item.isDir ? "D" : fileTypeLabel(item)}</span>
            <span className="file-name">{item.name || item.path}</span>
            <span className="file-meta">{item.isDir ? "folder" : formatBytes(item.sizeBytes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphView({ payload, onSelectPath }: { payload: GraphPayload | null; onSelectPath: (path: string) => Promise<void> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !payload) return undefined;
    const graph = new Graph();
    for (const node of payload.nodes) {
      graph.addNode(String(node.id), {
        label: node.label,
        x: node.x ?? Math.random() * 100,
        y: node.y ?? Math.random() * 100,
        size: node.isCluster ? 18 : node.isDir ? 12 : 7,
        color: node.isCluster ? "#f59e0b" : node.isDir ? "#4ade80" : colorForExtension(node.extension),
        path: node.path,
      });
    }
    for (const edge of payload.edges) {
      const source = String(edge.sourceId);
      const target = String(edge.targetId);
      if (graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(String(edge.id))) {
        graph.addEdgeWithKey(String(edge.id), source, target, { size: 1, color: "#335064" });
      }
    }
    const renderer = new Sigma(graph, containerRef.current, { renderLabels: true });
    renderer.on("clickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      onSelectPath(path).catch(() => undefined);
    });
    return () => renderer.kill();
  }, [onSelectPath, payload]);

  return (
    <div className="graph-wrap">
      <div className="graph-overlay">
        <strong>{payload ? `${payload.nodes.length} visible / ${payload.totalInScope} indexed` : "Graph"}</strong>
        {payload?.capped ? <span>Capped at {payload.nodeLimit}</span> : <span>Scoped view</span>}
      </div>
      <div className="graph-canvas" ref={containerRef}>
        {!payload ? <div className="empty-state">Scan a workspace to render the graph.</div> : null}
      </div>
    </div>
  );
}

function Inspector({ record, preview, onOpen }: { record: FileRecord | null; preview: PreviewPayload | null; onOpen: (path: string) => Promise<void> }) {
  return (
    <aside className="inspector">
      <h2>Inspector</h2>
      {!record ? (
        <div className="empty-state small">Select a file or graph node.</div>
      ) : (
        <>
          <div className="record-title">
            <span className={`file-icon ${record.isDir ? "folder" : "file"}`}>{record.isDir ? "D" : fileTypeLabel(record)}</span>
            <div>
              <h3>{record.name || record.path}</h3>
              <p title={record.path}>{record.path}</p>
            </div>
          </div>
          <dl className="meta-grid">
            <dt>Type</dt>
            <dd>{record.isDir ? "Folder" : record.mimeType ?? record.extension ?? "File"}</dd>
            <dt>Size</dt>
            <dd>{record.isDir ? "-" : formatBytes(record.sizeBytes)}</dd>
            <dt>Modified</dt>
            <dd>{record.modifiedAt ? new Date(record.modifiedAt * 1000).toLocaleString() : "-"}</dd>
          </dl>
          <div className="action-row">
            <button onClick={() => onOpen(record.path)}>Open</button>
            <button onClick={() => navigator.clipboard?.writeText(record.path)}>Copy Path</button>
          </div>
          {preview ? <Preview preview={preview} /> : null}
        </>
      )}
    </aside>
  );
}

function Preview({ preview }: { preview: PreviewPayload }) {
  return (
    <section className="preview">
      <h2>Preview</h2>
      <p>{preview.summary}</p>
      {preview.kind === "image" && preview.content ? <img src={preview.content} alt={preview.title} /> : null}
      {preview.kind === "text" ? <pre>{preview.content}</pre> : null}
      <dl className="meta-grid">
        {preview.metadata.map((item) => (
          <React.Fragment key={item.key}>
            <dt>{item.key}</dt>
            <dd>{item.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function fileTypeLabel(item: FileRecord) {
  return (item.extension ?? "F").slice(0, 2).toUpperCase();
}

function colorForExtension(extension?: string | null) {
  if (!extension) return "#94a3b8";
  if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(extension)) return "#38bdf8";
  if (["rs", "ts", "tsx", "js"].includes(extension)) return "#a78bfa";
  if (["md", "txt"].includes(extension)) return "#f8fafc";
  return "#94a3b8";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function shortPath(path: string) {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

createRoot(document.getElementById("root")!).render(<App />);
