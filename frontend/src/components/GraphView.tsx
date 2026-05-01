import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { GraphEdge, GraphNode, GraphPayload } from "../types";
import { formatBytes } from "../utils";

type LayoutMode = "orbit" | "tree" | "force";
type GraphDisplayNode = GraphNode & { x: number; y: number; depth: number; childCount: number };

interface GraphViewProps {
  payload: GraphPayload | null;
  selectedPath?: string | null;
  onSelectPath: (path: string) => void;
  onOpenPath?: (path: string) => void;
  onFocusFolder?: (path: string) => void;
  onExpandCluster?: (folderPath: string) => void;
  expandedFolders?: string[];
  isLoading?: boolean;
}

function GraphViewComponent({
  payload,
  selectedPath,
  onSelectPath,
  onOpenPath,
  onFocusFolder,
  onExpandCluster,
  expandedFolders = [],
  isLoading,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("orbit");
  const [showLabels, setShowLabels] = useState(true);
  const [showFiles, setShowFiles] = useState(true);
  const [showFolders, setShowFolders] = useState(true);
  const [dimUnrelated, setDimUnrelated] = useState(true);
  const [graphFilter, setGraphFilter] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandingCluster, setExpandingCluster] = useState<string | null>(null);
  const isFirstRenderRef = useRef(true);
  const cameraZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Match Sigma wheel / double-click step (see DEFAULT_ZOOMING_RATIO in sigma) */
  const ZOOM_FACTOR = 1.5;

  const flushZoomDebounce = () => {
    if (cameraZoomTimeoutRef.current) {
      clearTimeout(cameraZoomTimeoutRef.current);
      cameraZoomTimeoutRef.current = null;
    }
  };

  const syncZoomFromCamera = (renderer: Sigma) => {
    const ratio = renderer.getCamera().getState().ratio;
    setZoomLevel(Math.round((1 / ratio) * 100) / 100);
  };

  const displayPayload = useMemo(() => {
    if (!payload) return null;
    const query = graphFilter.trim().toLowerCase();
    const nodes = payload.nodes.filter((node) => {
      if (!showFolders && node.isDir) return false;
      if (!showFiles && !node.isDir) return false;
      if (!query) return true;
      return node.label.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
    });
    const ids = new Set(nodes.map((node) => node.id));
    const edges = dedupeGraphEdges(payload.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)));
    return { ...payload, nodes, edges };
  }, [payload, graphFilter, showFiles, showFolders]);

  const displayNodes = useMemo(() => {
    if (!displayPayload) return [];
    return layoutNodes(displayPayload.nodes, displayPayload.edges, layoutMode);
  }, [displayPayload, layoutMode]);

  const nodeByPath = useMemo(() => new Map(displayNodes.map((node) => [node.path, node])), [displayNodes]);
  const nodeById = useMemo(() => new Map(displayNodes.map((node) => [String(node.id), node])), [displayNodes]);
  const graphStats = useMemo(() => computeStats(displayNodes, displayPayload?.edges ?? []), [displayNodes, displayPayload]);
  const minimapNodes = useMemo(() => minimapPoints(displayNodes), [displayNodes]);

  useEffect(() => {
    const selected = selectedPath ? nodeByPath.get(selectedPath) : null;
    const key = selected ? String(selected.id) : null;
    if (selectedNodeRef.current !== key) {
      selectedNodeRef.current = key;
      setSelectedNode(prev => prev === key ? prev : key);
      rendererRef.current?.scheduleRefresh();
    }
  }, [selectedPath, nodeByPath]);

  useEffect(() => {
    if (!containerRef.current) return;

    rendererRef.current?.kill();
    rendererRef.current = null;
    graphRef.current = null;
    hoveredNodeRef.current = null;

    if (!displayPayload || displayNodes.length === 0) return;

    const graph = new Graph();
    graphRef.current = graph;

    for (const node of displayNodes) {
      const baseSize = getNodeSize(node);
      graph.addNode(String(node.id), {
        label: node.label,
        x: node.x,
        y: node.y,
        size: baseSize,
        baseSize,
        color: getNodeColor(node),
        baseColor: getNodeColor(node),
        path: node.path,
        isDir: node.isDir,
        isCluster: node.isCluster,
        extension: node.extension,
        clusterSummary: node.clusterSummary,
        childCount: node.childCount,
      });
    }

    const addedPairs = new Set<string>();
    for (const edge of displayPayload.edges) {
      const source = String(edge.sourceId);
      const target = String(edge.targetId);
      const pairKey = graphEdgePairKey(source, target);
      if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
      if (addedPairs.has(pairKey) || graph.hasEdge(source, target)) continue;
      if (graph.hasEdge(String(edge.id))) continue;
      graph.addEdgeWithKey(String(edge.id), source, target, {
        size: edge.edgeType === "contains" ? 1.2 : 1.8,
        color: edgeColor(edge),
        baseColor: edgeColor(edge),
        edgeType: edge.edgeType,
      });
      addedPairs.add(pairKey);
    }

    const renderer = new Sigma(graph, containerRef.current, {
      renderLabels: showLabels,
      renderEdgeLabels: false,
      labelColor: { color: "#d4d4d4" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelDensity: 0.22,
      labelGridCellSize: 72,
      labelRenderedSizeThreshold: 7,
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "#335064",
      zIndex: true,
      minCameraRatio: 0.03,
      maxCameraRatio: 8,
      nodeReducer: (node, data) => reduceNode(node, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated),
      edgeReducer: (edge, data) => reduceEdge(edge, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated),
    });

    renderer.on("clickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      selectedNodeRef.current = node;
      // Only update React state if selection actually changed
      setSelectedNode(prev => prev === node ? prev : node);
      renderer.scheduleRefresh();
      if (path) onSelectPath(path);
    });

    renderer.on("doubleClickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      const isCluster = graph.getNodeAttribute(node, "isCluster") as boolean;
      if (!path) return;

      if (isCluster) {
        const folderPath = path.replace("/__cluster__", "");
        setExpandingCluster(folderPath);
        onExpandCluster?.(folderPath);
        setTimeout(() => setExpandingCluster(null), 550);
        return;
      }

      if (isDir) onFocusFolder?.(path);
      else onOpenPath?.(path);
    });

    // Track if mouse is over the container to avoid stale hover states
    let isMouseOver = false;
    containerRef.current?.addEventListener("mouseenter", () => { isMouseOver = true; });
    containerRef.current?.addEventListener("mouseleave", () => { isMouseOver = false; });

    renderer.on("enterNode", ({ node }) => {
      hoveredNodeRef.current = node;
      // Only update React state if tooltip needs to change
      setHoveredNode(prev => prev === node ? prev : node);
      renderer.scheduleRefresh();
    });

    renderer.on("leaveNode", () => {
      hoveredNodeRef.current = null;
      // Only update React state if tooltip needs to change
      setHoveredNode(prev => prev === null ? prev : null);
      renderer.scheduleRefresh();
    });

    // Debounce zoom updates to avoid excessive re-renders (ref shared with Fit)
    renderer.getCamera().on("updated", () => {
      if (cameraZoomTimeoutRef.current) clearTimeout(cameraZoomTimeoutRef.current);
      cameraZoomTimeoutRef.current = setTimeout(() => {
        cameraZoomTimeoutRef.current = null;
        const ratio = renderer.getCamera().getState().ratio;
        setZoomLevel(Math.round((1 / ratio) * 100) / 100);
      }, 100);
    });

    rendererRef.current = renderer;

    // Only animate camera on first render, not on updates
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      requestAnimationFrame(() => renderer.getCamera().animatedReset({ duration: 360 }));
    }

    return () => {
      if (cameraZoomTimeoutRef.current) {
        clearTimeout(cameraZoomTimeoutRef.current);
        cameraZoomTimeoutRef.current = null;
      }
      renderer.kill();
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [displayPayload, displayNodes, showLabels, dimUnrelated, onSelectPath, onOpenPath, onFocusFolder, onExpandCluster]);

  const focusSelected = () => {
    const renderer = rendererRef.current;
    const graph = graphRef.current;
    const selected = selectedNodeRef.current;
    if (!renderer || !graph || !selected || !graph.hasNode(selected)) return;
    const x = graph.getNodeAttribute(selected, "x") as number;
    const y = graph.getNodeAttribute(selected, "y") as number;
    renderer.getCamera().animate({ x, y, ratio: 0.58 }, { duration: 320 });
  };

  const fitGraph = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();

    flushZoomDebounce();

    void camera.animatedReset({ duration: 320, easing: "quadraticInOut" }).then(() => {
      camera.setState({
        x: 0.5,
        y: 0.5,
        ratio: camera.getBoundedRatio(1),
        angle: 0,
      });
      renderer.scheduleRefresh();
      syncZoomFromCamera(renderer);
    });
  };

  /** Zoom toward canvas center so view stays stable (same idea as Sigma wheel zoom). */
  const zoomGraphIn = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    const cur = camera.getState().ratio;
    const next = camera.getBoundedRatio(cur / ZOOM_FACTOR);
    if (!(next < cur - 1e-9)) return;
    flushZoomDebounce();
    const { width, height } = renderer.getDimensions();
    const target = renderer.getViewportZoomedState({ x: width / 2, y: height / 2 }, next);
    void camera.animate(target, { duration: 200, easing: "quadraticOut" }).then(() => {
      renderer.scheduleRefresh();
      syncZoomFromCamera(renderer);
    });
  };

  const zoomGraphOut = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    const cur = camera.getState().ratio;
    const next = camera.getBoundedRatio(cur * ZOOM_FACTOR);
    if (!(next > cur + 1e-9)) return;
    flushZoomDebounce();
    const { width, height } = renderer.getDimensions();
    const target = renderer.getViewportZoomedState({ x: width / 2, y: height / 2 }, next);
    void camera.animate(target, { duration: 200, easing: "quadraticOut" }).then(() => {
      renderer.scheduleRefresh();
      syncZoomFromCamera(renderer);
    });
  };

  const hoveredInfo = hoveredNode ? nodeById.get(hoveredNode) : null;

  return (
    <div className="graph-wrap graph-workbench">
      <div className="graph-commandbar">
        <div className="graph-mode-tabs" aria-label="Graph layout">
          {(["orbit", "tree", "force"] as LayoutMode[]).map((mode) => (
            <button
              key={mode}
              className={layoutMode === mode ? "active" : ""}
              onClick={() => setLayoutMode(mode)}
              title={`${mode} layout`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="graph-search">
          <input
            value={graphFilter}
            onChange={(event) => setGraphFilter(event.target.value)}
            placeholder="Filter graph..."
            aria-label="Filter graph"
          />
        </div>

        <div className="graph-switches">
          <button className={showFolders ? "active" : ""} onClick={() => setShowFolders((value) => !value)}>
            Folders
          </button>
          <button className={showFiles ? "active" : ""} onClick={() => setShowFiles((value) => !value)}>
            Files
          </button>
          <button className={showLabels ? "active" : ""} onClick={() => setShowLabels((value) => !value)}>
            Labels
          </button>
          <button className={dimUnrelated ? "active" : ""} onClick={() => setDimUnrelated((value) => !value)}>
            Focus
          </button>
        </div>
      </div>

      <div className="graph-overlay graph-stats">
        <strong>
          {displayPayload ? `${displayNodes.length} visible / ${displayPayload.totalInScope} indexed` : "Graph"}
        </strong>
        <span>{graphStats.dirCount} folders</span>
        <span>{graphStats.fileCount} files</span>
        <span>{graphStats.edgeCount} edges</span>
        {graphStats.totalSize > 0 && <span>{formatBytes(graphStats.totalSize)}</span>}
        {displayPayload?.capped && <span className="capped-badge">Capped at {displayPayload.nodeLimit}</span>}
        {expandedFolders.length > 0 && <span className="expanded-badge">{expandedFolders.length} expanded</span>}
        {isLoading && <span className="loading-indicator">Loading...</span>}
      </div>

      <div className="graph-legend">
        <span><i className="legend-dot folder" />Folder</span>
        <span><i className="legend-dot code" />Code</span>
        <span><i className="legend-dot image" />Image</span>
        <span><i className="legend-dot config" />Config</span>
        <span><i className="legend-dot cluster" />Cluster</span>
      </div>

      {displayNodes.length > 0 && (
        <div className="graph-minimap" title="Graph minimap">
          <svg viewBox="0 0 120 86" role="img" aria-label="Graph minimap">
            {minimapNodes.map((point) => (
              <circle key={point.id} cx={point.x} cy={point.y} r={point.r} fill={point.color} opacity={point.opacity} />
            ))}
          </svg>
        </div>
      )}

      <div className="graph-controls">
        <button type="button" className="graph-zoom-btn" onClick={zoomGraphIn} title="Zoom in">
          +
        </button>
        <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
        <button type="button" className="graph-zoom-btn" onClick={zoomGraphOut} title="Zoom out">
          -
        </button>
        <button type="button" className="graph-text-btn" onClick={fitGraph} title="Fit graph">
          Fit
        </button>
        <button type="button" className="graph-text-btn" onClick={focusSelected} disabled={!selectedNode} title="Focus selected">
          Sel
        </button>
      </div>

      {hoveredInfo && (
        <div className="graph-tooltip graph-node-card">
          <strong>{hoveredInfo.label}</strong>
          <span>{hoveredInfo.isCluster ? "Cluster" : hoveredInfo.isDir ? "Folder" : hoveredInfo.extension || "File"}</span>
          <span>{shortNodePath(hoveredInfo.path)}</span>
          {hoveredInfo.isCluster && hoveredInfo.clusterSummary ? (
            <>
              <span>{hoveredInfo.clusterSummary.totalChildren} hidden items</span>
              <span>{formatBytes(hoveredInfo.clusterSummary.totalSize)}</span>
              <span>{expandingCluster === hoveredInfo.path.replace("/__cluster__", "") ? "Expanding..." : "Double-click to expand"}</span>
            </>
          ) : (
            <span>{hoveredInfo.isDir ? `${hoveredInfo.childCount} visible children` : formatBytes(hoveredInfo.sizeBytes)}</span>
          )}
        </div>
      )}

      <div className="graph-canvas" ref={containerRef}>
        {(!displayPayload || displayNodes.length === 0) && (
          <div className="empty-state">
            <p>{payload ? "No nodes match the current graph filters" : "Scan a workspace to render the graph"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[], mode: LayoutMode): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  if (mode === "tree") return treeLayout(nodes, edges);
  if (mode === "force") return forceLayout(nodes, edges);
  return orbitLayout(nodes, edges);
}

function dedupeGraphEdges(edges: GraphEdge[]): GraphEdge[] {
  const byPair = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const key = graphEdgePairKey(String(edge.sourceId), String(edge.targetId));
    const existing = byPair.get(key);
    if (!existing || edgePriority(edge) > edgePriority(existing)) {
      byPair.set(key, edge);
    }
  }
  return [...byPair.values()];
}

function graphEdgePairKey(source: string, target: string) {
  return source < target ? `${source}:${target}` : `${target}:${source}`;
}

function edgePriority(edge: GraphEdge) {
  if (edge.edgeType === "contains") return 3;
  if (edge.edgeType === "import") return 2;
  return 1;
}

function orbitLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const placed = new Map<number, GraphDisplayNode>();
  const totalWeight = roots.reduce((sum, id) => sum + subtreeWeight(id, tree.children), 0) || roots.length;
  let cursor = -Math.PI;

  for (const rootId of roots) {
    const weight = subtreeWeight(rootId, tree.children);
    const span = Math.PI * 2 * (weight / totalWeight);
    placeOrbit(rootId, cursor, cursor + span, 0, tree, placed);
    cursor += span;
  }

  return nodes.map((node, index) => placed.get(node.id) ?? fallbackNode(node, index, 0, 0));
}

function placeOrbit(
  id: number,
  start: number,
  end: number,
  depth: number,
  tree: ReturnType<typeof hierarchy>,
  placed: Map<number, GraphDisplayNode>,
) {
  const node = tree.byId.get(id);
  if (!node || placed.has(id)) return;
  const kids = tree.children.get(id) ?? [];
  const angle = (start + end) / 2;
  const radius = depth === 0 ? 0 : 78 + depth * 82 + Math.min(40, kids.length * 1.5);
  placed.set(id, { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, depth, childCount: kids.length });

  if (!kids.length) return;
  const total = kids.reduce((sum, child) => sum + subtreeWeight(child, tree.children), 0) || kids.length;
  let cursor = start;
  for (const child of kids) {
    const span = (end - start) * (subtreeWeight(child, tree.children) / total);
    placeOrbit(child, cursor, cursor + span, depth + 1, tree, placed);
    cursor += span;
  }
}

function treeLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  const tree = hierarchy(nodes, edges);
  const placed = new Map<number, GraphDisplayNode>();
  let leafIndex = 0;

  const place = (id: number, depth: number): number => {
    const node = tree.byId.get(id);
    if (!node || placed.has(id)) return leafIndex;
    const kids = tree.children.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leafIndex * 54;
      leafIndex += 1;
    } else {
      const childXs = kids.map((child) => place(child, depth + 1));
      x = childXs.reduce((sum, childX) => sum + childX, 0) / childXs.length;
    }
    placed.set(id, { ...node, x, y: depth * 86, depth, childCount: kids.length });
    return x;
  };

  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  for (const root of roots) place(root, 0);

  const xs = [...placed.values()].map((node) => node.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  return nodes.map((node, index) => {
    const placedNode = placed.get(node.id);
    if (!placedNode) return fallbackNode(node, index, 0, 0);
    return { ...placedNode, x: placedNode.x - mid, y: placedNode.y - 90 };
  });
}

function forceLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  const positions = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  for (const [index, node] of nodes.entries()) {
    const angle = seededAngle(node.id);
    const radius = 80 + (index % 14) * 16;
    positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 });
  }

  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = 2100 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const edge of edges) {
      const a = positions.get(edge.sourceId);
      const b = positions.get(edge.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (dist - 88) * 0.012;
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    for (const node of nodes) {
      const p = positions.get(node.id)!;
      p.vx *= 0.82;
      p.vy *= 0.82;
      p.x = clamp(p.x + p.vx, -620, 620);
      p.y = clamp(p.y + p.vy, -460, 460);
    }
  }

  const childCounts = childCountsById(edges);
  return nodes.map((node, index) => {
    const p = positions.get(node.id);
    return p ? { ...node, x: p.x, y: p.y, depth: 0, childCount: childCounts.get(node.id) ?? 0 } : fallbackNode(node, index, 0, 0);
  });
}

function hierarchy(nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number, number[]>();
  const parent = new Map<number, number>();
  for (const node of nodes) children.set(node.id, []);
  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    children.get(edge.sourceId)?.push(edge.targetId);
    parent.set(edge.targetId, edge.sourceId);
  }
  for (const ids of children.values()) {
    ids.sort((a, b) => {
      const nodeA = byId.get(a)!;
      const nodeB = byId.get(b)!;
      if (nodeA.isDir !== nodeB.isDir) return nodeA.isDir ? -1 : 1;
      return nodeA.label.localeCompare(nodeB.label, undefined, { sensitivity: "base" });
    });
  }
  const roots = nodes.filter((node) => !parent.has(node.id)).map((node) => node.id);
  return { byId, children, parent, roots };
}

function subtreeWeight(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const kids = children.get(id) ?? [];
  if (kids.length === 0) return 1;
  return Math.max(1, Math.min(48, kids.reduce((sum, child) => sum + subtreeWeight(child, children, seen), 0)));
}

function childCountsById(edges: GraphEdge[]) {
  const counts = new Map<number, number>();
  for (const edge of edges) {
    if (edge.edgeType === "contains") counts.set(edge.sourceId, (counts.get(edge.sourceId) ?? 0) + 1);
  }
  return counts;
}

function fallbackNode(node: GraphNode, index: number, depth: number, childCount: number): GraphDisplayNode {
  const angle = seededAngle(node.id);
  const radius = 120 + (index % 18) * 18;
  return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, depth, childCount };
}

function reduceNode(
  node: string,
  data: Record<string, unknown>,
  graph: Graph,
  hovered: string | null,
  selected: string | null,
  dimUnrelated: boolean,
) {
  const isHovered = hovered === node;
  const isSelected = selected === node;
  const baseSize = Number(data.baseSize ?? data.size ?? 5);
  const connectedToActive = (hovered || selected) ? isConnected(graph, node, hovered ?? selected!) : false;

  // Determine target values
  let targetColor = data.baseColor as string;
  let targetSize = baseSize;
  let targetZIndex = data.baseZIndex ?? 1;
  let targetLabel = data.label as string;

  if (dimUnrelated && (hovered || selected) && !isHovered && !isSelected && !connectedToActive) {
    targetColor = "#343a40";
    targetLabel = "";
    targetZIndex = 0;
    targetSize = Math.max(2, baseSize * 0.72);
  }

  if (connectedToActive) {
    targetSize = baseSize * 1.08;
    targetZIndex = 40;
  }

  if (isHovered) {
    targetColor = "#f5c542";
    targetSize = Math.max(8, baseSize * 1.35);
    targetZIndex = 90;
  }

  if (isSelected) {
    targetColor = "#ffffff";
    targetSize = Math.max(9, baseSize * 1.45);
    targetZIndex = 100;
  }

  // Only return new object if something actually changed
  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex &&
    data.label === targetLabel
  ) {
    return data; // Return same reference - no change
  }

  return {
    ...data,
    color: targetColor,
    size: targetSize,
    zIndex: targetZIndex,
    label: targetLabel,
  };
}

function reduceEdge(
  edge: string,
  data: Record<string, unknown>,
  graph: Graph,
  hovered: string | null,
  selected: string | null,
  dimUnrelated: boolean,
) {
  const active = hovered ?? selected;
  if (!active || !dimUnrelated) return data; // No change needed

  const source = graph.source(edge);
  const target = graph.target(edge);
  const related = source === active || target === active;

  const targetColor = related ? "#7dbbff" : "rgba(74, 85, 99, 0.22)";
  const targetSize = related ? 2.4 : 0.7;
  const targetZIndex = related ? 50 : 0;

  // Only return new object if something actually changed
  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex
  ) {
    return data; // Return same reference - no change
  }

  return {
    ...data,
    color: targetColor,
    size: targetSize,
    zIndex: targetZIndex,
  };
}

function isConnected(graph: Graph, node: string, active: string) {
  if (node === active) return true;
  try {
    return graph.hasEdge(node, active) || graph.hasEdge(active, node);
  } catch {
    return false;
  }
}

function getNodeSize(node: GraphDisplayNode): number {
  if (node.isCluster) return 17;
  if (node.isDir) return Math.min(18, 8 + Math.log2(node.childCount + 2) * 2);
  const sizeBoost = node.sizeBytes > 0 ? Math.min(3.5, Math.log10(node.sizeBytes + 1) * 0.42) : 0;
  return 5.5 + sizeBoost;
}

function getNodeColor(node: GraphNode): string {
  if (node.isCluster) return "#f59e0b";
  if (node.isDir) return "#73c991";
  return colorForExtension(node.extension);
}

function edgeColor(edge: GraphEdge): string {
  if (edge.edgeType === "contains") return "#4b6f93";
  if (edge.edgeType === "symlink") return "#b78a4a";
  if (edge.edgeType === "import") return "#c9a0dc";
  return "#5f8fc3";
}

function colorForExtension(extension?: string | null): string {
  if (!extension) return "#94a3b8";
  const ext = extension.toLowerCase();
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico"].includes(ext)) return "#38bdf8";
  if (["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "cpp", "c", "h", "hpp"].includes(ext)) return "#a78bfa";
  if (["md", "txt", "rtf"].includes(ext)) return "#d4d4d4";
  if (["json", "toml", "yaml", "yml", "xml", "ini", "conf"].includes(ext)) return "#f5c542";
  if (["css", "scss", "sass", "less", "html", "htm"].includes(ext)) return "#f472b6";
  if (["pdf", "doc", "docx"].includes(ext)) return "#fb923c";
  return "#94a3b8";
}

function computeStats(nodes: GraphDisplayNode[], edges: GraphEdge[]) {
  return {
    fileCount: nodes.filter((node) => !node.isDir && !node.isCluster).length,
    dirCount: nodes.filter((node) => node.isDir && !node.isCluster).length,
    clusterCount: nodes.filter((node) => node.isCluster).length,
    edgeCount: edges.length,
    totalSize: nodes.reduce((sum, node) => sum + (node.isDir ? 0 : node.sizeBytes || 0), 0),
  };
}

function minimapPoints(nodes: GraphDisplayNode[]) {
  if (nodes.length === 0) return [];
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return nodes.slice(0, 550).map((node) => ({
    id: node.id,
    x: 8 + ((node.x - minX) / width) * 104,
    y: 8 + ((node.y - minY) / height) * 70,
    r: node.isCluster ? 2.4 : node.isDir ? 1.9 : 1.25,
    color: getNodeColor(node),
    opacity: node.isDir ? 0.95 : 0.72,
  }));
}

function shortNodePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function seededAngle(id: number) {
  const x = Math.sin(Math.abs(id) * 999.13) * 10000;
  return (x - Math.floor(x)) * Math.PI * 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const GraphView = memo(GraphViewComponent);
