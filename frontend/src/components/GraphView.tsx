import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import {
  NodeCircleProgram,
  createNodeCompoundProgram,
  drawDiscNodeLabel,
  type NodeLabelDrawingFunction,
} from "sigma/rendering";
import { ArrowLeft, Maximize, Target } from "lucide-react";
import { GraphEdge, GraphNode, GraphPayload } from "../types";
import { formatBytes } from "../utils";
import { usePersistedState } from "../hooks/usePersistedState";
import { iconRuleForPath } from "../lib/fileGlyphs";
import { tauriInvoke } from "../lib/tauriCommands";
import type { IconThemePayload } from "../types";

type NodeView = "spheres" | "icons";

const ALL_NODE_TYPES: NodeType[] = [
  "folder",
  "code",
  "image",
  "config",
  "text",
  "web",
  "document",
  "other",
  "cluster",
];

const PREF = {
  layout: "orbit:graph:layoutMode",
  labels: "orbit:graph:showLabels",
  files: "orbit:graph:showFiles",
  folders: "orbit:graph:showFolders",
  dim: "orbit:graph:dimUnrelated",
  types: "orbit:graph:visibleTypes",
  nodeView: "orbit:graph:nodeView:v2",
  minimap: "orbit:graph:showMinimap",
};

const serializeTypeSet = (set: Set<NodeType>) => JSON.stringify(Array.from(set));
const deserializeTypeSet = (raw: string): Set<NodeType> => {
  try {
    const parsed = JSON.parse(raw) as NodeType[];
    return new Set(Array.isArray(parsed) ? parsed : ALL_NODE_TYPES);
  } catch {
    return new Set(ALL_NODE_TYPES);
  }
};

type LayoutMode = "orbit" | "tree";
type GraphDisplayNode = GraphNode & { x: number; y: number; depth: number; childCount: number };

interface GraphViewProps {
  payload: GraphPayload | null;
  selectedPath?: string | null;
  onSelectPath: (path: string) => void;
  onOpenPath?: (path: string) => void;
  onFocusFolder?: (path: string) => void;
  onGoBack?: () => void;
  onExpandCluster?: (folderPath: string) => void;
  expandedFolders?: string[];
  navHistory?: string[]; // Breadcrumb paths for navigation
  breadcrumbNodes?: GraphNode[]; // Parent folder nodes to keep visible
  isLoading?: boolean;
}

function GraphViewComponent({
  payload,
  selectedPath,
  onSelectPath,
  onOpenPath,
  onFocusFolder,
  onGoBack,
  onExpandCluster,
  expandedFolders = [],
  navHistory = [],
  breadcrumbNodes = [],
  isLoading,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const iconThemeRef = useRef<IconThemePayload | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const navHistoryRef = useRef<string[]>(navHistory);
  const breadcrumbNodesRef = useRef<GraphNode[]>(breadcrumbNodes);
  const [layoutMode, setLayoutMode] = usePersistedState<LayoutMode>(PREF.layout, "orbit");
  const [showLabels, setShowLabels] = usePersistedState<boolean>(PREF.labels, true);
  const [showFiles, setShowFiles] = usePersistedState<boolean>(PREF.files, true);
  const [showFolders, setShowFolders] = usePersistedState<boolean>(PREF.folders, true);
  const [dimUnrelated, setDimUnrelated] = usePersistedState<boolean>(PREF.dim, true);
  const [graphFilter, setGraphFilter] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [visibleTypes, setVisibleTypes] = usePersistedState<Set<NodeType>>(
    PREF.types,
    new Set(ALL_NODE_TYPES),
    { serialize: serializeTypeSet, deserialize: deserializeTypeSet },
  );
  const [nodeView, setNodeView] = usePersistedState<NodeView>(PREF.nodeView, "icons");
  const [showMinimap, setShowMinimap] = usePersistedState<boolean>(PREF.minimap, false);
  const [iconTheme, setIconTheme] = useState<IconThemePayload | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandingCluster, setExpandingCluster] = useState<string | null>(null);
  const isFirstRenderRef = useRef(true);
  const cameraZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Match Sigma wheel / double-click step (see DEFAULT_ZOOMING_RATIO in sigma) */
  const ZOOM_FACTOR = 1.5;

  useEffect(() => {
    let cancelled = false;
    tauriInvoke("get_active_icon_theme")
      .then((theme) => {
        if (!cancelled) {
          iconThemeRef.current = theme;
          setIconTheme(theme);
        }
      })
      .catch(() => {
        if (!cancelled) {
          iconThemeRef.current = null;
          setIconTheme(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const toggleLabels = () => setShowLabels((value) => !value);
    const toggleIcons = () => setNodeView((value) => (value === "icons" ? "spheres" : "icons"));
    document.addEventListener("orbit:graph:toggle-labels", toggleLabels);
    document.addEventListener("orbit:graph:toggle-icons", toggleIcons);
    return () => {
      document.removeEventListener("orbit:graph:toggle-labels", toggleLabels);
      document.removeEventListener("orbit:graph:toggle-icons", toggleIcons);
    };
  }, [setNodeView, setShowLabels]);

  useEffect(() => {
    iconThemeRef.current = iconTheme;
    // Refresh cached glyph attrs on every existing node so a theme switch
    // hot-swaps the overlay without rebuilding the graph.
    const graph = graphRef.current;
    if (graph) {
      graph.forEachNode((node, attrs) => {
        const icon = iconRuleForPath(
          attrs.path as string,
          attrs.isDir as boolean,
          attrs.isCluster as boolean,
          iconTheme,
        );
        graph.setNodeAttribute(node, "glyphText", icon.text);
        graph.setNodeAttribute(node, "glyphColor", icon.fg ?? (attrs.baseColor as string));
      });
    }
    rendererRef.current?.scheduleRefresh();
  }, [iconTheme]);

  // Listen for theme switches from elsewhere in the app (picker etc).
  useEffect(() => {
    const handler = () => {
      tauriInvoke("get_active_icon_theme")
        .then((theme) => {
          iconThemeRef.current = theme;
          setIconTheme(theme);
        })
        .catch(() => {});
    };
    document.addEventListener("orbit:icon-theme-changed", handler);
    return () => document.removeEventListener("orbit:icon-theme-changed", handler);
  }, []);

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

  const toggleNodeType = (type: NodeType) => {
    setVisibleTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const setAllVisibleTypes = (types: Set<NodeType>) => {
    setVisibleTypes(types);
  };

  const displayPayload = useMemo(() => {
    if (!payload) return null;
    const query = graphFilter.trim().toLowerCase();
    const nodes = payload.nodes.filter((node) => {
      if (!showFolders && node.isDir) return false;
      if (!showFiles && !node.isDir) return false;
      const nodeType = getNodeType(node);
      if (!visibleTypes.has(nodeType)) return false;
      if (!query) return true;
      return node.label.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
    });
    // Merge breadcrumb nodes (parent folders from navigation history)
    const breadcrumbNodesFiltered = breadcrumbNodes.filter(bn => !nodes.some(n => n.path === bn.path));
    const allNodes = [...nodes, ...breadcrumbNodesFiltered];
    const ids = new Set(allNodes.map((node) => node.id));
    const edges = dedupeGraphEdges(payload.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)));
    return { ...payload, nodes: allNodes, edges };
  }, [payload, graphFilter, showFiles, showFolders, visibleTypes, breadcrumbNodes]);

  const displayNodes = useMemo(() => {
    if (!displayPayload) return [];
    return layoutNodes(displayPayload.nodes, displayPayload.edges, layoutMode);
  }, [displayPayload, layoutMode]);

  const nodeByPath = useMemo(() => new Map(displayNodes.map((node) => [node.path, node])), [displayNodes]);
  const nodeById = useMemo(() => new Map(displayNodes.map((node) => [String(node.id), node])), [displayNodes]);
  const graphStats = useMemo(() => computeStats(displayNodes, displayPayload?.edges ?? []), [displayNodes, displayPayload]);
  const minimapNodes = useMemo(() => minimapPoints(displayNodes), [displayNodes]);
  const minimapEdges = useMemo(
    () => minimapEdgeLines(displayNodes, displayPayload?.edges ?? []),
    [displayNodes, displayPayload],
  );

  useEffect(() => {
    navHistoryRef.current = navHistory;
    breadcrumbNodesRef.current = breadcrumbNodes;
    rendererRef.current?.scheduleRefresh();
  }, [navHistory, breadcrumbNodes]);

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
      // Resolve glyph + color ONCE per node (path-derived; never changes).
      // The overlay reads these attrs directly so it never re-runs the
      // glob/map pipeline per frame.
      const icon = iconRuleForPath(node.path, node.isDir, node.isCluster, iconThemeRef.current);
      const baseColor = getNodeColor(node);
      graph.addNode(String(node.id), {
        label: node.label,
        x: node.x,
        y: node.y,
        size: baseSize,
        baseSize,
        color: baseColor,
        baseColor,
        path: node.path,
        isDir: node.isDir,
        isCluster: node.isCluster,
        extension: node.extension,
        clusterSummary: node.clusterSummary,
        childCount: node.childCount,
        glyphText: icon.text,
        glyphColor: icon.fg ?? baseColor,
        forceLabel: nodeView === "icons",
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
      renderLabels: nodeView === "icons" ? true : showLabels,
      renderEdgeLabels: false,
      nodeProgramClasses: {
        circle: createNodeCompoundProgram(
          [NodeCircleProgram],
          makeNodeLabelRenderer(nodeView, showLabels),
          () => undefined,
        ),
      },
      labelColor: { color: "#d4d4d4" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelDensity: 0.4,
      labelGridCellSize: 60,
      // Lowered from 7 → 3 so labels also show up at default zoom for the
      // smaller folder-class spheres (~6px). Without this, icons-mode and
      // spheres-mode looked inconsistent because labels disappeared on
      // smaller nodes long before they should.
      labelRenderedSizeThreshold: 3,
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "#335064",
      zIndex: true,
      minCameraRatio: 0.03,
      maxCameraRatio: 8,
      // Sigma divides by this value when computing canvas label size. sqrt
      // gives the expected camera behavior: zoom in => glyphs grow, zoom out
      // => glyphs shrink.
      zoomToSizeRatioFunction: (ratio: number) => Math.sqrt(Math.max(ratio, 0.001)),
      nodeReducer: (node, data) => reduceNode(node, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, navHistoryRef.current, breadcrumbNodesRef.current, nodeView),
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
  }, [displayPayload, displayNodes, showLabels, dimUnrelated, nodeView, onSelectPath, onOpenPath, onFocusFolder, onExpandCluster]);

  const focusSelected = () => {
    const renderer = rendererRef.current;
    const graph = graphRef.current;
    const selected = selectedNodeRef.current;
    if (!renderer || !graph || !selected || !graph.hasNode(selected)) return;
    // Sigma's camera coords are normalized framed-graph space, NOT raw layout
    // coordinates. Use getNodeDisplayData to get the correct (x,y) in camera
    // space, otherwise large layouts collapse the view to (0,0) and the graph
    // appears to disappear.
    const display = renderer.getNodeDisplayData(selected);
    if (!display) return;
    renderer.getCamera().animate(
      { x: display.x, y: display.y, ratio: 0.45 },
      { duration: 320 },
    );
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
          {(["orbit", "tree"] as LayoutMode[]).map((mode) => (
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

        <div className="graph-mode-tabs" aria-label="Node style">
          {(["spheres", "icons"] as NodeView[]).map((view) => (
            <button
              key={view}
              className={nodeView === view ? "active" : ""}
              onClick={() => setNodeView(view)}
              title={view === "icons" ? "Show file-type icons on nodes" : "Plain colored nodes"}
            >
              {view}
            </button>
          ))}
        </div>

        <div className="graph-switches">
          <button
            className={showFolders ? "active" : ""}
            onClick={() => setShowFolders((value) => !value)}
            title="Show folder nodes"
          >
            Folders
          </button>
          <button
            className={showFiles ? "active" : ""}
            onClick={() => setShowFiles((value) => !value)}
            title="Show file nodes"
          >
            Files
          </button>
          <button
            className={showLabels ? "active" : ""}
            onClick={() => setShowLabels((value) => !value)}
            title="Show node labels"
          >
            Labels
          </button>
          <button
            className={dimUnrelated ? "active" : ""}
            onClick={() => setDimUnrelated((value) => !value)}
            title="Dim unrelated nodes when one is hovered/selected"
          >
            Dim
          </button>
          <button
            className={showMinimap ? "active" : ""}
            onClick={() => setShowMinimap((value) => !value)}
            title="Show graph minimap"
          >
            Minimap
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
        {expandedFolders.length > 0 && <span className="expanded-badge">{expandedFolders.length} expanded</span>}
        {isLoading && <span className="loading-indicator">Loading...</span>}
      </div>

      <GraphLegend
        visibleTypes={visibleTypes}
        onToggleType={toggleNodeType}
        onSetAllTypes={setAllVisibleTypes}
        stats={graphStats}
      />

      {displayNodes.length > 0 && showMinimap && (
        <div className="graph-minimap" title="Graph minimap">
          <svg viewBox="0 0 120 86" role="img" aria-label="Graph minimap">
            {minimapEdges.map((edge, idx) => (
              <line
                key={idx}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="#3a4f63"
                strokeWidth={0.3}
                opacity={0.45}
              />
            ))}
            {minimapNodes.map((point) => (
              <circle key={point.id} cx={point.x} cy={point.y} r={point.r} fill={point.color} opacity={point.opacity} />
            ))}
          </svg>
        </div>
      )}

      <div className="graph-controls">
        <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
        <button
          type="button"
          className="graph-icon-btn"
          onClick={onGoBack}
          disabled={!onGoBack || navHistory.length === 0}
          title={
            navHistory.length > 0
              ? `Back to ${navHistory[navHistory.length - 1].split("/").pop() || "previous"}`
              : "Back (no history)"
          }
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
        </button>
        <button type="button" className="graph-icon-btn" onClick={fitGraph} title="Fit graph">
          <Maximize size={14} strokeWidth={1.8} />
        </button>
        <button type="button" className="graph-icon-btn" onClick={focusSelected} disabled={!selectedNode} title="Focus selected">
          <Target size={14} strokeWidth={1.8} />
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
        {isLoading && (
          <div className="graph-loading-overlay" role="status" aria-live="polite">
            <span className="orbit-spinner" aria-hidden />
            <strong>Loading graph</strong>
            <small>Index relationships are being prepared for this scope.</small>
          </div>
        )}
        {!isLoading && (!displayPayload || displayNodes.length === 0) && (
          <div className="empty-state">
            {payload ? (
              (() => {
                const total = payload.nodes.length;
                const reasons: string[] = [];
                if (!showFolders) reasons.push("folders hidden");
                if (!showFiles) reasons.push("files hidden");
                if (visibleTypes.size < ALL_NODE_TYPES.length) {
                  reasons.push(`${ALL_NODE_TYPES.length - visibleTypes.size} type(s) hidden in legend`);
                }
                if (graphFilter.trim()) reasons.push(`search "${graphFilter.trim()}"`);
                const why = reasons.length
                  ? reasons.join(" + ")
                  : (total === 0 ? "backend returned 0 nodes for this scope" : "all nodes filtered out");
                return (
                  <>
                    <p>No nodes visible — {why}.</p>
                    <p style={{ fontSize: "11px", color: "var(--orbit-muted)" }}>
                      backend has {total} node{total === 1 ? "" : "s"} in scope.
                    </p>
                    {(reasons.length > 0) && (
                      <button
                        type="button"
                        className="graph-reset-filters"
                        onClick={() => {
                          setShowFolders(true);
                          setShowFiles(true);
                          setVisibleTypes(new Set(ALL_NODE_TYPES));
                          setGraphFilter("");
                        }}
                      >
                        Reset all filters
                      </button>
                    )}
                  </>
                );
              })()
            ) : (
              <p>Scan a workspace to render the graph</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[], mode: LayoutMode): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  if (mode === "tree") return treeLayout(nodes, edges);
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
  if (edge.edgeType === "markdown_link") return 2;
  return 1;
}

function orbitLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const placed = new Map<number, GraphDisplayNode>();
  const totalWeight = roots.reduce((sum, id) => sum + subtreeWeight(id, tree.children), 0) || roots.length;
  let cursor = -Math.PI;

  // When the payload has no parent (every item is a "root"), the old code
  // placed every root at radius 0 → all nodes stacked on origin → user
  // sees ONE clumped sphere. Fix: if there are multiple roots, treat them
  // as orbiting an invisible super-root at depth 1 so they spread around.
  const rootDepth = roots.length === 1 ? 0 : 1;

  for (const rootId of roots) {
    const weight = subtreeWeight(rootId, tree.children);
    const span = Math.PI * 2 * (weight / totalWeight);
    placeOrbit(rootId, cursor, cursor + span, rootDepth, tree, placed);
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
  // Increase spacing between rings to prevent node overlap (was 82)
  const baseRadius = 100;
  const depthSpacing = 110;
  const radius = depth === 0 ? 0 : baseRadius + (depth - 1) * depthSpacing + Math.min(30, kids.length * 1.2);
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
  // Mermaid-ish top-down tree: each leaf gets a fixed slot of horizontal space,
  // parents sit at the centroid of their children's slots, and rows are spaced
  // generously so labels don't collide.
  const LEAF_GAP = 110;
  const ROW_GAP = 150;
  const tree = hierarchy(nodes, edges);
  const placed = new Map<number, GraphDisplayNode>();
  let leafIndex = 0;

  const place = (id: number, depth: number): number => {
    const node = tree.byId.get(id);
    if (!node || placed.has(id)) return leafIndex;
    const kids = tree.children.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leafIndex * LEAF_GAP;
      leafIndex += 1;
    } else {
      const childXs = kids.map((child) => place(child, depth + 1));
      x = childXs.reduce((sum, childX) => sum + childX, 0) / childXs.length;
    }
    placed.set(id, { ...node, x, y: depth * ROW_GAP, depth, childCount: kids.length });
    return x;
  };

  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  for (const root of roots) place(root, 0);

  const xs = [...placed.values()].map((node) => node.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  return nodes.map((node, index) => {
    const placedNode = placed.get(node.id);
    if (!placedNode) return fallbackNode(node, index, 0, 0);
    // Sigma uses Y-up internally; flip so depth grows downward visually.
    return { ...placedNode, x: placedNode.x - mid, y: -(placedNode.y - ROW_GAP) };
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
  navHistory: string[] = [],
  breadcrumbNodes: GraphNode[] = [],
  nodeView: NodeView = "spheres",
) {
  const isHovered = hovered === node;
  const isSelected = selected === node;
  // Keep the sphere at its NATURAL radius in icons mode too. Sigma terminates
  // edges at `size` from the node center, so collapsing the sphere to 1px
  // detached the strings from the icons. We instead paint the sphere the
  // exact canvas background color so it visually disappears, while still
  // anchoring the edge endpoints at the same radius the glyph occupies.
  const rawBase = Number(data.baseSize ?? data.size ?? 5);
  const baseSize = rawBase;
  const connectedToActive = (hovered || selected) ? isConnected(graph, node, hovered ?? selected!) : false;
  const nodePath = data.path as string;
  const isInNavHistory = navHistory.includes(nodePath);
  const isBreadcrumbNode = breadcrumbNodes.some(bn => bn.path === nodePath);
  const isBreadcrumb = (isInNavHistory || isBreadcrumbNode) && !isSelected;

  // Must match --orbit-bg in styles.css. In icons mode the sphere is painted
  // with this so it blends into the canvas while still providing geometric
  // size for edge termination.
  const CANVAS_BG = "#1e1e1e";
  const iconsMode = nodeView === "icons";

  // Determine target values
  let targetColor = iconsMode ? CANVAS_BG : (data.baseColor as string);
  let targetSize = baseSize;
  let targetZIndex = data.baseZIndex ?? 1;
  let targetLabel = data.label as string;
  let targetGlyphOpacity = 1;
  const targetForceLabel = iconsMode || Boolean(data.forceLabel);

  // In icons mode all visual feedback (color, dim, hover, select) lives in
  // the HTML overlay. The sphere stays a constant invisible disk so edges
  // never visibly jitter their termination point. So we skip color AND size
  // mutations under iconsMode — only zIndex/label still update.
  if (dimUnrelated && (hovered || selected) && !isHovered && !isSelected && !connectedToActive) {
    if (!iconsMode) {
      // Preserve hue identity by darkening toward background instead of going monochrome
      targetColor = adjustColorBrightness(targetColor, 0.42);
      targetSize = Math.max(2, baseSize * 0.72);
    }
    if (iconsMode) targetGlyphOpacity = 0.32;
    targetLabel = "";
    targetZIndex = 0;
  }

  // Style breadcrumb nodes (in nav history but not selected)
  if (isBreadcrumb && !dimUnrelated) {
    if (!iconsMode) {
      targetColor = adjustColorBrightness(targetColor, 0.6);
      targetSize = baseSize * 0.85;
    }
    targetZIndex = 5;
  }

  if (connectedToActive) {
    if (!iconsMode) targetSize = baseSize * 1.08;
    targetZIndex = 40;
  }

  if (isHovered) {
    if (!iconsMode) {
      targetColor = "#f5c542";
      targetSize = Math.max(8, baseSize * 1.35);
    }
    targetZIndex = 90;
  }

  if (isSelected) {
    if (!iconsMode) {
      targetColor = "#ffffff";
      targetSize = Math.max(9, baseSize * 1.45);
    }
    targetZIndex = 100;
  }

  // Only return new object if something actually changed
  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex &&
    data.label === targetLabel &&
    data.glyphOpacity === targetGlyphOpacity &&
    data.forceLabel === targetForceLabel
  ) {
    return data; // Return same reference - no change
  }

  return {
    ...data,
    color: targetColor,
    size: targetSize,
    zIndex: targetZIndex,
    label: targetLabel,
    glyphOpacity: targetGlyphOpacity,
    forceLabel: targetForceLabel,
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

// Helper to darken/lighten a hex color
function adjustColorBrightness(hex: string, factor: number): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  // Clamp to 0-255
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getNodeSize(node: GraphDisplayNode): number {
  if (node.isCluster) return 14;
  if (node.isDir) {
    // Smaller base size and gentler growth for folders
    const baseSize = 6;
    const maxSize = 12; // Reduced from 18
    const growth = Math.log2(Math.min(node.childCount, 50) + 2) * 0.8;
    return Math.min(maxSize, baseSize + growth);
  }
  const sizeBoost = node.sizeBytes > 0 ? Math.min(2.5, Math.log10(node.sizeBytes + 1) * 0.35) : 0;
  return 4 + sizeBoost;
}

function getNodeColor(node: GraphNode): string {
  // Drive node fill from the legend bucket so a swatch in the legend always
  // matches the corresponding sphere on the canvas.
  return NODE_TYPE_CONFIG[getNodeType(node)].color;
}

function edgeColor(edge: GraphEdge): string {
  if (edge.edgeType === "contains") return "#4b6f93";
  if (edge.edgeType === "symlink") return "#b78a4a";
  if (edge.edgeType === "import") return "#c9a0dc";
  if (edge.edgeType === "markdown_link") return "#7ee8ba";
  return "#5f8fc3";
}

type NodeType = 'folder' | 'code' | 'image' | 'text' | 'config' | 'web' | 'document' | 'other' | 'cluster';

function getNodeType(node: GraphNode): NodeType {
  if (node.isCluster) return 'cluster';
  if (node.isDir) return 'folder';
  const ext = node.extension?.toLowerCase() || '';
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico"].includes(ext)) return 'image';
  if (["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "cpp", "c", "h", "hpp"].includes(ext)) return 'code';
  if (["md", "txt", "rtf"].includes(ext)) return 'text';
  if (["json", "toml", "yaml", "yml", "xml", "ini", "conf"].includes(ext)) return 'config';
  if (["css", "scss", "sass", "less", "html", "htm"].includes(ext)) return 'web';
  if (["pdf", "doc", "docx"].includes(ext)) return 'document';
  return 'other';
}

const NODE_TYPE_CONFIG: Record<NodeType, { label: string; color: string }> = {
  folder: { label: 'Folder', color: '#73c991' },
  code: { label: 'Code', color: '#a78bfa' },
  image: { label: 'Image', color: '#38bdf8' },
  text: { label: 'Text', color: '#d4d4d4' },
  config: { label: 'Config', color: '#f5c542' },
  web: { label: 'Web', color: '#f472b6' },
  document: { label: 'Doc', color: '#fb923c' },
  other: { label: 'Other', color: '#94a3b8' },
  cluster: { label: 'Cluster', color: '#f59e0b' },
};

interface GraphLegendProps {
  visibleTypes: Set<NodeType>;
  onToggleType: (type: NodeType) => void;
  onSetAllTypes: (types: Set<NodeType>) => void;
  stats: ReturnType<typeof computeStats>;
}

function GraphLegend({ visibleTypes, onToggleType, onSetAllTypes }: GraphLegendProps) {
  const types: NodeType[] = ['folder', 'code', 'image', 'config', 'text', 'web', 'document', 'other', 'cluster'];
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedType, setLastClickedType] = useState<NodeType | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (type: NodeType, e: React.MouseEvent) => {
    const now = Date.now();
    const timeDiff = now - lastClickTime;

    if (timeDiff < 300 && lastClickedType === type) {
      // Double-click detected - cancel pending single click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      e.stopPropagation();
      const allTypes = new Set<NodeType>(types);

      // Check if this type is currently isolated
      // We need to check the state BEFORE any toggle happened
      // Since single click was delayed, visibleTypes still has original state
      const isCurrentlyIsolated = visibleTypes.size === 1 && visibleTypes.has(type);

      if (isCurrentlyIsolated) {
        onSetAllTypes(allTypes); // Show all
      } else {
        onSetAllTypes(new Set<NodeType>([type])); // Isolate this type
      }
    } else {
      // Single click - delay the toggle to allow double-click detection
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      clickTimeoutRef.current = setTimeout(() => {
        onToggleType(type);
        clickTimeoutRef.current = null;
      }, 300);
    }

    setLastClickTime(now);
    setLastClickedType(type);
  };

  return (
    <div className="graph-legend">
      {types.map((type) => {
        const config = NODE_TYPE_CONFIG[type];
        const isVisible = visibleTypes.has(type);

        return (
          <button
            key={type}
            className={`legend-item ${isVisible ? '' : 'hidden'}`}
            onClick={(e) => handleItemClick(type, e)}
            title={`${isVisible ? 'Hide' : 'Show'} ${config.label} (double-click to isolate/restore all)`}
          >
            <i className="legend-dot" style={{ background: isVisible ? config.color : '#555' }} />
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
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

function minimapEdgeLines(nodes: GraphDisplayNode[], edges: GraphEdge[]) {
  if (nodes.length === 0 || edges.length === 0) return [];
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const project = (n: GraphDisplayNode) => ({
    x: 8 + ((n.x - minX) / width) * 104,
    y: 8 + (1 - (n.y - minY) / height) * 70,
  });
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const edge of edges.slice(0, 800)) {
    const src = byId.get(edge.sourceId);
    const dst = byId.get(edge.targetId);
    if (!src || !dst) continue;
    const a = project(src);
    const b = project(dst);
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return lines;
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
  // Sigma uses mathematical Y (up = positive); SVG/HTML use screen Y (down = positive).
  // Invert Y when projecting to the minimap so its orientation matches the main graph.
  return nodes.slice(0, 550).map((node) => ({
    id: node.id,
    x: 8 + ((node.x - minX) / width) * 104,
    y: 8 + (1 - (node.y - minY) / height) * 70,
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

function makeNodeLabelRenderer(nodeView: NodeView, showNames: boolean): NodeLabelDrawingFunction {
  return (context, data, settings) => {
    if (nodeView !== "icons") {
      if (showNames) drawDiscNodeLabel(context, data, settings);
      return;
    }

    const glyph = String((data as Record<string, unknown>).glyphText ?? "·");
    const glyphColor = String((data as Record<string, unknown>).glyphColor ?? data.color ?? "#a8bbc8");
    const opacity = Number((data as Record<string, unknown>).glyphOpacity ?? 1);
    const fontSize = Math.max(12, Math.min(44, data.size * 2.45));

    context.save();
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
    context.fillStyle = glyphColor;
    context.font = `600 ${fontSize}px "Symbols Nerd Font", "SymbolsNerdFont", "JetBrainsMono Nerd Font", "Hack Nerd Font", "FiraCode Nerd Font", "Symbola", "Noto Sans Symbols 2", "Noto Sans Symbols", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(glyph, data.x, data.y);

    if (showNames && data.label) {
      context.globalAlpha = Math.min(0.92, context.globalAlpha);
      context.fillStyle = "#d4d4d4";
      context.font = '600 11px Inter, system-ui, sans-serif';
      context.textBaseline = "top";
      context.fillText(String(data.label), data.x, data.y + fontSize * 0.52 + 3, 120);
    }
    context.restore();
  };
}

export const GraphView = memo(GraphViewComponent);
