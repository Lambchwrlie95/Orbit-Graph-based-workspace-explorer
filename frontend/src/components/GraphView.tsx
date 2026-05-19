import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import {
  NodeCircleProgram,
  EdgeClampedProgram,
  createNodeCompoundProgram,
  drawDiscNodeLabel,
  type NodeLabelDrawingFunction,
} from "sigma/rendering";
import EdgeCurveProgram from "@sigma/edge-curve";
import { ArrowLeft, Maximize, Target } from "lucide-react";
import { GraphEdge, GraphNode, GraphPayload } from "../types";
import { formatBytes } from "../utils";
import { usePersistedState } from "../hooks/usePersistedState";
import { iconRuleForPath } from "../lib/fileGlyphs";
import { tauriInvoke } from "../lib/tauriCommands";
import type { IconThemePayload } from "../types";

type NodeView = "spheres" | "icons";
type VisualState = "primary" | "context" | "ghost" | "proxy";
type VisualGraphNode = GraphNode & {
  visualState?: VisualState;
  proxyKind?: string;
};

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

type EdgeCategory = "hierarchy" | "code" | "docs" | "symlink" | "semantic" | "tags" | "other";

const ALL_EDGE_CATEGORIES: EdgeCategory[] = ["hierarchy", "code", "docs", "symlink", "semantic", "tags", "other"];

const EDGE_CATEGORY_CONFIG: Record<EdgeCategory, { label: string; color: string; description: string }> = {
  hierarchy: { label: "Hierarchy", color: "#6f9ad0", description: "folder containment" },
  code: { label: "Code refs", color: "#a78bfa", description: "imports/dependencies" },
  docs: { label: "Doc links", color: "#5eead4", description: "markdown/wiki/web links" },
  symlink: { label: "Symlink", color: "#ed9a4a", description: "filesystem aliases" },
  semantic: { label: "Related", color: "#86efac", description: "semantic/similar edges" },
  tags: { label: "Tags", color: "#f472b6", description: "tag relationships" },
  other: { label: "Other edges", color: "#638fc3", description: "uncategorized relationships" },
};

const PREF = {
  layout: "orbit:graph:layoutMode",
  labels: "orbit:graph:showLabels:v4",
  files: "orbit:graph:showFiles:v2",
  folders: "orbit:graph:showFolders",
  dim: "orbit:graph:dimUnrelated",
  types: "orbit:graph:visibleTypes",
  nodeView: "orbit:graph:nodeView:v5",
  minimap: "orbit:graph:showMinimap",
  edges: "orbit:graph:visibleEdgeCategories:v1",
};

const VISUAL_FANOUT = {
  root: 32,
  folder: 14,
  deep: 8,
  // Per-folder limit applied to any folder the user has explicitly expanded
  // (its path appears in `expandedFolders`). Matches the backend's
  // EXPANDED_FOLDER_CHILD_LIMIT in src-tauri/src/graph.rs so the frontend cap
  // does not silently re-collapse what the backend just unhid.
  expanded: 200,
};

const GRAPH_LAYOUT_VERSION = "settled-constellation-v1";

// Golden angle in radians (~137.5°). Spacing children at this angle around a
// parent maximizes the minimum angular gap between any two siblings, which is
// why sunflower seeds and pinecones use it. We use it for organic spread.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const serializeTypeSet = (set: Set<NodeType>) => JSON.stringify(Array.from(set));
const deserializeTypeSet = (raw: string): Set<NodeType> => {
  try {
    const parsed = JSON.parse(raw) as NodeType[];
    return new Set(Array.isArray(parsed) ? parsed : ALL_NODE_TYPES);
  } catch {
    return new Set(ALL_NODE_TYPES);
  }
};

const serializeEdgeCategorySet = (set: Set<EdgeCategory>) => JSON.stringify(Array.from(set));
const deserializeEdgeCategorySet = (raw: string): Set<EdgeCategory> => {
  try {
    const parsed = JSON.parse(raw) as EdgeCategory[];
    const known = new Set(ALL_EDGE_CATEGORIES);
    const values = Array.isArray(parsed) ? parsed.filter((category) => known.has(category)) : ALL_EDGE_CATEGORIES;
    return new Set(values.length ? values : ALL_EDGE_CATEGORIES);
  } catch {
    return new Set(ALL_EDGE_CATEGORIES);
  }
};

function edgeCategoryForType(edgeType: string): EdgeCategory {
  if (edgeType === "contains") return "hierarchy";
  if (edgeType === "import" || edgeType === "dependency" || edgeType === "code_ref") return "code";
  if (edgeType === "markdown_link" || edgeType === "wikilink" || edgeType === "link") return "docs";
  if (edgeType === "symlink") return "symlink";
  if (edgeType === "related" || edgeType === "similar" || edgeType === "similarity" || edgeType === "semantic") return "semantic";
  if (edgeType === "tag" || edgeType === "hashtag") return "tags";
  return "other";
}

type LayoutMode = "constellation" | "tree";
type GraphDisplayNode = VisualGraphNode & { x: number; y: number; depth: number; childCount: number };

const deserializeLayoutMode = (raw: string): LayoutMode => {
  try {
    const value = JSON.parse(raw);
    if (value === "tree") return "tree";
    if (value === "constellation" || value === "orbit" || value === "map") return "constellation";
  } catch {
    if (raw === "tree") return "tree";
  }
  return "constellation";
};

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
  const [layoutMode, setLayoutMode] = usePersistedState<LayoutMode>(PREF.layout, "constellation", {
    deserialize: deserializeLayoutMode,
  });
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
  const [nodeView, setNodeView] = usePersistedState<NodeView>(PREF.nodeView, "spheres");
  const [showMinimap, setShowMinimap] = usePersistedState<boolean>(PREF.minimap, false);
  const [visibleEdgeCategories, setVisibleEdgeCategories] = usePersistedState<Set<EdgeCategory>>(
    PREF.edges,
    new Set(ALL_EDGE_CATEGORIES),
    { serialize: serializeEdgeCategorySet, deserialize: deserializeEdgeCategorySet },
  );
  const [iconTheme, setIconTheme] = useState<IconThemePayload | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandingCluster, setExpandingCluster] = useState<string | null>(null);
  const isFirstRenderRef = useRef(true);
  const lastFrameKeyRef = useRef<string | null>(null);
  const cameraZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRatioRef = useRef<number>(1.0);

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
        const isDir = Boolean(attrs.isDir);
        const isCluster = Boolean(attrs.isCluster);
        const baseColor = attrs.baseColor as string;
        graph.setNodeAttribute(node, "glyphText", isCluster ? "" : icon.text);
        graph.setNodeAttribute(
          node,
          "glyphColor",
          isCluster ? baseColor : isDir ? String(attrs.glyphColor ?? baseColor) : icon.fg ?? baseColor,
        );
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

  const toggleEdgeCategory = (category: EdgeCategory) => {
    setVisibleEdgeCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const setAllVisibleEdgeCategories = (categories: Set<EdgeCategory>) => {
    setVisibleEdgeCategories(categories);
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
    const shaped = layoutMode === "constellation" && visibleTypes.has("cluster")
      ? capVisualFanout(nodes, payload.edges, expandedFolders)
      : { nodes, edges: payload.edges };
    const allNodes: VisualGraphNode[] = [...shaped.nodes, ...breadcrumbNodesFiltered];
    const ids = new Set(allNodes.map((node) => node.id));
    const edges = dedupeGraphEdges(shaped.edges.filter((edge) =>
      ids.has(edge.sourceId) &&
      ids.has(edge.targetId) &&
      visibleEdgeCategories.has(edgeCategoryForType(edge.edgeType))
    ));
    return { ...payload, nodes: allNodes, edges };
  }, [payload, graphFilter, showFiles, showFolders, visibleTypes, visibleEdgeCategories, breadcrumbNodes, layoutMode, expandedFolders]);

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

  const groupColors = useMemo(() => {
    if (!displayPayload || displayPayload.nodes.length === 0) return new Map<number, string>();
    const tree = hierarchy(displayPayload.nodes, displayPayload.edges);
    const roots = tree.roots.length ? tree.roots : displayPayload.nodes.slice(0, 1).map(n => n.id);
    return buildGroupColors(tree, roots);
  }, [displayPayload]);


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
      const visualState = node.visualState ?? nodeVisualState(node);
      // Resolve glyph + color ONCE per node (path-derived; never changes).
      // The overlay reads these attrs directly so it never re-runs the
      // glob/map pipeline per frame.
      const icon = iconRuleForPath(node.path, node.isDir, node.isCluster, iconThemeRef.current);
      const baseColor = getNodeColor(node);
      const folderGlyphColor = node.isDir && !node.isCluster
        ? withAlpha(groupColors.get(node.id) ?? baseColor, 0.96)
        : baseColor;
      graph.addNode(String(node.id), {
        label: visibleNodeLabel(node),
        fullLabel: node.label,
        x: node.x,
        y: node.y,
        size: baseSize,
        baseSize,
        color: baseColor,
        baseColor,
        path: node.path,
        parentPath: node.parentPath,
        isDir: node.isDir,
        isCluster: node.isCluster,
        extension: node.extension,
        clusterSummary: node.clusterSummary,
        childCount: node.childCount,
        depth: node.depth,
        visualState,
        proxyKind: node.proxyKind,
        glyphText: visualState === "proxy" || node.isCluster ? "" : icon.text,
        glyphColor: node.isCluster ? baseColor : node.isDir ? folderGlyphColor : icon.fg ?? baseColor,
        // glyphBaseSize is stored so the renderer can scale glyphs independently
        // of the sphere size. In icons mode the sphere is set to 1 graph unit
        // (a tiny invisible hit-target); glyphBaseSize carries the true visual scale.
        glyphBaseSize: baseSize,
        forceLabel: nodeView === "icons" && !node.isCluster,
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
      const edgeVisualState = edgeVisualStateForGraph(graph, source, target);
      const edgeStyle = edgeStyleForGraph(edge, groupColors, edgeVisualState);
      // Containment edges stay as clamped straight lines (they ARE the
      // hierarchy backbone). Everything else (imports, wikilinks, markdown
      // links, future semantic edges) renders as curved arcs so they read as
      // organic "flow" instead of chord storms through the center.
      // Curvature is deterministic-per-edge via sin(id) so neighboring edges
      // bend in different directions and don't stack on top of each other.
      const edgeType = edgeStyle.program;
      const curvature = edgeStyle.curvature;
      graph.addEdgeWithKey(String(edge.id), source, target, {
        type: edgeType,
        size: edgeStyle.size,
        baseSize: edgeStyle.size,
        color: edgeStyle.color,
        baseColor: edgeStyle.color,
        edgeType: edge.edgeType,
        visualState: edgeVisualState,
        curvature,
        baseCurvature: curvature,
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
      // Two edge programs registered. Containment edges (parent → child) use
      // the clamped straight-line program — they ARE the visual skeleton and
      // need to read as crisp connections. Everything else (imports, links,
      // wikilinks, …) renders as a curved arc via @sigma/edge-curve so they
      // never form chord storms through the canvas center.
      edgeProgramClasses: {
        line: EdgeClampedProgram,
        curve: EdgeCurveProgram,
      },
      labelColor: { color: "#d4d4d4" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelDensity: 0.56,
      labelGridCellSize: 72,
      // Only render Sigma's own text labels when a node is ≥8px on screen.
      // Icons mode bypasses this entirely (forceLabel handles glyphs),
      // but in spheres mode this prevents the text storm at zoom-out.
      labelRenderedSizeThreshold: 5,
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "rgba(51,80,100,0.12)",
      zIndex: true,
      minCameraRatio: 0.03,
      maxCameraRatio: 8,
      // Linear ratio: node display size = graphSize / ratio. This keeps nodes
      // proportional to their screen spacing regardless of zoom level — they
      // neither "float" too large when zoomed out nor disappear when zoomed in.
      zoomToSizeRatioFunction: (ratio: number) => Math.max(ratio, 0.001),
      nodeReducer: (node, data) => reduceNode(node, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, navHistoryRef.current, breadcrumbNodesRef.current, nodeView),
      edgeReducer: (edge, data) => reduceEdge(edge, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, cameraRatioRef),
    });

    renderer.on("clickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      const isCluster = graph.getNodeAttribute(node, "isCluster") as boolean;
      selectedNodeRef.current = node;
      setSelectedNode(prev => prev === node ? prev : node);
      renderer.scheduleRefresh();
      if (!path) return;
      if (isCluster) {
        const parentPath = graph.getNodeAttribute(node, "parentPath") as string | null | undefined;
        const folderPath = parentPath || path.replace("/__cluster__", "").replace(/\/__visual_[^/]+$/, "");
        setExpandingCluster(folderPath);
        onExpandCluster?.(folderPath);
        setTimeout(() => setExpandingCluster(null), 550);
        return;
      }
      // Single click: folder → open its graph, file → preview in inspector
      if (isDir) onFocusFolder?.(path);
      else onSelectPath(path);
    });

    renderer.on("doubleClickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      // Double-click on file opens it in editor; folders handled by single-click
      if (!path || isDir) return;
      onOpenPath?.(path);
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

    // Track camera ratio for zoom-aware edge thickness; debounce UI state update.
    renderer.getCamera().on("updated", () => {
      const ratio = renderer.getCamera().getState().ratio;
      cameraRatioRef.current = ratio;
      if (cameraZoomTimeoutRef.current) clearTimeout(cameraZoomTimeoutRef.current);
      cameraZoomTimeoutRef.current = setTimeout(() => {
        cameraZoomTimeoutRef.current = null;
        setZoomLevel(Math.round((1 / ratio) * 100) / 100);
      }, 100);
    });

    rendererRef.current = renderer;

    // Hide edges during camera pan for significantly smoother large-graph navigation
    let isPanning = false;
    let panEdgeRestoreTimer: ReturnType<typeof setTimeout> | null = null;
    const container = containerRef.current;
    const startPan = () => { isPanning = true; };
    const endPan = () => {
      if (!isPanning) return;
      isPanning = false;
      if (panEdgeRestoreTimer) clearTimeout(panEdgeRestoreTimer);
      graph.forEachEdge(e => graph.removeEdgeAttribute(e, 'hidden'));
      renderer.scheduleRefresh();
    };
    renderer.getCamera().on("updated", () => {
      if (!isPanning) return;
      if (panEdgeRestoreTimer) clearTimeout(panEdgeRestoreTimer);
      graph.forEachEdge(e => graph.setEdgeAttribute(e, 'hidden', true));
      panEdgeRestoreTimer = setTimeout(() => {
        panEdgeRestoreTimer = null;
        graph.forEachEdge(e => graph.removeEdgeAttribute(e, 'hidden'));
        renderer.scheduleRefresh();
      }, 180);
    });
    container?.addEventListener("mousedown", startPan);
    document.addEventListener("mouseup", endPan);

    // Reframe only when the loaded scope materially changes. This prevents HMR
    // and small visual-state updates from fighting the user's current camera.
    const frameKey = `${GRAPH_LAYOUT_VERSION}:${displayPayload.rootPath}:${displayPayload.mode}:${displayNodes.length}:${displayPayload.edges.length}`;
    if (isFirstRenderRef.current || lastFrameKeyRef.current !== frameKey) {
      isFirstRenderRef.current = false;
      lastFrameKeyRef.current = frameKey;
      requestAnimationFrame(() => renderer.getCamera().animatedReset({ duration: 360 }));
    }

    return () => {
      container?.removeEventListener("mousedown", startPan);
      document.removeEventListener("mouseup", endPan);
      if (panEdgeRestoreTimer) clearTimeout(panEdgeRestoreTimer);
      if (cameraZoomTimeoutRef.current) {
        clearTimeout(cameraZoomTimeoutRef.current);
        cameraZoomTimeoutRef.current = null;
      }
      renderer.kill();
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [displayPayload, displayNodes, groupColors, showLabels, dimUnrelated, nodeView, onSelectPath, onOpenPath, onFocusFolder, onExpandCluster]);

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
          {(["constellation", "tree"] as LayoutMode[]).map((mode) => (
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
        visibleEdgeCategories={visibleEdgeCategories}
        onToggleType={toggleNodeType}
        onToggleEdgeCategory={toggleEdgeCategory}
        onSetAllTypes={setAllVisibleTypes}
        onSetAllEdgeCategories={setAllVisibleEdgeCategories}
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
              <span>{expandingCluster === (hoveredInfo.parentPath ?? hoveredInfo.path.replace("/__cluster__", "")) ? "Expanding..." : "Click to expand"}</span>
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
                  reasons.push(`${ALL_NODE_TYPES.length - visibleTypes.size} node type(s) hidden in legend`);
                }
                if (visibleEdgeCategories.size < ALL_EDGE_CATEGORIES.length) {
                  reasons.push(`${ALL_EDGE_CATEGORIES.length - visibleEdgeCategories.size} edge type(s) hidden in legend`);
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

function layoutNodes(nodes: VisualGraphNode[], edges: GraphEdge[], mode: LayoutMode): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  if (mode === "tree") return treeLayout(nodes, edges);
  return constellationLayout(nodes, edges);
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

function capVisualFanout(nodes: GraphNode[], edges: GraphEdge[], expandedFolders: string[] = []) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number, number[]>();
  const parent = new Map<number, number>();
  const extraEdges: GraphEdge[] = [];
  // Folders the user has explicitly expanded should reveal up to
  // VISUAL_FANOUT.expanded children instead of the default depth-based cap.
  // Without this, clicking a proxy cluster looked like a no-op because the
  // backend would return more rows but the frontend would re-collapse them.
  const expandedSet = new Set(expandedFolders);

  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    if (!children.has(edge.sourceId)) children.set(edge.sourceId, []);
    children.get(edge.sourceId)!.push(edge.targetId);
    parent.set(edge.targetId, edge.sourceId);
  }

  const roots = nodes.filter((node) => !parent.has(node.id)).map((node) => node.id);
  const keep = new Set<number>(roots);
  const queue = roots.map((id) => ({ id, depth: 0 }));
  const syntheticNodes: VisualGraphNode[] = [];

  while (queue.length) {
    const { id, depth } = queue.shift()!;
    const kids = children.get(id) ?? [];
    if (!kids.length) continue;

    const sourceNode = nodeById.get(id);
    const isExpanded = sourceNode ? expandedSet.has(sourceNode.path) : false;
    const baseLimit = isExpanded
      ? VISUAL_FANOUT.expanded
      : depth === 0 ? VISUAL_FANOUT.root : depth === 1 ? VISUAL_FANOUT.folder : VISUAL_FANOUT.deep;
    // Soft margin: a proxy cluster only earns its visual weight when it would
    // hide at least PROXY_MIN_HIDDEN children. Trimming 1 or 2 items into
    // their own "+1 files" pill is uglier than just letting them through.
    const PROXY_MIN_HIDDEN = 3;
    const limit = kids.length <= baseLimit + PROXY_MIN_HIDDEN - 1 ? kids.length : baseLimit;
    const ordered = [...kids].sort((a, b) => compareGraphChildren(nodeById.get(a), nodeById.get(b)));
    const visible = ordered.slice(0, limit);
    const hidden = ordered.slice(limit);

    for (const child of visible) {
      keep.add(child);
      queue.push({ id: child, depth: depth + 1 });
    }

    if (hidden.length >= PROXY_MIN_HIDDEN) {
      const source = nodeById.get(id);
      if (!source) continue;
      for (const [proxyIndex, group] of hiddenProxyGroups(hidden, nodeById).entries()) {
        const summary = summarizeHiddenChildren(group.ids, nodeById);
        const clusterId = syntheticClusterId(id, proxyIndex);
        syntheticNodes.push({
          id: clusterId,
          label: `+${group.ids.length} ${group.label}`,
          path: `${source.path}/__visual_proxy_${group.kind}_${Math.abs(id)}_${proxyIndex}`,
          isDir: true,
          sizeBytes: summary.totalSize,
          extension: null,
          parentPath: source.path,
          isCluster: true,
          childCount: group.ids.length,
          clusterSummary: summary,
          visualState: "proxy",
          proxyKind: group.kind,
        });
        extraEdges.push({
          id: syntheticEdgeId(id, proxyIndex),
          sourceId: id,
          targetId: clusterId,
          edgeType: "contains",
          weight: 0.35,
        });
        keep.add(clusterId);
      }
    }
  }

  const nextNodes: VisualGraphNode[] = nodes.filter((node) => keep.has(node.id)).concat(syntheticNodes);
  const nextIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = edges
    .filter((edge) => nextIds.has(edge.sourceId) && nextIds.has(edge.targetId))
    .concat(extraEdges);

  return { nodes: nextNodes, edges: nextEdges };
}

function compareGraphChildren(a?: GraphNode, b?: GraphNode) {
  if (!a || !b) return 0;
  if (a.isCluster !== b.isCluster) return a.isCluster ? -1 : 1;
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
}

type HiddenProxyGroup = {
  kind: string;
  label: string;
  priority: number;
  ids: number[];
};

function hiddenProxyGroups(hiddenIds: number[], nodeById: Map<number, GraphNode>): HiddenProxyGroup[] {
  const buckets = new Map<string, HiddenProxyGroup>();

  const add = (kind: string, label: string, priority: number, id: number) => {
    const current = buckets.get(kind);
    if (current) {
      current.ids.push(id);
      return;
    }
    buckets.set(kind, { kind, label, priority, ids: [id] });
  };

  for (const id of hiddenIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.isDir) {
      add("folders", "folders", 0, id);
      continue;
    }
    const type = getNodeType(node);
    if (type === "image") add("images", "images", 1, id);
    else if (type === "code") add("code", "code", 2, id);
    else if (type === "config") add("configs", "configs", 3, id);
    else if (type === "text" || type === "document") add("docs", "docs", 4, id);
    else add("files", "files", 5, id);
  }

  const ordered = [...buckets.values()].sort((a, b) => a.priority - b.priority || b.ids.length - a.ids.length);
  if (ordered.length <= 4) return ordered;

  const visible = ordered.slice(0, 3);
  const overflowIds = ordered.slice(3).flatMap((group) => group.ids);
  visible.push({ kind: "more", label: "more", priority: 99, ids: overflowIds });
  return visible;
}

function summarizeHiddenChildren(hiddenIds: number[], nodeById: Map<number, GraphNode>) {
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;
  const extensions = new Map<string, number>();

  for (const id of hiddenIds) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (node.isDir) {
      dirCount += 1;
    } else {
      fileCount += 1;
      totalSize += node.sizeBytes || 0;
      if (node.extension) extensions.set(node.extension, (extensions.get(node.extension) ?? 0) + 1);
    }
  }

  const topExtensions = [...extensions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([ext]) => ext);

  return {
    totalChildren: hiddenIds.length,
    fileCount,
    dirCount,
    totalSize,
    topExtensions,
  };
}

function syntheticClusterId(parentId: number, index = 0) {
  return -50_000_000 - Math.abs(parentId) * 10 - index;
}

function syntheticEdgeId(parentId: number, index = 0) {
  return -60_000_000 - Math.abs(parentId) * 10 - index;
}

// Constellation layout: folders are structural branch arms; files and proxy
// clusters are local preview shelves near their parent. This intentionally
// avoids global depth rings, which create donut/spoke-wheel graphs on broad
// folders.
function constellationLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const placed = new Map<number, GraphDisplayNode>();
  const familyWedges: FamilyWedge[] = [];

  const familyIds = roots.length === 1 ? (tree.children.get(roots[0]) ?? roots) : roots;
  const familyLeafCounts = familyIds.map(id => Math.max(1, countLeaves(id, tree.children)));
  const familyLeafTotal = familyLeafCounts.reduce((a, b) => a + b, 0) || 1;

  if (roots.length === 1) {
    const rootId = roots[0];
    const rootNode = tree.byId.get(rootId);
    if (rootNode) {
      const kidCount = (tree.children.get(rootId) ?? []).length;
      placed.set(rootId, { ...rootNode, x: 0, y: 0, depth: 0, childCount: kidCount });
    }
  }

  const FAMILY_GAP = familyIds.length > 1 ? 0.05 : 0;
  const totalGap = FAMILY_GAP * familyIds.length;
  const usableArc = Math.PI * 2 - totalGap;
  let cursor = -Math.PI / 2;

  for (let i = 0; i < familyIds.length; i += 1) {
    const span = usableArc * (familyLeafCounts[i] / familyLeafTotal);
    const wedgeStart = cursor;
    const wedgeEnd = cursor + span;
    const heading = (wedgeStart + wedgeEnd) / 2;
    const maxDepth = subtreeMaxDepth(familyIds[i], tree.children);
    placeConstellationBranch(
      familyIds[i],
      0,
      0,
      heading,
      roots.length === 1 ? 1 : 0,
      wedgeStart,
      wedgeEnd,
      tree,
      placed,
    );
    familyWedges.push({
      id: familyIds[i],
      startAngle: wedgeStart,
      endAngle: wedgeEnd,
      maxDepth: (roots.length === 1 ? 1 : 0) + maxDepth,
    });
    cursor += span + FAMILY_GAP;
  }

  lastFamilyWedges = familyWedges;

  return nodes.map((node, index) => placed.get(node.id) ?? fallbackNode(node, index, 0, 0));
}

const BRANCH_BASE_STEP = 210;
const BRANCH_MIN_STEP = 118;
const PREVIEW_COLUMNS = 9;

function orbitRadiusForDepth(depth: number): number {
  if (depth <= 0) return 0;
  // Used only by the soft halo layer. Keep it roughly aligned with cumulative
  // branch reach, not a placement radius, so it doesn't imply visible rings.
  return 170 + depth * 165;
}

function branchStepFor(depth: number, childCount: number): number {
  const depthFalloff = Math.max(BRANCH_MIN_STEP, BRANCH_BASE_STEP - depth * 18);
  const breadthBoost = Math.min(58, Math.log2(Math.max(1, childCount) + 1) * 14);
  return depth <= 1 ? 230 + breadthBoost : depthFalloff + breadthBoost;
}

function placeConstellationBranch(
  id: number,
  parentX: number,
  parentY: number,
  heading: number,
  depth: number,
  start: number,
  end: number,
  tree: ReturnType<typeof hierarchy>,
  placed: Map<number, GraphDisplayNode>,
) {
  const node = tree.byId.get(id);
  if (!node || placed.has(id)) return;
  const kids = tree.children.get(id) ?? [];
  const distance = depth <= 0 ? 0 : branchStepFor(depth, kids.length);
  const x = depth <= 0 ? parentX : parentX + Math.cos(heading) * distance;
  const y = depth <= 0 ? parentY : parentY + Math.sin(heading) * distance;

  placed.set(id, { ...node, x, y, depth, childCount: kids.length });
  if (!kids.length) return;

  const branchKids: number[] = [];
  const previewKids: number[] = [];
  for (const childId of kids) {
    const child = tree.byId.get(childId);
    if (child?.isDir && !child.isCluster) branchKids.push(childId);
    else previewKids.push(childId);
  }

  placePreviewShelf(previewKids, x, y, heading, depth, tree, placed);

  if (!branchKids.length) return;

  const parentSpan = Math.max(0.2, end - start);
  const localSpan = Math.min(parentSpan, Math.max(0.42, Math.min(depth <= 1 ? 1.75 : 1.15, branchKids.length * 0.22)));
  const branchStart = heading - localSpan / 2;
  const gap = branchKids.length > 1 ? Math.min(0.06, localSpan / (branchKids.length * 4)) : 0;
  const weights = branchKids.map(child => Math.max(1, subtreeWeight(child, tree.children)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cursor = branchStart;

  branchKids.forEach((childId, index) => {
    const usableSpan = Math.max(0.08, localSpan - gap * Math.max(0, branchKids.length - 1));
    const childSpan = Math.max(0.08, usableSpan * (weights[index] / totalWeight));
    const childStart = cursor;
    const childEnd = cursor + childSpan;
    const wobble = Math.sin(childId * 12.9898) * 0.035;
    placeConstellationBranch(
      childId,
      x,
      y,
      (childStart + childEnd) / 2 + wobble,
      depth + 1,
      childStart,
      childEnd,
      tree,
      placed,
    );
    cursor += childSpan + gap;
  });
}

function placePreviewShelf(
  ids: number[],
  parentX: number,
  parentY: number,
  heading: number,
  depth: number,
  tree: ReturnType<typeof hierarchy>,
  placed: Map<number, GraphDisplayNode>,
) {
  if (!ids.length) return;
  const tangent = heading + Math.PI / 2;
  const columns = Math.min(PREVIEW_COLUMNS, Math.max(3, Math.ceil(Math.sqrt(ids.length) * 1.25)));
  const sideSpacing = depth <= 1 ? 27 : 23;
  const rowSpacing = depth <= 1 ? 38 : 32;
  const forwardBase = depth <= 1 ? 68 : 50;

  ids.forEach((id, index) => {
    const node = tree.byId.get(id);
    if (!node || placed.has(id)) return;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const centeredCol = col - (Math.min(columns, ids.length - row * columns) - 1) / 2;
    const rowFan = (row % 2 === 0 ? 1 : -1) * Math.min(10, row * 2);
    const forward = forwardBase + row * rowSpacing + (node.isCluster ? 26 : 0);
    const side = centeredCol * sideSpacing + rowFan;
    placed.set(id, {
      ...node,
      x: parentX + Math.cos(heading) * forward + Math.cos(tangent) * side,
      y: parentY + Math.sin(heading) * forward + Math.sin(tangent) * side,
      depth: depth + 1,
      childCount: (tree.children.get(id) ?? []).length,
    });
  });
}

function countLeaves(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const kids = children.get(id) ?? [];
  if (!kids.length) return 1;
  return kids.reduce((sum, c) => sum + countLeaves(c, children, new Set(seen)), 0);
}

function subtreeMaxDepth(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const kids = children.get(id) ?? [];
  if (!kids.length) return 0;
  let best = 0;
  for (const k of kids) {
    const d = subtreeMaxDepth(k, children, new Set(seen));
    if (d > best) best = d;
  }
  return 1 + best;
}

// Module-level handoff so the JSX-side halo layer can read the most recent
// family wedge geometry without us needing to thread it through every render.
// The layout writes; the renderer reads.
type FamilyWedge = {
  id: number;
  startAngle: number;
  endAngle: number;
  maxDepth: number;
};
let lastFamilyWedges: FamilyWedge[] = [];

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

// Convert "rgba(r,g,b,a)" or hex to "rgba(r,g,b,alpha)" with a custom alpha.
function withAlpha(rgba: string, alpha: number): string {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    const hex = rgba.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return rgba;
    const raw = hex[1].length === 3
      ? hex[1].split("").map((char) => char + char).join("")
      : hex[1];
    const value = Number.parseInt(raw, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
}

// Deterministic per-edge curvature so neighboring arcs bend in different
// directions instead of stacking. Range is approximately ±0.45, biased away
// from 0 so every curve actually shows as a curve (Sigma's EdgeCurveProgram
// renders a straight line at curvature 0).
function edgeCurvatureForId(id: number): number {
  const hash = Math.sin(Math.abs(id) * 78.233) * 43758.5453;
  const signedUnit = hash - Math.floor(hash) - 0.5; // -0.5 to +0.5
  const magnitude = 0.18 + Math.abs(signedUnit) * 0.6; // 0.18 to 0.48
  return signedUnit < 0 ? -magnitude : magnitude;
}

function subtreeWeight(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const kids = children.get(id) ?? [];
  if (kids.length === 0) return 1;
  return Math.max(1, Math.min(48, kids.reduce((sum, child) => sum + subtreeWeight(child, children, seen), 0)));
}

function treeLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
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

function hierarchy(nodes: VisualGraphNode[], edges: GraphEdge[]) {
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

function fallbackNode(node: VisualGraphNode, index: number, depth: number, childCount: number): GraphDisplayNode {
  const angle = seededAngle(node.id);
  const radius = 120 + (index % 18) * 18;
  return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, depth, childCount };
}

function visibleNodeLabel(node: GraphDisplayNode) {
  if (nodeVisualState(node) === "proxy") return "";
  if (nodeVisualState(node) === "ghost") return "";
  if (node.isCluster) return node.label;
  if (node.isDir && node.depth <= 2) return node.label;
  return "";
}

function nodeVisualState(node: GraphDisplayNode): VisualState {
  if (node.visualState) return node.visualState;
  if (node.depth <= 1) return "primary";
  if (node.isDir || node.isCluster) return "context";
  return "ghost";
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
  // detached the strings from the icons. The sphere itself is transparent so
  // it does not paint a dark disk over the grid.
  const rawBase = Number(data.baseSize ?? data.size ?? 5);
  const connectedToActive = (hovered || selected) ? isConnected(graph, node, hovered ?? selected!) : false;
  const nodePath = data.path as string;
  const isInNavHistory = navHistory.includes(nodePath);
  const isBreadcrumbNode = breadcrumbNodes.some(bn => bn.path === nodePath);
  const isBreadcrumb = (isInNavHistory || isBreadcrumbNode) && !isSelected;

  const iconsMode = nodeView === "icons";
  const visualState = String(data.visualState ?? "primary");

  const effectiveBase = rawBase;

  const isClusterNode = Boolean(data.isCluster);

  // Determine target values. In icons mode normal files/folders are rendered by
  // the glyph overlay, but proxy/cluster nodes remain as spheres so they don't
  // become noisy yellow placeholder icons.
  let targetColor = iconsMode && !isClusterNode ? "rgba(0,0,0,0)" : (data.baseColor as string);
  let targetSize = effectiveBase;
  let targetZIndex = data.baseZIndex ?? 1;
  let targetLabel = data.label as string;
  let targetGlyphOpacity = 1;
  let targetGlyphScale = 1;
  const targetForceLabel = iconsMode && !isClusterNode ? true : Boolean(data.forceLabel);
  const fullLabel = String(data.fullLabel ?? data.label ?? "");

  if (!iconsMode && visualState === "ghost") {
    targetSize = Math.max(2, effectiveBase * 0.78);
    targetZIndex = 0;
  } else if (!iconsMode && visualState === "proxy") {
    targetSize = effectiveBase;
    targetZIndex = 8;
  }

  // In icons mode all visual feedback (color, dim, hover, select) lives in
  // the HTML overlay. The sphere stays a constant invisible disk so edges
  // never visibly jitter their termination point. So we skip color AND size
  // mutations under iconsMode — only zIndex/label still update.
  if (dimUnrelated && (hovered || selected) && !isHovered && !isSelected && !connectedToActive) {
    if (!iconsMode) {
      targetColor = adjustColorBrightness(targetColor, 0.42);
      targetSize = Math.max(2, effectiveBase * 0.72);
    }
    if (iconsMode) targetGlyphOpacity = isClusterNode ? 0 : 0.32;
    targetLabel = "";
    targetZIndex = 0;
  }

  // Style breadcrumb nodes (in nav history but not selected)
  if (isBreadcrumb && !dimUnrelated) {
    if (!iconsMode) {
      targetColor = adjustColorBrightness(targetColor, 0.6);
      targetSize = effectiveBase * 0.85;
    }
    targetZIndex = 5;
  }

  if (connectedToActive) {
    if (!iconsMode) targetSize = effectiveBase * 1.08;
    targetZIndex = 40;
  }

  if (isHovered) {
    if (!iconsMode) {
      targetColor = "#f5c542";
      targetSize = Math.max(8, effectiveBase * 1.35);
    } else if (!isClusterNode) {
      targetGlyphScale = 1.2;
    }
    targetLabel = fullLabel;
    targetZIndex = 90;
  }

  if (isSelected) {
    if (!iconsMode) {
      targetColor = "#ffffff";
      targetSize = Math.max(9, effectiveBase * 1.45);
    } else if (!isClusterNode) {
      targetGlyphScale = 1.35;
    }
    targetLabel = fullLabel;
    targetZIndex = 100;
  }

  // Icons mode: keep the sphere at its natural radius (effectiveBase) so
  // EdgeClampedProgram terminates edges at the icon perimeter instead of the
  // node center. The sphere is invisible because targetColor is transparent;
  // glyphBaseSize drives the visible icon scale in the label renderer.

  // Only return new object if something actually changed
  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex &&
    data.label === targetLabel &&
    data.glyphOpacity === targetGlyphOpacity &&
    data.glyphScale === targetGlyphScale &&
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
    glyphScale: targetGlyphScale,
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
  cameraRatioRef?: { current: number },
) {
  // Zoom-aware thickness: raising ratio to the power 1.5 means screen-pixel width
  // shrinks when zooming in (ratio < 1) and grows when zooming out (ratio > 1).
  // This keeps edges legible at zoom-out while staying crisp and thin at zoom-in.
  const ratio = cameraRatioRef?.current ?? 1.0;
  const zoomScale = Math.max(0.1, Math.min(2.5, Math.pow(ratio, 1.5)));
  const baseSize = (data.baseSize ?? data.size ?? 1) as number;
  const edgeType = String(data.edgeType ?? "");
  const baseColor = String(data.baseColor ?? data.color ?? "rgba(99,143,195,0.12)");
  const visualState = String(data.visualState ?? "primary");

  const active = hovered ?? selected;

  if (!active || !dimUnrelated) {
    const targetSize = baseSize * zoomScale;
    if (data.size === targetSize && data.color === baseColor && data.hidden !== true) return data;
    return { ...data, hidden: false, color: baseColor, size: targetSize };
  }

  const source = graph.source(edge);
  const target = graph.target(edge);
  const related = source === active || target === active;

  const mutedUnrelated = visualState === "proxy" || visualState === "ghost";
  const targetColor = related
    ? (edgeType === "contains" ? (mutedUnrelated ? "rgba(116,171,216,0.28)" : "rgba(116,171,216,0.42)") : "#7dbbff")
    : (edgeType === "contains" ? (mutedUnrelated ? "rgba(74,106,138,0.08)" : "rgba(74,106,138,0.16)") : "rgba(74,85,99,0.05)");
  const targetSize = related
    ? (edgeType === "contains" ? (mutedUnrelated ? 0.82 : 1.15) : 2.2) * zoomScale
    : (edgeType === "contains" ? (mutedUnrelated ? 0.25 : 0.45) : 0.4) * zoomScale;
  const targetZIndex = related ? 50 : 0;
  const targetHidden = false;

  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex &&
    data.hidden === targetHidden
  ) {
    return data;
  }

  return { ...data, hidden: targetHidden, color: targetColor, size: targetSize, zIndex: targetZIndex };
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

const GROUP_COLORS = [
  "rgba(99,179,237,0.30)",   // sky blue
  "rgba(154,117,243,0.30)",  // purple
  "rgba(72,187,120,0.30)",   // green
  "rgba(237,137,54,0.30)",   // orange
  "rgba(237,100,166,0.30)",  // pink
  "rgba(56,189,248,0.30)",   // cyan
  "rgba(251,191,36,0.30)",   // yellow
  "rgba(248,113,113,0.30)",  // red
];

function buildGroupColors(
  tree: ReturnType<typeof hierarchy>,
  roots: number[],
): Map<number, string> {
  const colorMap = new Map<number, string>();
  function assign(id: number, color: string) {
    colorMap.set(id, color);
    for (const child of tree.children.get(id) ?? []) assign(child, color);
  }
  roots.forEach((rootId, i) => assign(rootId, GROUP_COLORS[i % GROUP_COLORS.length]));
  return colorMap;
}

function getNodeSize(node: GraphDisplayNode): number {
  const visualState = nodeVisualState(node);
  if (visualState === "proxy") {
    return Math.min(18, 8 + Math.log2(Math.max(1, node.childCount) + 2) * 1.7);
  }
  if (node.isCluster) return 14;
  if (node.isDir) {
    const baseSize = 5;
    const maxSize = 9.5;
    const growth = Math.log2(Math.min(node.childCount, 50) + 2) * 0.55;
    const size = Math.min(maxSize, baseSize + growth);
    return visualState === "ghost" ? Math.max(4, size * 0.82) : size;
  }
  const sizeBoost = node.sizeBytes > 0 ? Math.min(2.5, Math.log10(node.sizeBytes + 1) * 0.35) : 0;
  const size = 4 + sizeBoost;
  return visualState === "ghost" ? Math.max(2.6, size * 0.72) : size;
}

function getNodeColor(node: VisualGraphNode): string {
  // Drive node fill from the legend bucket so a swatch in the legend always
  // matches the corresponding sphere on the canvas.
  const color = NODE_TYPE_CONFIG[getNodeType(node)].color;
  if (node.visualState === "proxy") {
    if (node.proxyKind === "images") return "#688796";
    if (node.proxyKind === "folders") return "#738477";
    if (node.proxyKind === "code") return "#77728a";
    if (node.proxyKind === "configs") return "#827b68";
    return "#737f87";
  }
  if (node.visualState === "ghost") return adjustColorBrightness(color, 0.52);
  return color;
}

type EdgeVisualStyle = {
  program: "line" | "curve";
  size: number;
  color: string;
  curvature: number;
};

function edgeStyleForGraph(
  edge: GraphEdge,
  groupColors?: Map<number, string>,
  visualState: VisualState = "primary",
): EdgeVisualStyle {
  const edgeType = edge.edgeType;
  const muted = visualState === "proxy" || visualState === "ghost";
  const curve = edgeCurvatureForId(edge.id);

  // Visual vocabulary:
  // contains      = solid thin branch backbone, family-colored
  // import/code   = purple, stronger curved arc
  // markdown/wiki = teal, medium curved arc
  // symlink       = orange, thicker curved arc
  // related/sim   = green, soft curved arc
  // tag           = pink, soft curved arc
  // WebGL Sigma doesn't do dashed/dotted strokes with the stock programs, so
  // size + color + curvature are the cheap/fast stand-ins for "---", "==",
  // etc. A real dashed program can be added later if this vocabulary works.
  if (edgeType === "contains") {
    const baseColor = groupColors?.get(edge.sourceId) ?? groupColors?.get(edge.targetId) ?? "rgba(99,143,195,0.24)";
    return {
      program: "line",
      size: muted ? 0.34 : 0.5,
      color: withAlpha(baseColor, muted ? 0.14 : 0.28),
      curvature: 0,
    };
  }

  if (edgeType === "import" || edgeType === "dependency" || edgeType === "code_ref") {
    return { program: "curve", size: muted ? 0.46 : 0.9, color: `rgba(167,139,250,${muted ? 0.16 : 0.42})`, curvature: curve * 1.15 };
  }
  if (edgeType === "markdown_link" || edgeType === "wikilink" || edgeType === "link") {
    return { program: "curve", size: muted ? 0.42 : 0.72, color: `rgba(94,234,212,${muted ? 0.15 : 0.38})`, curvature: curve * 0.95 };
  }
  if (edgeType === "symlink") {
    return { program: "curve", size: muted ? 0.55 : 1.1, color: `rgba(237,154,74,${muted ? 0.18 : 0.48})`, curvature: curve * 1.3 };
  }
  if (edgeType === "related" || edgeType === "similar" || edgeType === "similarity" || edgeType === "semantic") {
    return { program: "curve", size: muted ? 0.36 : 0.62, color: `rgba(134,239,172,${muted ? 0.12 : 0.30})`, curvature: curve * 1.45 };
  }
  if (edgeType === "tag" || edgeType === "hashtag") {
    return { program: "curve", size: muted ? 0.36 : 0.62, color: `rgba(244,114,182,${muted ? 0.12 : 0.30})`, curvature: curve * 1.45 };
  }

  return { program: "curve", size: muted ? 0.34 : 0.58, color: `rgba(99,143,195,${muted ? 0.10 : 0.24})`, curvature: curve };
}


function edgeVisualStateForGraph(graph: Graph, source: string, target: string): VisualState {
  const sourceState = graph.getNodeAttribute(source, "visualState") as VisualState | undefined;
  const targetState = graph.getNodeAttribute(target, "visualState") as VisualState | undefined;
  if (sourceState === "proxy" || targetState === "proxy") return "proxy";
  if (sourceState === "ghost" || targetState === "ghost") return "ghost";
  if (sourceState === "context" || targetState === "context") return "context";
  return "primary";
}

type NodeType = 'folder' | 'code' | 'image' | 'text' | 'config' | 'web' | 'document' | 'other' | 'cluster';

function getNodeType(node: GraphNode): NodeType {
  if (node.isCluster) return 'cluster';
  if (node.isDir) return 'folder';
  const ext = node.extension?.toLowerCase() || '';
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico", "tiff", "xcf"].includes(ext)) return 'image';
  if (["rs", "ts", "tsx", "js", "jsx", "mjs", "py", "go", "java", "kt", "cpp", "c", "h", "hpp",
       "rb", "lua", "zig", "nim", "ex", "exs", "dart", "swift", "cs", "php", "r"].includes(ext)) return 'code';
  if (["sh", "bash", "zsh", "fish", "nu", "ps1", "bat", "cmd"].includes(ext)) return 'code';
  if (["md", "mdx", "txt", "rtf", "rst", "adoc"].includes(ext)) return 'text';
  if (["json", "json5", "jsonc", "toml", "yaml", "yml", "xml", "ini", "conf", "env", "cfg"].includes(ext)) return 'config';
  if (["css", "scss", "sass", "less", "html", "htm", "vue", "svelte", "astro"].includes(ext)) return 'web';
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt"].includes(ext)) return 'document';
  // Executables in bin directories (no extension) are typically code/tools
  if (!ext && /\/(bin|sbin|\.bin|libexec)\//i.test(node.path)) return 'code';
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
  cluster: { label: 'Cluster', color: '#7b8790' },
};

interface GraphLegendProps {
  visibleTypes: Set<NodeType>;
  visibleEdgeCategories: Set<EdgeCategory>;
  onToggleType: (type: NodeType) => void;
  onToggleEdgeCategory: (category: EdgeCategory) => void;
  onSetAllTypes: (types: Set<NodeType>) => void;
  onSetAllEdgeCategories: (categories: Set<EdgeCategory>) => void;
  stats: ReturnType<typeof computeStats>;
}

function GraphLegend({
  visibleTypes,
  visibleEdgeCategories,
  onToggleType,
  onToggleEdgeCategory,
  onSetAllTypes,
  onSetAllEdgeCategories,
}: GraphLegendProps) {
  const types: NodeType[] = ['folder', 'code', 'image', 'config', 'text', 'web', 'document', 'other', 'cluster'];
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedType, setLastClickedType] = useState<NodeType | null>(null);
  const [lastEdgeClickTime, setLastEdgeClickTime] = useState<number>(0);
  const [lastClickedEdgeCategory, setLastClickedEdgeCategory] = useState<EdgeCategory | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (edgeClickTimeoutRef.current) {
        clearTimeout(edgeClickTimeoutRef.current);
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

  const handleEdgeClick = (category: EdgeCategory, e: React.MouseEvent) => {
    const now = Date.now();
    const timeDiff = now - lastEdgeClickTime;

    if (timeDiff < 300 && lastClickedEdgeCategory === category) {
      if (edgeClickTimeoutRef.current) {
        clearTimeout(edgeClickTimeoutRef.current);
        edgeClickTimeoutRef.current = null;
      }

      e.stopPropagation();
      const allCategories = new Set<EdgeCategory>(ALL_EDGE_CATEGORIES);
      const isCurrentlyIsolated = visibleEdgeCategories.size === 1 && visibleEdgeCategories.has(category);
      onSetAllEdgeCategories(isCurrentlyIsolated ? allCategories : new Set<EdgeCategory>([category]));
    } else {
      if (edgeClickTimeoutRef.current) clearTimeout(edgeClickTimeoutRef.current);
      edgeClickTimeoutRef.current = setTimeout(() => {
        onToggleEdgeCategory(category);
        edgeClickTimeoutRef.current = null;
      }, 300);
    }

    setLastEdgeClickTime(now);
    setLastClickedEdgeCategory(category);
  };

  return (
    <div className="graph-legend" aria-label="Graph node and edge legend">
      <div className="legend-group" aria-label="Node types">
        <span className="legend-heading">Nodes</span>
        {types.map((type) => {
          const config = NODE_TYPE_CONFIG[type];
          const isVisible = visibleTypes.has(type);

          return (
            <button
              key={type}
              className={`legend-item ${isVisible ? '' : 'hidden'}`}
              onClick={(e) => handleItemClick(type, e)}
              title={`${isVisible ? 'Hide' : 'Show'} ${config.label} nodes (double-click to isolate/restore all)`}
            >
              <i className="legend-dot" style={{ background: isVisible ? config.color : '#555' }} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
      <div className="legend-divider" aria-hidden />
      <div className="legend-group" aria-label="Edge types">
        <span className="legend-heading">Edges</span>
        {ALL_EDGE_CATEGORIES.map((category) => {
          const config = EDGE_CATEGORY_CONFIG[category];
          const isVisible = visibleEdgeCategories.has(category);
          return (
            <button
              key={category}
              className={`legend-item legend-edge-item ${isVisible ? '' : 'hidden'}`}
              onClick={(e) => handleEdgeClick(category, e)}
              title={`${isVisible ? 'Hide' : 'Show'} ${config.description} (double-click to isolate/restore all edge types)`}
            >
              <i className="legend-edge-swatch" style={{ background: isVisible ? config.color : '#555' }} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
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

    const attrs = data as Record<string, unknown>;
    if (Boolean(attrs.isCluster)) {
      // Cluster/proxy nodes intentionally stay as Sigma spheres in icons mode.
      // The colored sphere is cleaner than a yellow file/folder glyph and makes
      // "more items here" read as an aggregate, not another real folder.
      return;
    }
    const glyph = String(attrs.glyphText ?? "·");
    if (!glyph) return;
    const glyphColor = String(attrs.glyphColor ?? data.color ?? "#a8bbc8");
    const opacity = Number(attrs.glyphOpacity ?? 1);
    const glyphScale = Number(attrs.glyphScale ?? 1);
    // Glyph size scales linearly with zoom. data.size is the camera-adjusted
    // pixel size of the (invisible) sphere, which now equals the node's natural
    // radius so EdgeClampedProgram terminates edges at the icon perimeter.
    // Multiplier 2.0 preserves the prior visual scale (when sphere was 1 graph
    // unit and the formula was glyphBase * data.size * 2.0, with glyphBase ==
    // sphere size, the two factors collapse to data.size * 2.0).
    // No minimum floor — let glyphs shrink naturally when zoomed out.
    // Skip rendering entirely when the glyph would be <6px (invisible squiggle).
    const rawFontSize = data.size * 2.0;
    if (rawFontSize < 6) {
      context.restore();
      return;
    }
    const fontSize = Math.min(96, rawFontSize) * glyphScale;

    context.save();
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;

    // Drop shadow via drawImage shadow (applies to the whole bitmap alpha)
    context.shadowColor = "rgba(0,0,0,0.55)";
    context.shadowBlur = 4;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;

    // Use cached bitmap for this glyph (much faster than fillText per frame)
    const bitmap = getGlyphBitmap(glyph, glyphColor);
    const half = fontSize / 2;
    context.drawImage(bitmap, data.x - half, data.y - half, fontSize, fontSize);

    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    // Only draw filename text when the icon is large enough to read.
    // fontSize < 20 means zoomed out — skip text to avoid clutter.
    if (showNames && data.label && fontSize >= 20) {
      context.globalAlpha = Math.min(0.92, context.globalAlpha);
      context.fillStyle = "#d4d4d4";
      context.font = '600 11px Inter, system-ui, sans-serif';
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(String(data.label), data.x, data.y + fontSize * 0.52 + 3, 120);
    }
    context.restore();
  };
}

// Module-level glyph bitmap cache: render each (glyph, color) pair once at high
// resolution into an HTMLCanvasElement, then drawImage on every frame instead of
// running font shaping per node per frame. drawImage is a GPU blit — far faster.
// 256px atlas gives 2× more resolution for crisp glyph rendering at high zoom.
// On HiDPI / Wayland displays (common on Omarchy/Hyprland setups) this matters.
const GLYPH_ATLAS_SIZE = 256;
const glyphBitmapCache = new Map<string, HTMLCanvasElement>();

function getGlyphBitmap(text: string, color: string): HTMLCanvasElement {
  const key = `${text}::${color}`;
  let bmp = glyphBitmapCache.get(key);
  if (!bmp) {
    bmp = document.createElement("canvas");
    bmp.width = GLYPH_ATLAS_SIZE;
    bmp.height = GLYPH_ATLAS_SIZE;
    const ctx2 = bmp.getContext("2d")!;
    // High-quality smoothing for when the bitmap is drawn at non-native sizes.
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    const fs = GLYPH_ATLAS_SIZE * 0.72;
    // Font stack: Nerd Font (Omarchy/Linux standard) → Unicode block shapes → system fallbacks.
    // JetBrainsMono Nerd Font ships with Omarchy; Symbols Nerd Font is the standalone PUA font.
    ctx2.font = `normal ${fs}px "JetBrainsMono Nerd Font", "JetBrains Mono NF", "Symbols Nerd Font", "SymbolsNerdFont", "Hack Nerd Font", "FiraCode Nerd Font", "Noto Sans Symbols 2", "Noto Sans Symbols", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillStyle = color;
    ctx2.fillText(text, GLYPH_ATLAS_SIZE / 2, GLYPH_ATLAS_SIZE / 2 + GLYPH_ATLAS_SIZE * 0.02);
    glyphBitmapCache.set(key, bmp);
  }
  return bmp;
}

export const GraphView = memo(GraphViewComponent);
