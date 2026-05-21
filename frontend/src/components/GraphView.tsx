import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import ForceGraph3D, { type ForceGraph3DInstance, type LinkObject, type NodeObject } from "3d-force-graph";
import * as THREE from "three";
import {
  NodeCircleProgram,
  EdgeClampedProgram,
  createNodeCompoundProgram,
  drawDiscNodeLabel,
  type NodeLabelDrawingFunction,
} from "sigma/rendering";
import EdgeCurveProgram from "@sigma/edge-curve";
import { ArrowLeft, Copy, ExternalLink, FolderOpen, Maximize, PenLine, SquareTerminal, Target } from "lucide-react";
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

type GraphContextMenuState = {
  x: number;
  y: number;
  node: VisualGraphNode;
} | null;

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

// Per-category metadata for the legend + edge renderer. The `color` field
// resolves at read time so a flavor switch (Catppuccin, Dracula, etc.) or a
// live Omarchy palette change picks up new colors without re-rendering the
// constants. `cssVar`/`fallback` are the source of truth.
const EDGE_CATEGORY_CONFIG: Record<EdgeCategory, { label: string; cssVar: string; fallback: string; description: string }> = {
  hierarchy: { label: "Hierarchy", cssVar: "--orbit-edge-hierarchy", fallback: "#6f9ad0", description: "folder containment" },
  code:      { label: "Code refs", cssVar: "--orbit-edge-code",      fallback: "#a78bfa", description: "imports/dependencies" },
  docs:      { label: "Doc links", cssVar: "--orbit-edge-docs",      fallback: "#5eead4", description: "markdown/wiki/web links" },
  symlink:   { label: "Symlink",   cssVar: "--orbit-edge-symlink",   fallback: "#ed9a4a", description: "filesystem aliases" },
  semantic:  { label: "Related",   cssVar: "--orbit-edge-semantic",  fallback: "#86efac", description: "semantic/similar edges" },
  tags:      { label: "Tags",      cssVar: "--orbit-edge-tags",      fallback: "#f472b6", description: "tag relationships" },
  other:     { label: "Other edges", cssVar: "--orbit-edge-other",   fallback: "#638fc3", description: "uncategorized relationships" },
};

function edgeCategoryColor(category: EdgeCategory): string {
  const entry = EDGE_CATEGORY_CONFIG[category];
  return graphThemeColor(entry.cssVar, entry.fallback);
}

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

const GRAPH_LAYOUT_VERSION = "vega-radial-tidy-airy-v3";

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

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function graphThemeColor(token: string, fallback: string): string {
  return cssVar(token, fallback);
}

function clusterGlyphForNode(node: Pick<VisualGraphNode, "proxyKind" | "isCluster"> & { visualState?: VisualState }) {
  if (node.proxyKind === "images") return "▧";
  if (node.proxyKind === "folders") return "⌘";
  if (node.proxyKind === "code") return "⌬";
  if (node.proxyKind === "configs") return "⚙";
  return node.isCluster || node.visualState === "proxy" ? "⬡" : "◇";
}

function clusterGlyphForAttrs(attrs: Record<string, unknown>) {
  return clusterGlyphForNode({
    isCluster: Boolean(attrs.isCluster),
    proxyKind: typeof attrs.proxyKind === "string" ? attrs.proxyKind : undefined,
    visualState: attrs.visualState as VisualState | undefined,
  });
}

type LayoutMode = "constellation" | "tree" | "graph3d";

type Graph3DNode = NodeObject & {
  id: string;
  name: string;
  label: string;
  path: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  isDir: boolean;
  isCluster: boolean;
  extension?: string | null;
  parentPath?: string | null;
  clusterSummary?: VisualGraphNode["clusterSummary"];
  childCount: number;
  depth: number;
  visualState?: VisualState;
  glyphText?: string;
};

type Graph3DLink = LinkObject<Graph3DNode> & {
  id: string;
  source: string | Graph3DNode;
  target: string | Graph3DNode;
  edgeType: string;
  category: EdgeCategory;
  color: string;
  width: number;
  curvature: number;
};
type GraphDisplayNode = VisualGraphNode & {
  x: number;
  y: number;
  depth: number;
  childCount: number;
  /** Vega-style radial tree angle in degrees, 0=right/east. */
  angle?: number;
  /** True when radial label should read on the left side of the circle. */
  leftside?: boolean;
  /** Source depth in the projected 3D mode; used for visual scale/z ordering. */
  z3d?: number;
  projectionScale?: number;
};

const deserializeLayoutMode = (raw: string): LayoutMode => {
  try {
    const value = JSON.parse(raw);
    if (value === "tree") return "tree";
    if (value === "graph3d" || value === "3d" || value === "3D") return "graph3d";
    if (value === "constellation" || value === "orbit" || value === "map") return "constellation";
  } catch {
    if (raw === "tree") return "tree";
    if (raw === "graph3d" || raw === "3d" || raw === "3D") return "graph3d";
  }
  return "constellation";
};

interface GraphViewProps {
  payload: GraphPayload | null;
  selectedPath?: string | null;
  onSelectPath: (path: string) => void;
  onOpenPath?: (path: string) => void;
  editorCommand?: string;
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
  editorCommand,
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
  const graph3dRef = useRef<ForceGraph3DInstance<Graph3DNode, Graph3DLink> | null>(null);
  const graph3dNodeRef = useRef<Map<string, Graph3DNode>>(new Map());
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
  const [contextMenu, setContextMenu] = useState<GraphContextMenuState>(null);
  const isFirstRenderRef = useRef(true);
  const lastFrameKeyRef = useRef<string | null>(null);
  const cameraZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRatioRef = useRef<number>(1.0);
  const previousNodePositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const transitionAnchorRef = useRef<{ path: string; x: number; y: number } | null>(null);

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
        const visualState = attrs.visualState as VisualState | undefined;
        graph.setNodeAttribute(node, "glyphText", isCluster || visualState === "proxy" ? clusterGlyphForAttrs(attrs) : icon.text);
        graph.setNodeAttribute(
          node,
          "glyphColor",
          isCluster || visualState === "proxy" ? baseColor : isDir ? String(attrs.glyphColor ?? baseColor) : icon.fg ?? baseColor,
        );
      });
    }
    rendererRef.current?.scheduleRefresh();
    graph3dRef.current?.nodeColor(graph3dRef.current.nodeColor());
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

  // Repaint when the user picks a different flavor (or Omarchy re-emits a
  // theme change). Reading the new CSS vars happens lazily inside
  // edgeStyleForGraph / reduceNode — we just need to nudge Sigma.
  useEffect(() => {
    const handler = () => {
      rendererRef.current?.scheduleRefresh();
      graph3dRef.current?.backgroundColor(graphThemeColor("--orbit-graph-canvas", "#101010"));
      graph3dRef.current?.nodeColor(graph3dRef.current.nodeColor());
      graph3dRef.current?.linkColor(graph3dRef.current.linkColor());
    };
    window.addEventListener("orbit:flavor-changed", handler);
    window.addEventListener("orbit:omarchy-theme-changed", handler);
    return () => {
      window.removeEventListener("orbit:flavor-changed", handler);
      window.removeEventListener("orbit:omarchy-theme-changed", handler);
    };
  }, []);

  const openNodeInEditor = useCallback(async (path: string) => {
    try {
      await tauriInvoke("open_in_terminal_editor", { path, editorCommand });
    } catch (err) {
      console.error("Failed to open node in editor", err);
    }
  }, [editorCommand]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

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
    const shaped = layoutMode !== "tree" && visibleTypes.has("cluster")
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

  const graph3dData = useMemo(() => {
    if (!displayPayload) return { nodes: [] as Graph3DNode[], links: [] as Graph3DLink[] };
    return buildGraph3DData(displayNodes, displayPayload.edges, groupColors, iconTheme);
  }, [displayPayload, displayNodes, groupColors, iconTheme]);


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

    capturePreviousNodePositions(graphRef.current, previousNodePositionsRef);
    rendererRef.current?.kill();
    rendererRef.current = null;
    graphRef.current = null;
    hoveredNodeRef.current = null;

    if (!displayPayload || displayNodes.length === 0) return;

    if (layoutMode === "graph3d") {
      const container = containerRef.current;
      const ForceGraph3DTyped = ForceGraph3D as unknown as {
        new(element: HTMLElement, configOptions?: { controlType?: "trackball" | "orbit" | "fly"; rendererConfig?: { antialias?: boolean; alpha?: boolean } }): ForceGraph3DInstance<Graph3DNode, Graph3DLink>;
      };
      const graphApi = new ForceGraph3DTyped(container, {
        controlType: "orbit",
        rendererConfig: { antialias: true, alpha: false },
      })
        .backgroundColor(graphThemeColor("--orbit-graph-canvas", "#101010"))
        .showNavInfo(false)
        .width(container.clientWidth || 800)
        .height(container.clientHeight || 600)
        .nodeLabel((node) => showLabels ? graph3dNodeLabel(node) : "")
        .nodeRelSize(nodeView === "icons" ? 7.5 : 9.2)
        .nodeVal((node) => node.val)
        .nodeColor((node) => graph3dNodeColor(node, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, graph3dData.links))
        .nodeThreeObject((node: Graph3DNode) => graph3dNodeObject(node, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, graph3dData.links, showLabels))
        .nodeOpacity(1)
        .nodeResolution(nodeView === "icons" ? 18 : 22)
        .linkColor((link) => graph3dLinkColor(link, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated))
        .linkOpacity(0.74)
        .linkWidth((link) => graph3dLinkWidth(link, hoveredNodeRef.current, selectedNodeRef.current))
        .linkCurvature((link) => link.curvature)
        .linkDirectionalParticles((link) => graph3dLinkParticles(link, hoveredNodeRef.current, selectedNodeRef.current))
        .linkDirectionalParticleWidth(1.4)
        .enableNodeDrag(true)
        .enableNavigationControls(true)
        .cooldownTicks(120)
        .onEngineStop(() => graphApi.zoomToFit(480, 64))
        .onNodeHover((node) => {
          const id = node?.id ?? null;
          hoveredNodeRef.current = id;
          setHoveredNode((prev) => prev === id ? prev : id);
          setGraph3DAutoRotate(graphApi, !id);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.nodeThreeObject(graphApi.nodeThreeObject());
          graphApi.linkColor(graphApi.linkColor());
          graphApi.linkWidth(graphApi.linkWidth());
          graphApi.linkDirectionalParticles(graphApi.linkDirectionalParticles());
        })
        .onBackgroundClick(() => {
          hoveredNodeRef.current = null;
          setHoveredNode(null);
          setGraph3DAutoRotate(graphApi, true);
        })
        .onNodeClick((node, event) => {
          selectedNodeRef.current = node.id;
          setSelectedNode((prev) => prev === node.id ? prev : node.id);
          if (node.path) onSelectPath(node.path);
          setGraph3DAutoRotate(graphApi, false);
          focusGraph3DNode(graphApi, node, 900);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.nodeThreeObject(graphApi.nodeThreeObject());
          graphApi.linkColor(graphApi.linkColor());
          graphApi.linkWidth(graphApi.linkWidth());
          if (event.detail > 1) {
            if (node.isCluster) {
              const folderPath = node.parentPath || node.path.replace("/__cluster__", "").replace(/\/__visual_[^/]+$/, "");
              setExpandingCluster(folderPath);
              onExpandCluster?.(folderPath);
              setTimeout(() => setExpandingCluster(null), 550);
            } else if (node.isDir) {
              onFocusFolder?.(node.path);
            } else {
              void openNodeInEditor(node.path);
            }
          }
        })
        .onNodeRightClick((node, event) => {
          event?.preventDefault?.();
          if (!node?.path) return;
          setContextMenu({
            x: event?.clientX ?? window.innerWidth / 2,
            y: event?.clientY ?? window.innerHeight / 2,
            node: node as unknown as VisualGraphNode,
          });
        })
        .onNodeDragEnd((node) => {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        })
        .graphData(graph3dData);

      const api = graphApi as unknown as { d3Force?: (name: string, force?: unknown) => any; d3ReheatSimulation?: () => void };
      const nodesById = new Map(graph3dData.nodes.map((node) => [node.id, node]));
      api.d3Force?.("link")?.distance?.((link: Graph3DLink) => graph3dLinkDistance(link, nodesById));
      api.d3Force?.("charge")?.strength?.((node: Graph3DNode) => node.isDir ? -82 : -34);
      const collide = api.d3Force?.("collide");
      collide?.radius?.((node: Graph3DNode) => Math.max(node.isDir ? 20 : 13, Math.sqrt(Math.max(1, node.val)) * 4.2));
      api.d3ReheatSimulation?.();

      graph3dRef.current = graphApi;
      graph3dNodeRef.current = new Map(graph3dData.nodes.map((node) => [node.id, node]));
      configureGraph3DControls(graphApi);
      setZoomLevel(1);

      const resizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        graphApi.width(width).height(height);
      });
      resizeObserver.observe(container);

      requestAnimationFrame(() => graphApi.zoomToFit(620, 72));

      return () => {
        resizeObserver.disconnect();
        graphApi._destructor();
        graph3dRef.current = null;
        graph3dNodeRef.current = new Map();
        container.replaceChildren();
      };
    }

    const graph = new Graph();
    graphRef.current = graph;

    for (const node of displayNodes) {
      const baseSize = getNodeSize(node) * (node.projectionScale ?? 1);
      const startPosition = transitionStartPosition(node, previousNodePositionsRef.current, transitionAnchorRef.current);
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
        x: startPosition.x,
        y: startPosition.y,
        targetX: node.x,
        targetY: node.y,
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
        angle: node.angle,
        leftside: node.leftside,
        z3d: node.z3d,
        projectionScale: node.projectionScale,
        visualState,
        proxyKind: node.proxyKind,
        glyphText: node.isCluster || visualState === "proxy" ? clusterGlyphForNode(node) : icon.text,
        glyphColor: node.isCluster || visualState === "proxy" ? baseColor : node.isDir ? folderGlyphColor : icon.fg ?? baseColor,
        // glyphBaseSize is stored so the renderer can scale glyphs independently
        // of the sphere size. In icons mode the sphere is set to 1 graph unit
        // (a tiny invisible hit-target); glyphBaseSize carries the true visual scale.
        glyphBaseSize: baseSize,
        forceLabel: nodeView === "icons" && !node.isCluster,
        baseZIndex: Math.round(((node.z3d ?? 0) + 2000) * 10),
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
      labelColor: { color: graphThemeColor("--omarchy-fg", "#d4d4d4") },
      labelFont: "IBM Plex Sans, Inter, system-ui, sans-serif",
      labelSize: 12,
      labelWeight: "600",
      labelDensity: 0.56,
      labelGridCellSize: 72,
      // Only render Sigma's own text labels when a node is ≥8px on screen.
      // Icons mode bypasses this entirely (forceLabel handles glyphs),
      // but in spheres mode this prevents the text storm at zoom-out.
      labelRenderedSizeThreshold: 5,
      defaultNodeColor: graphThemeColor("--omarchy-color7", "#94a3b8"),
      defaultEdgeColor: withAlpha(graphThemeColor("--omarchy-border", "#335064"), 0.32),
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
      if (isDir) {
        const display = renderer.getNodeDisplayData(node);
        const x = Number(graph.getNodeAttribute(node, "x"));
        const y = Number(graph.getNodeAttribute(node, "y"));
        transitionAnchorRef.current = { path, x, y };
        if (display) {
          renderer.getCamera().animate({ x: display.x, y: display.y, ratio: 0.32 }, { duration: 180, easing: "quadraticOut" });
          window.setTimeout(() => onFocusFolder?.(path), 110);
        } else {
          onFocusFolder?.(path);
        }
      }
      else onSelectPath(path);
    });

    renderer.on("doubleClickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      // Double-click on file opens it in editor; folders handled by single-click
      if (!path || isDir) return;
      void openNodeInEditor(path);
    });

    renderer.on("rightClickNode", (payload: any) => {
      const node = payload.node as string;
      const attrs = graph.getNodeAttributes(node) as VisualGraphNode;
      if (!attrs?.path) return;
      const event = payload.event?.original as MouseEvent | undefined;
      event?.preventDefault();
      setContextMenu({
        x: event?.clientX ?? window.innerWidth / 2,
        y: event?.clientY ?? window.innerHeight / 2,
        node: attrs,
      });
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
    animateGraphIntoPlace(graph, renderer, 420);

    const frameKey = `${GRAPH_LAYOUT_VERSION}:${layoutMode}:${displayPayload.rootPath}:${displayPayload.mode}:${displayNodes.length}:${displayPayload.edges.length}`;
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
  }, [displayPayload, displayNodes, graph3dData, groupColors, showLabels, dimUnrelated, nodeView, layoutMode, onSelectPath, onOpenPath, onFocusFolder, onExpandCluster, openNodeInEditor]);

  const focusSelected = () => {
    const selected = selectedNodeRef.current;
    if (layoutMode === "graph3d") {
      const graph3d = graph3dRef.current;
      const node = selected ? graph3dNodeRef.current.get(selected) : null;
      if (graph3d && node) focusGraph3DNode(graph3d, node, 520);
      return;
    }
    const renderer = rendererRef.current;
    const graph = graphRef.current;
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
    if (layoutMode === "graph3d") {
      graph3dRef.current?.zoomToFit(420, 72);
      return;
    }
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
    <div className={`graph-wrap graph-workbench graph-layout-${layoutMode}`}>
      <div className="graph-commandbar">
        <div className="graph-mode-tabs" aria-label="Graph layout">
          {(["constellation", "tree", "graph3d"] as LayoutMode[]).map((mode) => (
            <button
              key={mode}
              className={layoutMode === mode ? "active" : ""}
              onClick={() => setLayoutMode(mode)}
              title={layoutModeTitle(mode)}
            >
              {layoutModeLabel(mode)}
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

      <GraphNodeContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onSelect={(path) => onSelectPath(path)}
        onFocusFolder={(path) => onFocusFolder?.(path)}
        onOpenExternal={(path) => onOpenPath?.(path)}
        onOpenEditor={(path) => void openNodeInEditor(path)}
      />

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

interface GraphNodeContextMenuProps {
  menu: GraphContextMenuState;
  onClose: () => void;
  onSelect: (path: string) => void;
  onFocusFolder: (path: string) => void;
  onOpenExternal: (path: string) => void;
  onOpenEditor: (path: string) => void;
}

function GraphNodeContextMenu({ menu, onClose, onSelect, onFocusFolder, onOpenExternal, onOpenEditor }: GraphNodeContextMenuProps) {
  if (!menu) return null;
  const { node } = menu;
  const title = node.label || node.path.split("/").pop() || node.path;
  const left = Math.min(menu.x, Math.max(12, window.innerWidth - 260));
  const top = Math.min(menu.y, Math.max(12, window.innerHeight - 330));
  const closeAfter = (fn: () => void) => {
    fn();
    onClose();
  };
  const openNote = () => {
    onSelect(node.path);
    window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent("orbit:inspector:open-notes", { detail: { path: node.path } }));
    }, 40);
  };
  const terminalPath = node.isDir ? node.path : node.parentPath || node.path.replace(/\/[^/]+$/, "");

  return (
    <div className="graph-context-menu file-context-menu" style={{ left, top }} onContextMenu={(event) => event.preventDefault()}>
      <div className="ctx-title" title={node.path}>{title}</div>
      <button className="ctx-item" onClick={() => closeAfter(() => node.isDir ? onFocusFolder(node.path) : onSelect(node.path))}>
        <Target size={13} /> {node.isDir ? "Focus folder" : "Select in inspector"}
      </button>
      <button className="ctx-item" onClick={() => closeAfter(() => onOpenExternal(node.path))}>
        <ExternalLink size={13} /> Open externally
      </button>
      {!node.isDir && (
        <button className="ctx-item" onClick={() => closeAfter(() => onOpenEditor(node.path))}>
          <PenLine size={13} /> Open in editor
        </button>
      )}
      <button className="ctx-item" onClick={() => closeAfter(() => void tauriInvoke("open_terminal_at_path", { path: terminalPath }))}>
        <SquareTerminal size={13} /> Terminal here
      </button>
      {node.isDir && (
        <button className="ctx-item" onClick={() => closeAfter(() => onSelect(node.path))}>
          <FolderOpen size={13} /> Inspect folder
        </button>
      )}
      <button className="ctx-item" onClick={() => closeAfter(() => void navigator.clipboard?.writeText(node.path))}>
        <Copy size={13} /> Copy path
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => closeAfter(openNote)}>
        <PenLine size={13} /> Add / edit note
      </button>
    </div>
  );
}

function buildGraph3DData(
  nodes: GraphDisplayNode[],
  edges: GraphEdge[],
  groupColors: Map<number, string>,
  iconTheme: IconThemePayload | null,
): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  const byId = new Set(nodes.map((node) => String(node.id)));
  const parentByChild = new Map<number, number>();
  const siblingIndex = new Map<number, number>();
  const siblingCount = new Map<number, number>();
  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    parentByChild.set(edge.targetId, edge.sourceId);
  }
  const childrenByParent = new Map<number, number[]>();
  for (const [child, parent] of parentByChild) {
    const siblings = childrenByParent.get(parent) ?? [];
    siblings.push(child);
    childrenByParent.set(parent, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.forEach((child, index) => {
      siblingIndex.set(child, index);
      siblingCount.set(child, siblings.length);
    });
  }
  const scale = 0.14;
  const graphNodes = nodes.map((node) => {
    const visualState = node.visualState ?? nodeVisualState(node);
    const icon = iconRuleForPath(node.path, node.isDir, node.isCluster, iconTheme);
    const baseColor = graph3dNodeBaseColor(node, groupColors);
    const glyphText = node.isCluster || visualState === "proxy" ? clusterGlyphForNode(node) : icon.text;
    const depthZ = (node.depth - 1.5) * 14;
    const index = siblingIndex.get(node.id) ?? node.id;
    const total = Math.max(1, siblingCount.get(node.id) ?? 1);
    const orbitAngle = index * GOLDEN_ANGLE;
    const orbitRadius = parentByChild.has(node.id) ? Math.min(34, 10 + Math.sqrt(total) * 3.2 + node.depth * 1.4) : 0;
    const localLift = parentByChild.has(node.id) ? ((index % 5) - 2) * 5.5 : 0;
    return {
      id: String(node.id),
      name: node.label,
      label: visibleNodeLabel(node),
      path: node.path,
      parentPath: node.parentPath,
      color: baseColor,
      val: Math.max(9, getNodeSize(node) * (node.isDir ? 2.05 : 1.55)),
      x: Number.isFinite(node.x) ? node.x * scale + Math.cos(orbitAngle) * orbitRadius : undefined,
      y: Number.isFinite(node.y) ? node.y * scale + Math.sin(orbitAngle) * orbitRadius : undefined,
      z: Number.isFinite(depthZ) ? depthZ + localLift : undefined,
      isDir: node.isDir,
      isCluster: node.isCluster,
      extension: node.extension,
      clusterSummary: node.clusterSummary,
      childCount: node.childCount,
      depth: node.depth,
      visualState,
      glyphText,
    } satisfies Graph3DNode;
  });

  const seen = new Set<string>();
  const links: Graph3DLink[] = [];
  for (const edge of edges) {
    const source = String(edge.sourceId);
    const target = String(edge.targetId);
    if (!byId.has(source) || !byId.has(target)) continue;
    const pairKey = graphEdgePairKey(source, target);
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    const category = edgeCategoryForType(edge.edgeType);
    const style = edgeStyleForGraphEdge(edge, groupColors);
    links.push({
      id: String(edge.id),
      source,
      target,
      edgeType: edge.edgeType,
      category,
      color: style.color,
      width: style.size,
      curvature: category === "hierarchy" ? 0 : style.curvature * 0.35,
    });
  }
  return { nodes: graphNodes, links };
}

function graph3dNodeLabel(node: Graph3DNode): string {
  const kind = node.isCluster ? "Cluster" : node.isDir ? "Folder" : node.extension || "File";
  const glyph = node.glyphText ? `${node.glyphText} ` : "";
  return `<div class="graph-3d-label"><strong>${escapeHtml(`${glyph}${node.name}`)}</strong><br/><span>${escapeHtml(kind)}</span><br/><small>${escapeHtml(shortNodePath(node.path))}</small></div>`;
}

function graph3dNodeBaseColor(node: GraphDisplayNode, groupColors: Map<number, string>): string {
  if (node.isDir && !node.isCluster) return graph3dSolidColor(groupColors.get(node.id) ?? graphThemeColor("--omarchy-color2", "#8bd17c"), "#8bd17c");
  const color = getNodeColor(node);
  return graph3dSolidColor(color, NODE_TYPE_FALLBACKS[getNodeType(node)] ?? "#d8dee9");
}

function graph3dNodeObject(
  node: Graph3DNode,
  hoveredId: string | null,
  selectedId: string | null,
  dimUnrelated: boolean,
  links: Graph3DLink[],
  showText: boolean,
): THREE.Object3D {
  const focus = hoveredId || selectedId;
  const isActive = node.id === hoveredId || node.id === selectedId;
  const isRelated = Boolean(focus) && links.some((link) => {
    const source = graph3dEndpointId(link.source);
    const target = graph3dEndpointId(link.target);
    return (source === focus && target === node.id) || (target === focus && source === node.id);
  });
  const dimmed = dimUnrelated && Boolean(focus) && !isActive && !isRelated;
  const radius = Math.max(node.isDir ? 11 : 8.4, Math.sqrt(Math.max(1, node.val)) * (node.isDir ? 4.35 : 3.65));
  const color = graph3dSolidColor(graph3dNodeColor(node, hoveredId, selectedId, dimUnrelated, links), node.color);
  const group = new THREE.Group();
  const geometry = graph3dNodeGeometry(node, isActive ? radius * 1.18 : radius);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: dimmed ? 0.28 : 1,
    depthWrite: !dimmed,
  });
  const core = new THREE.Mesh(geometry, material);
  core.rotation.x = node.isDir ? Math.PI / 7 : 0;
  core.rotation.y = node.isCluster || node.visualState === "proxy" ? Math.PI / 4 : 0;
  group.add(core);

  const shouldShowBillboard = showText && (node.isDir || node.isCluster || isActive || isRelated);
  if (shouldShowBillboard && !dimmed) {
    const sprite = graph3dBillboard(node, isActive, radius);
    sprite.position.y = radius * 1.55;
    group.add(sprite);
  }

  return group;
}

function graph3dNodeGeometry(node: Graph3DNode, radius: number): THREE.BufferGeometry {
  if (node.isDir && !node.isCluster) return new THREE.BoxGeometry(radius * 1.55, radius * 1.12, radius * 1.18, 1, 1, 1);
  if (node.isCluster || node.visualState === "proxy") return new THREE.OctahedronGeometry(radius * 1.08, 0);
  if (node.extension === "md" || node.extension === "txt") return new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, radius * 0.44, 6);
  return new THREE.SphereGeometry(radius, 16, 10);
}

function graph3dBillboard(node: Graph3DNode, active: boolean, radius: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const width = active ? 420 : 340;
  const height = active ? 124 : 96;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${active ? 42 : 34}px Lilex, IBM Plex Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = graph3dSolidColor(active ? "#f5c542" : node.color, "#e5e7eb");
    const glyph = node.glyphText || (node.isDir ? "" : "•");
    ctx.fillText(glyph, width / 2, height * 0.34);
    ctx.font = `${active ? 24 : 19}px IBM Plex Sans, sans-serif`;
    ctx.fillStyle = active ? "#f8f1bf" : "#e5e7eb";
    const label = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;
    ctx.fillText(label, width / 2, height * 0.72);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const scale = active ? radius * 3.15 : radius * 2.45;
  sprite.scale.set(scale * (width / height), scale, 1);
  return sprite;
}

function graph3dSolidColor(value: string, fallback = "#d8dee9"): string {
  const token = value.trim().match(/^var\((--[^),\s]+)(?:,\s*([^)]*))?\)$/);
  if (token) return graph3dSolidColor(graphThemeColor(token[1], token[2]?.trim() || fallback), fallback);
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return graph3dRgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return fallback;
  if (hex[1].length === 6) return `#${hex[1]}`;
  return `#${hex[1].split("").map((char) => char + char).join("")}`;
}

function graph3dBrighten(value: string, factor: number): string {
  const color = graph3dSolidColor(value);
  const raw = color.slice(1);
  const parsed = Number.parseInt(raw, 16);
  const r = Math.min(255, Math.round(((parsed >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((parsed >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((parsed & 255) * factor));
  return graph3dRgbToHex(r, g, b);
}

function graph3dRgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0")).join("")}`;
}

function graph3dNodeColor(
  node: Graph3DNode,
  hoveredId: string | null,
  selectedId: string | null,
  dimUnrelated: boolean,
  links: Graph3DLink[],
): string {
  if (node.id === selectedId) return "#f5c542";
  if (node.id === hoveredId) return "#fff4a8";
  if (!dimUnrelated || (!hoveredId && !selectedId)) return node.color;
  const focus = hoveredId || selectedId;
  const related = links.some((link) => {
    const source = graph3dEndpointId(link.source);
    const target = graph3dEndpointId(link.target);
    return (source === focus && target === node.id) || (target === focus && source === node.id);
  });
  return related ? node.color : withAlpha(node.color, 0.22);
}

function graph3dLinkColor(link: Graph3DLink, hoveredId: string | null, selectedId: string | null, dimUnrelated: boolean): string {
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  if (focus && (source === focus || target === focus)) return withAlpha(link.color, 0.95);
  return dimUnrelated && focus ? withAlpha(link.color, 0.18) : withAlpha(link.color, link.category === "hierarchy" ? 0.82 : 0.9);
}

function graph3dLinkWidth(link: Graph3DLink, hoveredId: string | null, selectedId: string | null): number {
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  return focus && (source === focus || target === focus) ? Math.max(4.2, link.width * 4.6) : Math.max(1.35, link.width * 1.8);
}

function graph3dLinkDistance(link: Graph3DLink, nodesById: Map<string, Graph3DNode>): number {
  const source = nodesById.get(graph3dEndpointId(link.source));
  const target = nodesById.get(graph3dEndpointId(link.target));
  if (link.category !== "hierarchy") return 46;
  if (source?.isDir && target?.isDir) return 42;
  if (source?.isDir || target?.isDir) return 24;
  return 18;
}

function graph3dLinkParticles(link: Graph3DLink, hoveredId: string | null, selectedId: string | null): number {
  if (link.category === "hierarchy") return 0;
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  return focus && (source === focus || target === focus) ? 2 : 0;
}

function graph3dEndpointId(endpoint: string | number | Graph3DNode): string {
  return typeof endpoint === "object" ? String(endpoint.id) : String(endpoint);
}

function focusGraph3DNode(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>, node: Graph3DNode, duration = 700) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const z = node.z ?? 0;
  const distance = 42;
  const length = Math.hypot(x, y, z);
  const ratio = length > 0 ? 1 + distance / length : 1;
  graph.cameraPosition(
    length > 0 ? { x: x * ratio, y: y * ratio, z: z * ratio } : { x: 0, y: 0, z: distance },
    { x, y, z },
    duration,
  );
}

function configureGraph3DControls(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>) {
  const controls = graph3dControls(graph);
  if (!controls) return;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;
}

function setGraph3DAutoRotate(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>, enabled: boolean) {
  const controls = graph3dControls(graph);
  if (controls) controls.autoRotate = enabled;
}

function graph3dControls(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>) {
  return (graph as unknown as { controls?: () => { autoRotate?: boolean; autoRotateSpeed?: number; enableDamping?: boolean; dampingFactor?: number } }).controls?.();
}

function edgeStyleForGraphEdge(edge: GraphEdge, groupColors: Map<number, string>) {
  const category = edgeCategoryForType(edge.edgeType);
  const base = category === "hierarchy" ? (groupColors.get(edge.sourceId) ?? edgeCategoryColor(category)) : edgeCategoryColor(category);
  return {
    color: withAlpha(base, category === "hierarchy" ? 0.82 : 0.9),
    size: category === "hierarchy" ? 1.35 : 1.9,
    curvature: category === "hierarchy" ? 0 : Math.sin(Number(edge.id) * 12.9898) * 0.22,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layoutModeLabel(mode: LayoutMode): string {
  if (mode === "constellation") return "Atlas";
  if (mode === "tree") return "Tree";
  return "3D";
}

function layoutModeTitle(mode: LayoutMode): string {
  if (mode === "constellation") return "Atlas radial map layout";
  if (mode === "tree") return "2D tree layout";
  return "Real Three.js 3D force graph with orbit controls";
}

function layoutNodes(nodes: VisualGraphNode[], edges: GraphEdge[], mode: LayoutMode): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  if (mode === "tree") return treeLayout(nodes, edges);
  return constellationLayout(nodes, edges);
}

function capturePreviousNodePositions(
  graph: Graph | null,
  target: React.MutableRefObject<Map<string, { x: number; y: number }> | null>,
) {
  if (!graph) return;
  const positions = new Map<string, { x: number; y: number }>();
  graph.forEachNode((_node, attrs) => {
    const path = typeof attrs.path === "string" ? attrs.path : null;
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    if (path && Number.isFinite(x) && Number.isFinite(y)) positions.set(path, { x, y });
  });
  target.current = positions;
}

function transitionStartPosition(
  node: GraphDisplayNode,
  previous: Map<string, { x: number; y: number }> | null,
  anchor: { path: string; x: number; y: number } | null,
) {
  const direct = previous?.get(node.path);
  if (direct) return direct;
  if (anchor && (node.path === anchor.path || node.path.startsWith(`${anchor.path}/`))) {
    const jitter = seededAngle(node.id);
    return {
      x: anchor.x + Math.cos(jitter) * 10,
      y: anchor.y + Math.sin(jitter) * 10,
    };
  }
  return { x: node.x, y: node.y };
}

function animateGraphIntoPlace(graph: Graph, renderer: Sigma, duration = 420) {
  const starts = new Map<string, { x: number; y: number; tx: number; ty: number }>();
  graph.forEachNode((node, attrs) => {
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    const tx = Number(attrs.targetX ?? attrs.x);
    const ty = Number(attrs.targetY ?? attrs.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tx) || !Number.isFinite(ty)) return;
    if (Math.abs(x - tx) < 0.5 && Math.abs(y - ty) < 0.5) return;
    starts.set(node, { x, y, tx, ty });
  });
  if (!starts.size) return;
  const startTime = performance.now();
  const step = (now: number) => {
    const t = clampNumber((now - startTime) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    starts.forEach((pos, node) => {
      if (!graph.hasNode(node)) return;
      graph.setNodeAttribute(node, "x", pos.x + (pos.tx - pos.x) * eased);
      graph.setNodeAttribute(node, "y", pos.y + (pos.ty - pos.y) * eased);
    });
    renderer.scheduleRefresh();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

// Vega radial tidy layout: mirrors the Vega `stratify -> tree -> polar`
// example the user referenced. The hierarchy decides position first: leaves get
// stable angular slots, every parent sits at the midpoint of its children, and
// depth maps directly to radius. No global force solver runs afterward, because
// that destroys the readable tree structure and creates the "bunches" problem.
function constellationLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  return vegaRadialTidyLayout(nodes, roots, tree);
}

const VEGA_RADIAL_LEAF_GAP = 180;
const VEGA_RADIAL_DEPTH_GAP = 520;
const VEGA_RADIAL_ROOT_GAP_LEAVES = 8;
const VEGA_RADIAL_MIN_RADIUS = 1350;
const VEGA_RADIAL_START_ANGLE = 270; // Same visual start as Vega sample: root fan begins at top.

function vegaRadialTidyLayout(
  nodes: VisualGraphNode[],
  roots: number[],
  tree: ReturnType<typeof hierarchy>,
): GraphDisplayNode[] {
  const placed = new Map<number, GraphDisplayNode>();
  const orderedRoots = [...roots].sort((a, b) => compareGraphChildren(tree.byId.get(a), tree.byId.get(b)));
  const maxDepth = Math.max(1, ...orderedRoots.map((id) => subtreeMaxDepth(id, tree.children)));
  const totalLeafSlots = orderedRoots.reduce((sum, id) => sum + vegaLeafSlots(id, tree), 0)
    + Math.max(0, orderedRoots.length - 1) * VEGA_RADIAL_ROOT_GAP_LEAVES;

  // Vega's sample exposes this as a radius signal. Orbit derives it from graph
  // density so crowded folders expand outward instead of stacking icons.
  const circumferenceRadius = (Math.max(8, totalLeafSlots) * VEGA_RADIAL_LEAF_GAP) / (Math.PI * 2);
  const depthRadius = (maxDepth + 0.5) * VEGA_RADIAL_DEPTH_GAP;
  const radius = Math.max(VEGA_RADIAL_MIN_RADIUS, circumferenceRadius, depthRadius);
  const depthGap = radius / Math.max(1, maxDepth + 0.35);

  let cursor = 0;
  const rootDepth = orderedRoots.length === 1 ? 0 : 1;
  for (const root of orderedRoots) {
    const slots = vegaLeafSlots(root, tree);
    // Multiple filesystem roots behave like children of an implicit center root,
    // matching Vega's stratified hierarchy without drawing a fake node.
    placeVegaRadialNode(root, rootDepth, cursor, slots, totalLeafSlots, depthGap, tree, placed);
    cursor += slots + VEGA_RADIAL_ROOT_GAP_LEAVES;
  }

  lastFamilyWedges = orderedRoots.map((id) => {
    const node = placed.get(id);
    const angle = ((node?.angle ?? VEGA_RADIAL_START_ANGLE) * Math.PI) / 180;
    const spread = Math.max(0.08, (vegaLeafSlots(id, tree) / Math.max(1, totalLeafSlots)) * Math.PI * 2 * 0.5);
    return {
      id,
      startAngle: angle - spread,
      endAngle: angle + spread,
      maxDepth: subtreeMaxDepth(id, tree.children),
    };
  });

  return nodes.map((node, index) => placed.get(node.id) ?? fallbackNode(node, index, 0, 0));
}

function placeVegaRadialNode(
  id: number,
  depth: number,
  startSlot: number,
  slotSpan: number,
  totalSlots: number,
  depthGap: number,
  tree: ReturnType<typeof hierarchy>,
  placed: Map<number, GraphDisplayNode>,
): number {
  const node = tree.byId.get(id);
  if (!node || placed.has(id)) return startSlot + slotSpan / 2;

  const kids = orderedVegaChildren(id, tree);
  let alpha: number;
  if (!kids.length) {
    alpha = startSlot + slotSpan / 2;
  } else {
    let cursor = startSlot;
    const childAlphas: number[] = [];
    for (const child of kids) {
      const childSlots = vegaLeafSlots(child, tree);
      childAlphas.push(placeVegaRadialNode(child, depth + 1, cursor, childSlots, totalSlots, depthGap, tree, placed));
      cursor += childSlots;
    }
    alpha = childAlphas.reduce((sum, value) => sum + value, 0) / Math.max(1, childAlphas.length);
  }

  const normalized = totalSlots <= 0 ? 0 : alpha / totalSlots;
  const angle = (VEGA_RADIAL_START_ANGLE + normalized * 360) % 360;
  const radians = (Math.PI * angle) / 180;
  const childCount = kids.length;
  const radialDepth = depth === 0 && tree.roots.length === 1 ? 0 : depth;
  const nodeRadius = radialDepth * depthGap;
  const leftside = angle >= 90 && angle <= 270;

  placed.set(id, {
    ...node,
    x: Math.cos(radians) * nodeRadius,
    y: Math.sin(radians) * nodeRadius,
    depth,
    childCount,
    angle,
    leftside,
  });

  return alpha;
}

function orderedVegaChildren(id: number, tree: ReturnType<typeof hierarchy>) {
  const kids = [...(tree.children.get(id) ?? [])];
  return kids.sort((a, b) => {
    const nodeA = tree.byId.get(a);
    const nodeB = tree.byId.get(b);
    // Keep folders first so the radial tree reads as structural branches, but
    // otherwise preserve name ordering for deterministic inspectability.
    return compareGraphChildren(nodeA, nodeB);
  });
}

function vegaLeafSlots(id: number, tree: ReturnType<typeof hierarchy>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const node = tree.byId.get(id);
  if (!node) return 1;
  const kids = orderedVegaChildren(id, tree);
  if (!kids.length) {
    if (node.visualState === "proxy" || node.isCluster) return 5.4;
    if (node.isDir) return 3.2;
    return 1.35;
  }
  const childSlots = kids.reduce((sum, child) => sum + vegaLeafSlots(child, tree, new Set(seen)), 0);
  // Parents with many direct children reserve a little extra arc, matching the
  // Vega mental model while avoiding the old shelf pile-ups.
  return Math.max(childSlots, Math.min(14, 1.6 + kids.length * 0.42));
}

function orbitRadiusForDepth(depth: number): number {
  if (depth <= 0) return 0;
  return depth * VEGA_RADIAL_DEPTH_GAP;
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

  const isClusterNode = Boolean(data.isCluster) || visualState === "proxy";

  // Determine target values. In icons mode normal files/folders are rendered by
  // the glyph overlay, but proxy/cluster nodes remain as spheres so they don't
  // become noisy yellow placeholder icons.
  let targetColor = iconsMode || isClusterNode ? "rgba(0,0,0,0)" : (data.baseColor as string);
  let targetSize = effectiveBase;
  let targetZIndex = data.baseZIndex ?? 1;
  let targetLabel = data.label as string;
  let targetGlyphOpacity = 1;
  let targetGlyphScale = 1;
  const targetForceLabel = iconsMode || isClusterNode ? true : Boolean(data.forceLabel);
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
    if (iconsMode || isClusterNode) targetGlyphOpacity = isClusterNode ? 0.24 : 0.32;
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
      targetColor = graphThemeColor("--omarchy-color3", "#f5c542");
      targetSize = Math.max(8, effectiveBase * 1.35);
    } else {
      targetGlyphScale = isClusterNode ? 1.14 : 1.2;
    }
    targetLabel = fullLabel;
    targetZIndex = 90;
  }

  if (isSelected) {
    if (!iconsMode) {
      targetColor = graphThemeColor("--omarchy-fg", "#ffffff");
      targetSize = Math.max(9, effectiveBase * 1.45);
    } else {
      targetGlyphScale = isClusterNode ? 1.22 : 1.35;
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

const GROUP_COLOR_TOKENS: Array<{ cssVar: string; fallback: string }> = [
  { cssVar: "--orbit-family-1", fallback: "#63b3ed" },
  { cssVar: "--orbit-family-2", fallback: "#9a75f3" },
  { cssVar: "--orbit-family-3", fallback: "#48bb78" },
  { cssVar: "--orbit-family-4", fallback: "#ed8936" },
  { cssVar: "--orbit-family-5", fallback: "#ed64a6" },
  { cssVar: "--orbit-family-6", fallback: "#38bdf8" },
  { cssVar: "--orbit-family-7", fallback: "#fbbf24" },
  { cssVar: "--orbit-family-8", fallback: "#f87171" },
];

function groupColorAt(index: number): string {
  const token = GROUP_COLOR_TOKENS[index % GROUP_COLOR_TOKENS.length];
  return withAlpha(graphThemeColor(token.cssVar, token.fallback), 0.30);
}

function buildGroupColors(
  tree: ReturnType<typeof hierarchy>,
  roots: number[],
): Map<number, string> {
  const colorMap = new Map<number, string>();
  function assign(id: number, color: string) {
    colorMap.set(id, color);
    for (const child of tree.children.get(id) ?? []) assign(child, color);
  }
  roots.forEach((rootId, i) => assign(rootId, groupColorAt(i)));
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
  // contains      = Vega-like radial branch links, family-colored
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
      program: "curve",
      size: muted ? 0.34 : 0.54,
      color: withAlpha(baseColor, muted ? 0.14 : 0.30),
      // Vega radial linkpath with shape=curve/diagonal bends hierarchy links
      // instead of drawing rigid spokes. Keep this deterministic and modest so
      // parent-child structure stays readable.
      curvature: 0.22,
    };
  }

  if (edgeType === "import" || edgeType === "dependency" || edgeType === "code_ref") {
    return { program: "curve", size: muted ? 0.46 : 0.9, color: withAlpha(edgeCategoryColor("code"), muted ? 0.16 : 0.42), curvature: curve * 1.15 };
  }
  if (edgeType === "markdown_link" || edgeType === "wikilink" || edgeType === "link") {
    return { program: "curve", size: muted ? 0.42 : 0.72, color: withAlpha(edgeCategoryColor("docs"), muted ? 0.15 : 0.38), curvature: curve * 0.95 };
  }
  if (edgeType === "symlink") {
    return { program: "curve", size: muted ? 0.55 : 1.1, color: withAlpha(edgeCategoryColor("symlink"), muted ? 0.18 : 0.48), curvature: curve * 1.3 };
  }
  if (edgeType === "related" || edgeType === "similar" || edgeType === "similarity" || edgeType === "semantic") {
    return { program: "curve", size: muted ? 0.36 : 0.62, color: withAlpha(edgeCategoryColor("semantic"), muted ? 0.12 : 0.30), curvature: curve * 1.45 };
  }
  if (edgeType === "tag" || edgeType === "hashtag") {
    return { program: "curve", size: muted ? 0.36 : 0.62, color: withAlpha(edgeCategoryColor("tags"), muted ? 0.12 : 0.30), curvature: curve * 1.45 };
  }

  return { program: "curve", size: muted ? 0.34 : 0.58, color: withAlpha(edgeCategoryColor("other"), muted ? 0.10 : 0.24), curvature: curve };
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
  folder: { label: 'Folder', color: 'var(--omarchy-color2)' },
  code: { label: 'Code', color: 'var(--omarchy-color4)' },
  image: { label: 'Image', color: 'var(--omarchy-color6)' },
  text: { label: 'Text', color: 'var(--omarchy-fg)' },
  config: { label: 'Config', color: 'var(--omarchy-color3)' },
  web: { label: 'Web', color: 'var(--omarchy-color5)' },
  document: { label: 'Doc', color: 'var(--omarchy-color11)' },
  other: { label: 'Other', color: 'var(--omarchy-color7)' },
  cluster: { label: 'Cluster', color: 'var(--omarchy-accent)' },
};

const NODE_TYPE_FALLBACKS: Record<NodeType, string> = {
  folder: '#8bd17c',
  code: '#a78bfa',
  image: '#5eead4',
  text: '#e5e7eb',
  config: '#f6c177',
  web: '#f472b6',
  document: '#93c5fd',
  other: '#94a3b8',
  cluster: '#f5c542',
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
          const swatch = edgeCategoryColor(category);
          return (
            <button
              key={category}
              className={`legend-item legend-edge-item ${isVisible ? '' : 'hidden'}`}
              onClick={(e) => handleEdgeClick(category, e)}
              title={`${isVisible ? 'Hide' : 'Show'} ${config.description} (double-click to isolate/restore all edge types)`}
            >
              <i className="legend-edge-swatch" style={{ background: isVisible ? swatch : '#555' }} />
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
    const attrs = data as Record<string, unknown>;
    const isAggregate = Boolean(attrs.isCluster) || attrs.visualState === "proxy";
    if (nodeView !== "icons" && !isAggregate) {
      if (showNames) drawDiscNodeLabel(context, data, settings);
      return;
    }

    const glyph = String(attrs.glyphText ?? (isAggregate ? "⬡" : "·"));
    if (!glyph) return;
    const glyphColor = String(attrs.glyphColor ?? data.color ?? graphThemeColor("--omarchy-color7", "#a8bbc8"));
    const opacity = Number(attrs.glyphOpacity ?? 1);
    const glyphScale = Number(attrs.glyphScale ?? 1);
    // Glyph size scales linearly with zoom. data.size is the camera-adjusted
    // pixel size of the (invisible) sphere, which now equals the node's natural
    // radius so EdgeClampedProgram terminates edges at the icon perimeter.
    // Keep icons smaller than their invisible hit radius. The Vega radial layout
    // now provides more angular/radial room, and the glyph should sit inside
    // that room instead of becoming the collision footprint.
    // No minimum floor — let glyphs shrink naturally when zoomed out.
    // Skip rendering entirely when the glyph would be <6px (invisible squiggle).
    const rawFontSize = data.size * (isAggregate ? 1.28 : 1.42);
    if (rawFontSize < 6) {
      context.restore();
      return;
    }
    const fontSize = Math.min(96, rawFontSize) * glyphScale;

    context.save();
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;

    // Drop shadow via drawImage shadow (applies to the whole bitmap alpha)
    context.shadowColor = "rgba(0,0,0,0.55)";
    context.shadowBlur = isAggregate ? 2 : 3;
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
    // Higher threshold prevents radial leaves from turning into a text pile.
    if (!isAggregate && showNames && data.label && fontSize >= 28) {
      context.globalAlpha = Math.min(0.92, context.globalAlpha);
      context.fillStyle = graphThemeColor("--omarchy-fg", "#d4d4d4");
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
