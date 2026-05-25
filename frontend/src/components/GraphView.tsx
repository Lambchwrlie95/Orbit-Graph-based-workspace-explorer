import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, Copy, ExternalLink, FolderOpen, Maximize, Pause, PenLine, Pin, PinOff, Play, SquareTerminal, Target } from "lucide-react";
import { GraphEdge, GraphNode, GraphPayload } from "../types";
import { formatBytes } from "../utils";
import { usePersistedState } from "../hooks/usePersistedState";
import { iconRuleForPath } from "../lib/fileGlyphs";
import { tauriInvoke } from "../lib/tauriCommands";
import { computeEdgeRoute, type RoutingContext } from "../lib/edgeRouting";
import type { IconThemePayload } from "../types";
import {
  type NodeType, type VisualState, type EdgeCategory,
  type VisualGraphNode, type GraphDisplayNode,
  NODE_TYPE_CONFIG, NODE_TYPE_FALLBACKS, EDGE_CATEGORY_CONFIG,
  cssVar, graphThemeColor, withAlpha, adjustColorBrightness,
  themeIsLight, getNodeType, getNodeColor,
  clusterGlyphForNode, clusterGlyphForAttrs, edgeCategoryColor,
  edgeCategoryForType, escapeHtml, seededAngle, shortNodePath, graphEdgePairKey,
  nodeVisualState, visibleNodeLabel, getNodeSize, compareGraphChildren,
  hierarchy, fallbackNode, vegaRadialTidyLayout,
  orderedVegaChildren, vegaLeafSlots, subtreeMaxDepth, subtreeWeight,
  placeVegaRadialNode, relaxRadialVisualFootprints, visualFootprintRadius,
  orbitRadiusForDepth,
  VEGA_RADIAL_LEAF_GAP, VEGA_RADIAL_DEPTH_GAP, VEGA_RADIAL_ROOT_GAP_LEAVES,
  VEGA_RADIAL_MIN_RADIUS, VEGA_RADIAL_START_ANGLE,
  lastFamilyWedges,
  detectArchLayer,
} from "../lib/graphStyle";
import {
  type Graph3DNode, type Graph3DLink,
  buildGraph3DData, graph3dNodeLabel, graph3dNodeColor,
  graph3dNodeObject, graph3dLinkColor, graph3dLinkWidth,
  graph3dLinkDistance, graph3dLinkParticles, graph3dLinkParticleWidth,
  graph3dLinkParticleSpeed, graph3dAddSceneEffects, graph3dApplyWallpaper,
  createGraph3DCollisionForce, focusGraph3DNode, frameGraph3DScene,
  configureGraph3DControls, setGraph3DAutoRotate, installGraph3DAtmosphere,
  graph3dEdgeStyleForCategory, graph3dLayout, graph3dSphericalLayout, installOrientationCube,
  clearGraph3DNodeRegistry,
  type ForceGraph3DInstance,
  ForceGraph3D,
} from "./graph3d";

type NodeView = "spheres" | "icons";

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

const ALL_EDGE_CATEGORIES: EdgeCategory[] = ["hierarchy", "code", "docs", "symlink", "semantic", "tags", "other"];

const PREF = {
  layout: "orbit:graph:layoutMode",
  labels: "orbit:graph:showLabels:v4",
  files: "orbit:graph:showFiles:v2",
  folders: "orbit:graph:showFolders",
  dim: "orbit:graph:dimUnrelated",
  types: "orbit:graph:visibleTypes",
  nodeView: "orbit:graph:nodeView:v5",
  minimap: "orbit:graph:showMinimap",
  edges: "orbit:graph:visibleEdgeCategories:v2",
  localFocus: "orbit:graph:localFocus",
  localFocusDepth: "orbit:graph:localFocusDepth",
  spherical3d: "orbit:graph:spherical3d",
};

const VISUAL_FANOUT = {
  root: 20,
  folder: 10,
  deep: 6,
  // Per-folder limit applied to any folder the user has explicitly expanded
  // (its path appears in `expandedFolders`). Matches the backend's
  // EXPANDED_FOLDER_CHILD_LIMIT in src-tauri/src/graph.rs so the frontend cap
  // does not silently re-collapse what the backend just unhid.
  expanded: 200,
};

const GRAPH_LAYOUT_VERSION = "vega-radial-tidy-airy-v3";

const serializeTypeSet = (set: Set<NodeType>) => JSON.stringify(Array.from(set));
const deserializeTypeSet = (raw: string): Set<NodeType> => {
  try {
    const parsed = JSON.parse(raw) as NodeType[];
    const known = new Set<string>(ALL_NODE_TYPES);
    const values = Array.isArray(parsed) ? parsed.filter(t => known.has(t)) : ALL_NODE_TYPES;
    return new Set(values.length ? values : ALL_NODE_TYPES);
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


type LayoutMode = "constellation" | "tree" | "graph3d";


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
  wallpaper3d?: string | null;
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
  wallpaper3d,
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
  // Stable refs for callback props so the Sigma/3D effect doesn't rebuild the
  // entire renderer every time main.tsx re-renders (e.g., on setPreview call).
  // onFocusFolder is an inline arrow in main.tsx and changes on every render;
  // without refs, every file click causes renderer.kill() + full rebuild.
  const onSelectPathRef = useRef(onSelectPath);
  const onOpenPathRef = useRef(onOpenPath);
  const onFocusFolderRef = useRef(onFocusFolder);
  const onExpandClusterRef = useRef(onExpandCluster);
  onSelectPathRef.current = onSelectPath;
  onOpenPathRef.current = onOpenPath;
  onFocusFolderRef.current = onFocusFolder;
  onExpandClusterRef.current = onExpandCluster;
  const wallpaper3dRef = useRef<string | null>(null);
  wallpaper3dRef.current = wallpaper3d ?? null;
  const [pathfinderMode, setPathfinderMode] = useState(false);
  const [pathfinderFrom, setPathfinderFrom] = useState<string | null>(null);
  const [pathfinderNodeIds, setPathfinderNodeIds] = useState<Set<string>>(new Set());
  const [pathfinderEdgeIds, setPathfinderEdgeIds] = useState<Set<string>>(new Set());
  const pathfinderModeRef = useRef(false);
  const pathfinderFromRef = useRef<string | null>(null);
  const pathfinderNodeIdsRef = useRef<Set<string>>(new Set());
  const pathfinderEdgeIdsRef = useRef<Set<string>>(new Set());
  pathfinderModeRef.current = pathfinderMode;
  pathfinderFromRef.current = pathfinderFrom;
  pathfinderNodeIdsRef.current = pathfinderNodeIds;
  pathfinderEdgeIdsRef.current = pathfinderEdgeIds;
  const iconThemeRef = useRef<IconThemePayload | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const graph3dKeyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
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
  const [graph3dRunning, setGraph3dRunning] = useState(true);
  const [graph3dPinDrag, setGraph3dPinDrag] = usePersistedState<boolean>("orbit:graph:3dPinDrag", true);
  const [localFocusMode, setLocalFocusMode] = usePersistedState<boolean>(PREF.localFocus, false);
  const [localFocusDepth, setLocalFocusDepth] = usePersistedState<number>(PREF.localFocusDepth, 2);
  const [graph3dUseSpherical, setGraph3dUseSpherical] = usePersistedState<boolean>(PREF.spherical3d, false);
  const [visibleEdgeCategories, setVisibleEdgeCategories] = usePersistedState<Set<EdgeCategory>>(
    PREF.edges,
    new Set<EdgeCategory>(["hierarchy", "docs"]),
    { serialize: serializeEdgeCategorySet, deserialize: deserializeEdgeCategorySet },
  );
  const [iconTheme, setIconTheme] = useState<IconThemePayload | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
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
    const switch3d = () => setLayoutMode("graph3d");
    const frame3d = () => {
      const graph3d = graph3dRef.current;
      if (graph3d) frameGraph3DScene(graph3d, graph3dNodeRef.current, 320);
    };
    const fitGraphEvent = () => {
      const graph3d = graph3dRef.current;
      if (graph3d) {
        frameGraph3DScene(graph3d, graph3dNodeRef.current, 320);
        return;
      }
      const renderer = rendererRef.current;
      if (!renderer) return;
      const camera = renderer.getCamera();
      void camera.animatedReset({ duration: 320, easing: "quadraticInOut" }).then(() => {
        camera.setState({ x: 0.5, y: 0.5, ratio: camera.getBoundedRatio(1), angle: 0 });
        renderer.scheduleRefresh();
      });
    };
    const toggle3dSimulation = () => {
      const graph = graph3dRef.current;
      if (!graph) {
        setLayoutMode("graph3d");
        return;
      }
      const api = graph as unknown as {
        pauseAnimation?: () => void;
        resumeAnimation?: () => void;
        d3ReheatSimulation?: () => void;
      };
      setGraph3dRunning((running) => {
        if (running) {
          api.pauseAnimation?.();
          return false;
        }
        api.d3ReheatSimulation?.();
        api.resumeAnimation?.();
        return true;
      });
    };
    const toggle3dPinning = () => setGraph3dPinDrag((value) => !value);
    const release3dPins = () => {
      let released = false;
      for (const node of graph3dNodeRef.current.values()) {
        if (node.fx !== undefined || node.fy !== undefined || node.fz !== undefined) released = true;
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      }
      const api = graph3dRef.current as unknown as { d3ReheatSimulation?: () => void } | null;
      api?.d3ReheatSimulation?.();
      if (released) setGraph3dRunning(true);
    };
    document.addEventListener("orbit:graph:toggle-labels", toggleLabels);
    document.addEventListener("orbit:graph:toggle-icons", toggleIcons);
    document.addEventListener("orbit:graph:switch-3d", switch3d);
    document.addEventListener("orbit:graph:fit", fitGraphEvent);
    document.addEventListener("orbit:graph:3d:refit", frame3d);
    document.addEventListener("orbit:graph:3d:pause-toggle", toggle3dSimulation);
    document.addEventListener("orbit:graph:3d:pin-toggle", toggle3dPinning);
    document.addEventListener("orbit:graph:3d:release-pins", release3dPins);
    return () => {
      document.removeEventListener("orbit:graph:toggle-labels", toggleLabels);
      document.removeEventListener("orbit:graph:toggle-icons", toggleIcons);
      document.removeEventListener("orbit:graph:switch-3d", switch3d);
      document.removeEventListener("orbit:graph:fit", fitGraphEvent);
      document.removeEventListener("orbit:graph:3d:refit", frame3d);
      document.removeEventListener("orbit:graph:3d:pause-toggle", toggle3dSimulation);
      document.removeEventListener("orbit:graph:3d:pin-toggle", toggle3dPinning);
      document.removeEventListener("orbit:graph:3d:release-pins", release3dPins);
    };
  }, [setGraph3dPinDrag, setLayoutMode, setNodeView, setShowLabels]);

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
      // Force a full Sigma rebuild so edge colors are recomputed with fresh CSS vars.
      setThemeVersion(v => v + 1);
      const api3d = graph3dRef.current;
      if (api3d) {
        graph3dApplyWallpaper(api3d, wallpaper3dRef.current, graphThemeColor("--orbit-graph-canvas", "#101010"));
        api3d.nodeColor(api3d.nodeColor());
        api3d.linkColor(api3d.linkColor());
        // Theme changes are rare (user action), so it's safe to rebuild THREE
        // sprite materials here. On hot paths (hover/click) this must be skipped.
        api3d.nodeThreeObject(api3d.nodeThreeObject());
      }
    };
    window.addEventListener("orbit:flavor-changed", handler);
    window.addEventListener("orbit:omarchy-theme-changed", handler);
    return () => {
      window.removeEventListener("orbit:flavor-changed", handler);
      window.removeEventListener("orbit:omarchy-theme-changed", handler);
    };
  }, []);

  useEffect(() => {
    const api = graph3dRef.current;
    if (!api || layoutMode !== "graph3d") return;
    graph3dApplyWallpaper(api, wallpaper3dRef.current, graphThemeColor("--orbit-graph-canvas", "#101010"));
  }, [wallpaper3d, layoutMode]);

  useEffect(() => {
    if (layoutMode === "graph3d") return;
    rendererRef.current?.scheduleRefresh();
  }, [pathfinderNodeIds, pathfinderEdgeIds, layoutMode]);

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
    const handleOutside = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".graph-context-menu")) return;
      close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("click", handleOutside);
      document.addEventListener("contextmenu", handleOutside);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", handleOutside);
      document.removeEventListener("contextmenu", handleOutside);
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

  const togglePathfinder = useCallback(() => {
    setPathfinderMode(prev => {
      if (prev) {
        setPathfinderFrom(null);
        setPathfinderNodeIds(new Set());
        setPathfinderEdgeIds(new Set());
      }
      return !prev;
    });
  }, []);

  const displayPayload = useMemo(() => {
    if (!payload) return null;
    const query = graphFilter.trim().toLowerCase();
    const directNodes = payload.nodes.filter((node) => {
      if (!showFolders && node.isDir) return false;
      if (!showFiles && !node.isDir) return false;
      const nodeType = getNodeType(node);
      if (!visibleTypes.has(nodeType)) return false;
      if (!query) return true;
      return node.label.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
    });

    // When the user filters to a subset of types, pull in ancestor folder nodes
    // as ghost context so the layout has a skeleton and nodes aren't a ring.
    let nodes: VisualGraphNode[] = directNodes;
    const isTypeFiltered = visibleTypes.size < ALL_NODE_TYPES.length || !!query;
    if (isTypeFiltered) {
      const directIds = new Set(directNodes.map(n => n.id));
      const parentOf = new Map<number, number>();
      for (const edge of payload.edges) {
        if (edge.edgeType === "contains") parentOf.set(edge.targetId, edge.sourceId);
      }
      const contextIds = new Set<number>();
      for (const node of directNodes) {
        let cursor = parentOf.get(node.id);
        while (cursor !== undefined && !contextIds.has(cursor) && !directIds.has(cursor)) {
          contextIds.add(cursor);
          cursor = parentOf.get(cursor);
        }
      }
      const contextNodes: VisualGraphNode[] = payload.nodes
        .filter(n => contextIds.has(n.id))
        .map(n => ({ ...n, visualState: "ghost" as VisualState }));
      nodes = [...directNodes, ...contextNodes];
    }

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
    // Local focus: k-hop neighborhood around the selected node
    if (localFocusMode && selectedPath) {
      const selectedId = allNodes.find((n) => n.path === selectedPath)?.id ?? null;
      if (selectedId !== null) {
        const neighborhood = computeKHopNeighbors(selectedId, localFocusDepth, edges);
        return {
          ...payload,
          nodes: allNodes.filter((n) => neighborhood.has(n.id)),
          edges: edges.filter((e) => neighborhood.has(e.sourceId) && neighborhood.has(e.targetId)),
        };
      }
    }
    return { ...payload, nodes: allNodes, edges };
  }, [payload, graphFilter, showFiles, showFolders, visibleTypes, visibleEdgeCategories, breadcrumbNodes, layoutMode, expandedFolders, localFocusMode, localFocusDepth, selectedPath]);

  const displayNodes = useMemo(() => {
    if (!displayPayload) return [];
    return layoutNodes(displayPayload.nodes, displayPayload.edges, layoutMode, graph3dUseSpherical && layoutMode === "graph3d");
  }, [displayPayload, layoutMode, graph3dUseSpherical]);

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
    const capped = displayNodes.length > 400 ? prioritizeFor3D(displayNodes, 400) : displayNodes;
    return buildGraph3DData(capped, displayPayload.edges, groupColors, iconTheme);
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
      const renderer = rendererRef.current;
      renderer?.scheduleRefresh();
      // Selection came from outside the graph (sidebar / search). Fly the camera
      // to the node so the highlight is always visible to the user.
      if (key && layoutMode === "graph3d") {
        const node3d = graph3dNodeRef.current.get(key);
        if (graph3dRef.current && node3d) focusGraph3DNode(graph3dRef.current, node3d, 600);
      } else if (renderer && key) {
        requestAnimationFrame(() => {
          const display = renderer.getNodeDisplayData(key);
          if (display) {
            renderer.getCamera().animate(
              { x: display.x, y: display.y, ratio: 0.45 },
              { duration: 320 },
            );
          }
        });
      }
    }
  }, [selectedPath, nodeByPath, layoutMode]);

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
        // Trackball, not orbit: OrbitControls pins the camera's up-axis to Y
        // and refuses to tumble past the poles, which feels like a rotation
        // lock. TrackballControls gives free roll/pitch/yaw — the natural
        // expectation for a 3D galaxy view.
        controlType: "trackball",
        rendererConfig: { antialias: true, alpha: false },
      });
      // Call graphData() first so state.layout is initialised before any
      // subsequent setter or rAF tick can access it. Some setters (e.g.
      // nodeThreeObject) internally restart the animation loop; if that fires
      // before graphData() has run, tickFrame throws on state.layout being
      // undefined. Supplying data up-front is the safest guard.
      (graphApi as unknown as { pauseAnimation?: () => void }).pauseAnimation?.();
      graphApi.graphData(graph3dData);

      graphApi
        .backgroundColor(graphThemeColor("--orbit-graph-canvas", "#101010"))
        .showNavInfo(false)
        .width(container.clientWidth || 800)
        .height(container.clientHeight || 600)
        .nodeLabel((node) => showLabels ? graph3dNodeLabel(node) : "")
        .nodeRelSize(nodeView === "icons" ? 2.1 : 2.4)
        .nodeVal((node) => node.val)
        .nodeColor((node) => graph3dNodeColor(node, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, graph3dData.links))
        .nodeThreeObject((node: Graph3DNode) => graph3dNodeObject(node, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, graph3dData.links, showLabels))
        .nodeOpacity(1)
        .nodeResolution(nodeView === "icons" ? 12 : 16)
        .linkColor((link) => graph3dLinkColor(link, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated))
        .linkOpacity(0.52)
        .linkWidth((link) => graph3dLinkWidth(link, hoveredNodeRef.current, selectedNodeRef.current))
        .linkCurvature((link) => link.curvature)
        .linkDirectionalParticles((link) => graph3dLinkParticles(link, hoveredNodeRef.current, selectedNodeRef.current))
        .linkDirectionalParticleColor((link) => graph3dLinkColor(link, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated))
        .linkDirectionalParticleWidth((link) => graph3dLinkParticleWidth(link, hoveredNodeRef.current, selectedNodeRef.current))
        .linkDirectionalParticleSpeed((link) => graph3dLinkParticleSpeed(link))
        .enableNodeDrag(true)
        .enableNavigationControls(true)
        .d3AlphaDecay(0.05)
        .d3VelocityDecay(0.78)
        .cooldownTicks(80)
        .onEngineStop(() => {
          // Just flag the simulation as stopped. Do NOT reframe the camera
          // here — the engine cools down after every drag, hover, or particle
          // settle, and re-snapping the camera each time prevents the user
          // from zooming/panning to a node. Initial framing is handled at
          // mount; manual reframe is on the Fit button.
          setGraph3dRunning(false);
        })
        .onNodeHover((node) => {
          const id = node?.id ?? null;
          if (hoveredNodeRef.current === id) return;
          hoveredNodeRef.current = id;
          setHoveredNode((prev) => prev === id ? prev : id);
          setGraph3DAutoRotate(graphApi, false);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.linkColor(graphApi.linkColor());
          graphApi.linkDirectionalParticles(graphApi.linkDirectionalParticles());
        })
        .onLinkHover((link) => {
          // Treat the link's source as the hovered node so both endpoints and
          // the link itself get the active highlight treatment.
          const src = link?.source;
          const id = src ? (typeof src === "object" ? (src as Graph3DNode).id : String(src)) : null;
          if (hoveredNodeRef.current === id) return;
          hoveredNodeRef.current = id;
          setHoveredNode((prev) => prev === id ? prev : id);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.linkColor(graphApi.linkColor());
          graphApi.linkDirectionalParticles(graphApi.linkDirectionalParticles());
        })
        .onBackgroundClick(() => {
          hoveredNodeRef.current = null;
          setHoveredNode(null);
          selectedNodeRef.current = null;
          setSelectedNode((prev) => (prev === null ? prev : null));
          setGraph3DAutoRotate(graphApi, false);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.linkColor(graphApi.linkColor());
        })
        .onNodeClick((node, event) => {
          selectedNodeRef.current = node.id;
          setSelectedNode((prev) => prev === node.id ? prev : node.id);
          if (node.path) onSelectPathRef.current(node.path);
          setGraph3DAutoRotate(graphApi, false);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.linkColor(graphApi.linkColor());
          if (node.isCluster) {
            const folderPath = node.parentPath || node.path.replace("/__cluster__", "").replace(/\/__visual_[^/]+$/, "");
            setExpandingCluster(folderPath);
            onExpandClusterRef.current?.(folderPath);
            setTimeout(() => setExpandingCluster(null), 550);
          } else if (event.detail > 1) {
            if (node.isDir) {
              onFocusFolderRef.current?.(node.path);
            } else {
              // Double-click non-dir: open externally (images, videos, etc.)
              onOpenPathRef.current?.(node.path);
            }
          } else {
            // Single click: select node (folder or file)
            onSelectPathRef.current(node.path);
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
          if (graph3dPinDrag) {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
          } else {
            node.fx = undefined;
            node.fy = undefined;
            node.fz = undefined;
          }
        });

      const api = graphApi as unknown as { d3Force?: (name: string, force?: unknown) => any; d3ReheatSimulation?: () => void };
      const nodesById = new Map(graph3dData.nodes.map((node) => [node.id, node]));
      api.d3Force?.("link")?.distance?.((link: Graph3DLink) => graph3dLinkDistance(link, nodesById));
      api.d3Force?.("charge")?.strength?.((node: Graph3DNode) => node.isDir ? -160 : node.isCluster ? -90 : -42);
      const collide = api.d3Force?.("collide");
      collide?.radius?.((node: Graph3DNode) => Math.max(node.isDir ? 18 : node.isCluster ? 13 : 8, Math.sqrt(Math.max(1, node.val)) * (node.isDir ? 4.4 : 3.0)));
      api.d3Force?.("orbitCollide", createGraph3DCollisionForce());
      // d3ReheatSimulation calls resetCountdown() which sets engineRunning=true
      // before the 1ms kapsule debounce has initialised state.layout. Calling
      // resumeAnimation() immediately after would then trigger tickFrame →
      // layoutTick → state.layout[...] crash. Defer both until after the debounce.
      const reheatTimer = window.setTimeout(() => {
        if (!graph3dRef.current) return;
        api.d3ReheatSimulation?.();
        (graphApi as unknown as { resumeAnimation?: () => void }).resumeAnimation?.();
        setGraph3dRunning(true);
      }, 5);

      graph3dRef.current = graphApi;
      graph3dNodeRef.current = new Map(graph3dData.nodes.map((node) => [node.id, node]));
      const cleanupSceneEffects = graph3dAddSceneEffects(graphApi, container);
      const cleanupOrientationCube = installOrientationCube(graphApi, container);
      graph3dApplyWallpaper(graphApi, wallpaper3dRef.current, graphThemeColor("--orbit-graph-canvas", "#101010"));
      
      const onGraph3DKeyDown = (event: KeyboardEvent) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        const activeId = selectedNodeRef.current;
        const nodes = graph3dNodeRef.current;
        if (!nodes.size) return;
        const focusByPath = (path: string | undefined | null) => {
          if (!path) return false;
          for (const candidate of nodes.values()) {
            if (candidate.path === path) {
              selectedNodeRef.current = candidate.id;
              setSelectedNode((prev) => (prev === candidate.id ? prev : candidate.id));
              if (candidate.path) onSelectPathRef.current(candidate.path);
              setGraph3DAutoRotate(graphApi, false);
              focusGraph3DNode(graphApi, candidate, 600);
              graphApi.nodeColor(graphApi.nodeColor());
              graphApi.linkColor(graphApi.linkColor());
              return true;
            }
          }
          return false;
        };
        if (event.key === "Escape") {
          selectedNodeRef.current = null;
          setSelectedNode((prev) => (prev === null ? prev : null));
          hoveredNodeRef.current = null;
          setHoveredNode(null);
          setGraph3DAutoRotate(graphApi, false);
          graphApi.nodeColor(graphApi.nodeColor());
          graphApi.linkColor(graphApi.linkColor());
          event.preventDefault();
          return;
        }
        if (event.key === "f" || event.key === "F") {
          setLocalFocusMode((prev) => !prev);
          event.preventDefault();
          return;
        }
        if (!activeId) return;
        const current = nodes.get(activeId);
        if (!current) return;
        if (event.key === "ArrowUp") {
          if (focusByPath(current.parentPath)) event.preventDefault();
          return;
        }
        if (event.key === "ArrowDown") {
          const child = [...nodes.values()].find((n) => n.parentPath === current.path);
          if (child && focusByPath(child.path)) event.preventDefault();
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const siblings = [...nodes.values()].filter((n) => n.parentPath === current.parentPath);
          siblings.sort((a, b) => a.label.localeCompare(b.label));
          if (siblings.length < 2) return;
          const idx = siblings.findIndex((n) => n.id === current.id);
          const next = siblings[(idx + (event.key === "ArrowRight" ? 1 : siblings.length - 1)) % siblings.length];
          if (focusByPath(next.path)) event.preventDefault();
        }
      };
      window.addEventListener("keydown", onGraph3DKeyDown);
      graph3dKeyHandlerRef.current = onGraph3DKeyDown;
      
      configureGraph3DControls(graphApi);
      setZoomLevel(1);
      frameGraph3DScene(graphApi, graph3dNodeRef.current, 0);
      installGraph3DAtmosphere(graphApi, graphThemeColor("--orbit-graph-canvas", "#101010"));

      const resizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        graphApi.width(width).height(height);
      });
      resizeObserver.observe(container);

      // Single initial frame. Earlier passes stacked three reframes (rAF,
      // +260ms, +760ms) which fought TrackballControls if the user started
      // panning right away.
      requestAnimationFrame(() => frameGraph3DScene(graphApi, graph3dNodeRef.current, 0));

      return () => {
        window.clearTimeout(reheatTimer);
        cleanupSceneEffects();
        cleanupOrientationCube();
        clearGraph3DNodeRegistry();
        if (graph3dKeyHandlerRef.current) {
          window.removeEventListener("keydown", graph3dKeyHandlerRef.current);
          graph3dKeyHandlerRef.current = null;
        }
        resizeObserver.disconnect();
        // Cancel any queued rAF tick before destruction so a stale tickFrame
        // cannot fire after state.layout has been cleaned up by _destructor().
        (graphApi as unknown as { pauseAnimation?: () => void }).pauseAnimation?.();
        graphApi._destructor();
        graph3dRef.current = null;
        graph3dNodeRef.current = new Map();
      };
    }

    const graph = new Graph();
    graphRef.current = graph;

    const totalVisible = displayNodes.length;
    // layoutScale mirrors the value computed inside vegaRadialTidyLayout for the
    // same node count. densityScale is its reciprocal so that the two effects
    // cancel: a 0.62× smaller bounding box → Sigma auto-fits at ~1/0.62 larger
    // ratio → icons appear ~1/0.62 smaller. Multiplying baseSize by 1/0.62
    // restores the expected screen size while still applying an aesthetic bonus
    // for sparse graphs (the 0.9 factor keeps icons slightly larger than baseline).
    const layoutScale = totalVisible < 15 ? 0.30 : totalVisible < 35 ? 0.45 : totalVisible < 120 ? 0.62 : totalVisible < 300 ? 0.78 : 1.0;
    const densityScale = Math.max(1.5, 0.9 / layoutScale);
    const isLightGraph = themeIsLight();

    for (const node of displayNodes) {
      // Depth-relative boost: nodes near the scope root are visually dominant;
      // deep leaves are smaller, giving natural hierarchy at every zoom level.
      // In tree mode the horizontal column already encodes depth, so size
      // variation by depth is redundant — it just makes deep nodes look
      // anaemic. Disable depthBoost in tree mode so every column reads at
      // the same visual weight.
      const depthBoost = layoutMode === "tree"
        ? 1.0
        : node.depth <= 0 ? 1.35 : node.depth === 1 ? 1.12 : node.depth === 2 ? 1.0 : Math.max(0.80, 1.0 - (node.depth - 2) * 0.06);
      const baseSize = getNodeSize(node) * (node.projectionScale ?? 1) * densityScale * depthBoost;
      const startPosition = transitionStartPosition(node, previousNodePositionsRef.current, transitionAnchorRef.current);
      const visualState = node.visualState ?? nodeVisualState(node);
      // Resolve glyph + color ONCE per node (path-derived; never changes).
      // The overlay reads these attrs directly so it never re-runs the
      // glob/map pipeline per frame.
      const icon = iconRuleForPath(node.path, node.isDir, node.isCluster, iconThemeRef.current);
      const baseColor = getNodeColor(node);
      // Top-level folders adopt their family color so each root subtree is
      // visually distinct. Deeper dirs blend toward the base folder color.
      const familyColor = groupColors.get(node.id);
      // Light themes: darken the sphere so it contrasts with the bright bg.
      // Dark themes: use the family color directly — darkening makes it black.
      const folderSphereColor = node.isDir && !node.isCluster && familyColor
        ? (isLightGraph ? adjustColorBrightness(familyColor, 0.52) : familyColor)
        : null;
      const sphereAlpha = visualState === "ghost" ? 0.35 : (isLightGraph ? 0.90 : 0.82);
      const nodeColor = folderSphereColor
        ? withAlpha(folderSphereColor, sphereAlpha)
        : baseColor;
      const folderGlyphColor = node.isDir && !node.isCluster
        ? withAlpha(familyColor ?? baseColor, 0.96)
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
        color: nodeColor,
        baseColor: nodeColor,
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
        forceLabel: (node.isDir && !node.isCluster) || (nodeView === "icons" && !node.isCluster && nodeVisualState(node) !== "proxy") || (visibleTypes.size < ALL_NODE_TYPES.length && showLabels && !node.isCluster && nodeVisualState(node) !== "proxy") || (showLabels && !node.isCluster && nodeVisualState(node) !== "ghost" && nodeVisualState(node) !== "proxy"),
        baseZIndex: Math.round(((node.z3d ?? 0) + 2000) * 10),
      });
    }

    const routingParentOf = new Map<number, number>();
    const routingPositionOf = new Map<number, { x: number; y: number }>();
    for (const edge of displayPayload.edges) {
      if (edge.edgeType === "contains") routingParentOf.set(edge.targetId, edge.sourceId);
    }
    for (const node of displayNodes) {
      routingPositionOf.set(node.id, { x: node.x, y: node.y });
    }
    const routingCtx: RoutingContext = { strategy: "lca-biased", parentOf: routingParentOf, positionOf: routingPositionOf };

    const addedPairs = new Set<string>();
    for (const edge of displayPayload.edges) {
      const source = String(edge.sourceId);
      const target = String(edge.targetId);
      const pairKey = graphEdgePairKey(source, target);
      if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
      if (addedPairs.has(pairKey) || graph.hasEdge(source, target)) continue;
      if (graph.hasEdge(String(edge.id))) continue;
      const edgeVisualState = edgeVisualStateForGraph(graph, source, target);
      const edgeStyle = edgeStyleForGraph(edge, groupColors, edgeVisualState, routingCtx, layoutMode);
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
        zIndex: edgeStyle.zIndex,
      });
      addedPairs.add(pairKey);
    }

    const circleProgram = createNodeCompoundProgram(
      [NodeCircleProgram],
      makeNodeLabelRenderer(nodeView, showLabels),
      () => undefined,
    );

    const renderer = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderLabels: nodeView === "icons" ? true : showLabels,
      renderEdgeLabels: false,
      nodeProgramClasses: {
        circle: circleProgram,
      },
      nodeHoverProgramClasses: {
        circle: circleProgram,
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
      labelSize: 15,
      labelWeight: "600",
      labelDensity: 0.64,
      labelGridCellSize: 80,
      // Only render Sigma's own text labels when a node is ≥3px on screen.
      // Icons mode bypasses this entirely (forceLabel handles glyphs),
      // but in spheres mode this prevents the text storm at zoom-out.
      labelRenderedSizeThreshold: 3,
      defaultNodeColor: graphThemeColor("--omarchy-color7", "#94a3b8"),
      defaultEdgeColor: withAlpha(graphThemeColor("--omarchy-fg", "#94a3b8"), 0.28),
      zIndex: true,
      minCameraRatio: 0.03,
      maxCameraRatio: 8,
      // Linear ratio: node display size = graphSize / ratio. This keeps nodes
      // proportional to their screen spacing regardless of zoom level — they
      // neither "float" too large when zoomed out nor disappear when zoomed in.
      zoomToSizeRatioFunction: (ratio: number) => Math.max(ratio, 0.001),
      nodeReducer: (node, data) => reduceNode(node, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, navHistoryRef.current, breadcrumbNodesRef.current, nodeView, cameraRatioRef, pathfinderNodeIdsRef.current, pathfinderFromRef.current),
      edgeReducer: (edge, data) => reduceEdge(edge, data, graph, hoveredNodeRef.current, selectedNodeRef.current, dimUnrelated, cameraRatioRef, pathfinderEdgeIdsRef.current),
    });

    renderer.on("clickNode", ({ node }) => {
      if (pathfinderModeRef.current) {
        const g = graphRef.current!;
        const from = pathfinderFromRef.current;
        if (!from || from === node) {
          const nodeSet = new Set([node]);
          pathfinderFromRef.current = node;
          pathfinderNodeIdsRef.current = nodeSet;
          pathfinderEdgeIdsRef.current = new Set();
          setPathfinderFrom(node);
          setPathfinderNodeIds(nodeSet);
          setPathfinderEdgeIds(new Set());
        } else {
          const bfsResult = findShortestPath(g, from, node);
          const nodeSet = new Set(bfsResult ?? [from, node]);
          const edgeSet = new Set<string>();
          if (bfsResult && bfsResult.length > 1) {
            for (let i = 0; i < bfsResult.length - 1; i++) {
              [...g.edges(bfsResult[i], bfsResult[i + 1]), ...g.edges(bfsResult[i + 1], bfsResult[i])].forEach(e => edgeSet.add(e));
            }
          }
          pathfinderNodeIdsRef.current = nodeSet;
          pathfinderEdgeIdsRef.current = edgeSet;
          setPathfinderNodeIds(nodeSet);
          setPathfinderEdgeIds(edgeSet);
          pathfinderFromRef.current = node;
          setPathfinderFrom(node);
        }
        const nodePath = g.getNodeAttribute(node, "path") as string;
        selectedNodeRef.current = node;
        setSelectedNode(prev => prev === node ? prev : node);
        renderer.scheduleRefresh();
        if (nodePath) onSelectPathRef.current(nodePath);
        return;
      }
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
        onExpandClusterRef.current?.(folderPath);
        setTimeout(() => setExpandingCluster(null), 550);
        return;
      }
      // Single click: select node (folder or file) — preview in inspector
      onSelectPathRef.current(path);
    });

    renderer.on("doubleClickNode", ({ node }) => {
      const path = graph.getNodeAttribute(node, "path") as string;
      const isDir = graph.getNodeAttribute(node, "isDir") as boolean;
      if (!path) return;
      if (isDir) {
        // Double-click folder to navigate into its graph
        const display = renderer.getNodeDisplayData(node);
        const x = Number(graph.getNodeAttribute(node, "x"));
        const y = Number(graph.getNodeAttribute(node, "y"));
        transitionAnchorRef.current = { path, x, y };
        if (display) {
          renderer.getCamera().animate({ x: display.x, y: display.y, ratio: 0.32 }, { duration: 180, easing: "quadraticOut" });
          window.setTimeout(() => onFocusFolderRef.current?.(path), 110);
        } else {
          onFocusFolderRef.current?.(path);
        }
      } else {
        // Double-click file: open externally (OS default viewer)
        onOpenPathRef.current?.(path);
      }
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

    // Container can be 0-width at mount time (parent panel still measuring).
    // Sigma was initialised with allowInvalidContainer:true to survive that,
    // but it now needs to be told to recompute when the real size arrives.
    const sigmaResizeObserver = new ResizeObserver(() => {
      try {
        renderer.refresh();
        renderer.scheduleRefresh();
      } catch {
        // Renderer may already be killed during teardown — ignore.
      }
    });
    sigmaResizeObserver.observe(containerRef.current);

    // ─── Keyboard navigation ─────────────────────────────────────────────────
    // ArrowLeft/Right: cycle through visible siblings (same parentPath), sorted
    // alphabetically — same model as standard file explorers.
    const onSigmaKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape" && pathfinderModeRef.current) {
        setPathfinderMode(false);
        setPathfinderFrom(null);
        setPathfinderNodeIds(new Set());
        setPathfinderEdgeIds(new Set());
        rendererRef.current?.scheduleRefresh();
      }
      const activeKey = selectedNodeRef.current;
      if (!activeKey) return;
      if (event.key === " ") {
        event.preventDefault();
        const path = graph.getNodeAttribute(activeKey, "path") as string | undefined;
        if (path) onOpenPathRef.current?.(path);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const parentPath = graph.getNodeAttribute(activeKey, "parentPath") as string | undefined;
      const siblings: Array<{ key: string; label: string }> = [];
      graph.forEachNode((key, attrs) => {
        if ((attrs.parentPath as string | undefined) === parentPath && attrs.path) {
          siblings.push({ key, label: String(attrs.fullLabel ?? attrs.label ?? "") });
        }
      });
      siblings.sort((a, b) => a.label.localeCompare(b.label));
      if (siblings.length < 2) return;
      const idx = siblings.findIndex(s => s.key === activeKey);
      if (idx < 0) return;
      const delta = event.key === "ArrowRight" ? 1 : siblings.length - 1;
      const next = siblings[(idx + delta) % siblings.length];
      const nextPath = graph.getNodeAttribute(next.key, "path") as string;
      if (!nextPath) return;
      selectedNodeRef.current = next.key;
      setSelectedNode(next.key);
      onSelectPathRef.current(nextPath);
      renderer.scheduleRefresh();
      event.preventDefault();
    };
    document.addEventListener("keydown", onSigmaKeyDown);

    const container = containerRef.current;

    // ─── Rubber-band zoom ────────────────────────────────────────────────────
    // Plain left-click-drag on the empty canvas draws a selection rect.
    // On mouseup the camera zooms to frame the enclosed nodes (falling back to
    // raw graph-coord corners when no nodes fall inside the rect).
    // downStage only fires when no node/edge was hit, so this never conflicts
    // with clickNode / doubleClickNode.
    type RBState = {
      originVP: { x: number; y: number };
      savedCamera: { x: number; y: number; ratio: number; angle: number };
      overlay: HTMLDivElement | null;
      active: boolean;
    };
    let rubberBand: RBState | null = null;

    renderer.on("downStage", (payload) => {
      const orig = payload.event?.original as MouseEvent | undefined;
      if (!orig || orig.button !== 0 || !orig.ctrlKey || orig.metaKey || orig.shiftKey) return;
      const rect = container.getBoundingClientRect();
      rubberBand = {
        originVP: { x: orig.clientX - rect.left, y: orig.clientY - rect.top },
        savedCamera: renderer.getCamera().getState(),
        overlay: null,
        active: false,
      };
    });

    // Prevent Sigma's built-in pan during an active rubber-band drag.
    // mousemovebody fires before the pan-check in MouseCaptor.handleMove, so
    // calling preventSigmaDefault() here is enough to suppress the pan.
    const mouseCaptor = (renderer as any).mouseCaptor as {
      on: (event: string, handler: (c: { preventSigmaDefault: () => void }) => void) => void;
      off: (event: string, handler: (c: { preventSigmaDefault: () => void }) => void) => void;
    };
    const captorPreventPan = (coords: { preventSigmaDefault: () => void }) => {
      if (rubberBand?.active) coords.preventSigmaDefault();
    };
    mouseCaptor.on("mousemovebody", captorPreventPan);

    const handleRubberMove = (e: MouseEvent) => {
      if (!rubberBand) return;
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const dx = cx - rubberBand.originVP.x;
      const dy = cy - rubberBand.originVP.y;
      if (!rubberBand.active && Math.sqrt(dx * dx + dy * dy) < 5) return;
      if (!rubberBand.active) {
        rubberBand.active = true;
        const ov = document.createElement("div");
        ov.style.cssText =
          "position:absolute;pointer-events:none;box-sizing:border-box;" +
          "border:1px dashed rgba(77,163,255,0.65);" +
          "background:rgba(77,163,255,0.08);z-index:5;";
        container.appendChild(ov);
        rubberBand.overlay = ov;
      }
      if (rubberBand.overlay) {
        rubberBand.overlay.style.left   = `${Math.min(rubberBand.originVP.x, cx)}px`;
        rubberBand.overlay.style.top    = `${Math.min(rubberBand.originVP.y, cy)}px`;
        rubberBand.overlay.style.width  = `${Math.abs(dx)}px`;
        rubberBand.overlay.style.height = `${Math.abs(dy)}px`;
      }
    };

    const handleRubberUp = (e: MouseEvent) => {
      if (!rubberBand) return;
      const rb = rubberBand;
      rubberBand = null;
      rb.overlay?.remove();

      if (!rb.active) {
        // < 5 px movement → treat as background click (deselect)
        selectedNodeRef.current = null;
        setSelectedNode(null);
        renderer.scheduleRefresh();
        return;
      }

      const rect = container.getBoundingClientRect();
      const cx     = Math.max(0, Math.min(e.clientX - rect.left, container.clientWidth));
      const cy     = Math.max(0, Math.min(e.clientY - rect.top,  container.clientHeight));
      const vLeft   = Math.min(rb.originVP.x, cx);
      const vRight  = Math.max(rb.originVP.x, cx);
      const vTop    = Math.min(rb.originVP.y, cy);
      const vBottom = Math.max(rb.originVP.y, cy);
      const vpW = container.clientWidth;
      const vpH = container.clientHeight;

      // Restore camera to pre-drag state (in case Sigma managed a partial pan
      // before the first mousemove exceeded the 5 px threshold).
      const camera = renderer.getCamera();
      camera.setState(rb.savedCamera);

      // Convert rubber-band corners to graph coords for node hit-testing.
      const tl = renderer.viewportToGraph({ x: vLeft,  y: vTop });
      const br = renderer.viewportToGraph({ x: vRight, y: vBottom });
      const selMinX = Math.min(tl.x, br.x);
      const selMaxX = Math.max(tl.x, br.x);
      const selMinY = Math.min(tl.y, br.y);
      const selMaxY = Math.max(tl.y, br.y);

      let minGX = Infinity, maxGX = -Infinity, minGY = Infinity, maxGY = -Infinity;
      let found = false;
      graph.forEachNode((key) => {
        const display = renderer.getNodeDisplayData(key);
        if (!display || display.hidden) return;
        if (display.x >= selMinX && display.x <= selMaxX &&
            display.y >= selMinY && display.y <= selMaxY) {
          found = true;
          if (display.x < minGX) minGX = display.x;
          if (display.x > maxGX) maxGX = display.x;
          if (display.y < minGY) minGY = display.y;
          if (display.y > maxGY) maxGY = display.y;
        }
      });

      let centerX: number, centerY: number, newRatio: number;
      const savedRatio = rb.savedCamera.ratio;

      if (found) {
        centerX = (minGX + maxGX) / 2;
        centerY = (minGY + maxGY) / 2;
        // Map node bounding box back to viewport to compute required zoom.
        const bbTL = renderer.graphToViewport({ x: minGX, y: maxGY });
        const bbBR = renderer.graphToViewport({ x: maxGX, y: minGY });
        const scaleX = Math.max(Math.abs(bbBR.x - bbTL.x), 1) / vpW;
        const scaleY = Math.max(Math.abs(bbBR.y - bbTL.y), 1) / vpH;
        newRatio = savedRatio * Math.max(scaleX, scaleY) * 1.2;
      } else {
        const mid = renderer.viewportToGraph({ x: (vLeft + vRight) / 2, y: (vTop + vBottom) / 2 });
        centerX = mid.x;
        centerY = mid.y;
        const scaleX = Math.max(vRight - vLeft, 1) / vpW;
        const scaleY = Math.max(vBottom - vTop, 1) / vpH;
        newRatio = savedRatio * Math.max(scaleX, scaleY) * 1.2;
      }

      camera.animate(
        { x: centerX, y: centerY, ratio: Math.max(newRatio, 0.001) },
        { duration: 250, easing: "quadraticOut" },
      );
    };

    document.addEventListener("mousemove", handleRubberMove);
    document.addEventListener("mouseup", handleRubberUp);

    // ─── Pan edge-hiding ─────────────────────────────────────────────────────
    // Hides edges while the camera is panning to keep large graphs smooth.
    // startPan is skipped during rubber-band drags so the two interactions
    // don't fight over the edge-visibility state.
    let isPanning = false;
    let edgesHidden = false;
    const startPan = () => {
      if (rubberBand) return;
      if (isPanning) return;
      isPanning = true;
    };
    const endPan = () => {
      if (!isPanning) return;
      isPanning = false;
      if (edgesHidden) {
        edgesHidden = false;
        graph.forEachEdge(e => graph.removeEdgeAttribute(e, 'hidden'));
        renderer.scheduleRefresh();
      }
    };
    renderer.getCamera().on("updated", () => {
      if (!isPanning || edgesHidden) return;
      edgesHidden = true;
      graph.forEachEdge(e => graph.setEdgeAttribute(e, 'hidden', true));
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
      document.removeEventListener("keydown", onSigmaKeyDown);
      container?.removeEventListener("mousedown", startPan);
      document.removeEventListener("mouseup", endPan);
      document.removeEventListener("mousemove", handleRubberMove);
      document.removeEventListener("mouseup", handleRubberUp);
      mouseCaptor.off("mousemovebody", captorPreventPan);
      rubberBand?.overlay?.remove();
      rubberBand = null;
      if (cameraZoomTimeoutRef.current) {
        clearTimeout(cameraZoomTimeoutRef.current);
        cameraZoomTimeoutRef.current = null;
      }
      renderer.kill();
      sigmaResizeObserver.disconnect();
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [displayPayload, displayNodes, graph3dData, groupColors, showLabels, dimUnrelated, nodeView, layoutMode, graph3dPinDrag, themeVersion]);

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
      const graph3d = graph3dRef.current;
      if (graph3d) frameGraph3DScene(graph3d, graph3dNodeRef.current, 320);
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

  const toggleGraph3DSimulation = () => {
    const graph = graph3dRef.current;
    if (!graph) return;
    const api = graph as unknown as {
      pauseAnimation?: () => void;
      resumeAnimation?: () => void;
      d3ReheatSimulation?: () => void;
    };
    if (graph3dRunning) {
      api.pauseAnimation?.();
      setGraph3dRunning(false);
    } else {
      api.d3ReheatSimulation?.();
      api.resumeAnimation?.();
      setGraph3dRunning(true);
    }
  };

  const releaseGraph3DPins = () => {
    let released = false;
    for (const node of graph3dNodeRef.current.values()) {
      if (node.fx !== undefined || node.fy !== undefined || node.fz !== undefined) released = true;
      node.fx = undefined;
      node.fy = undefined;
      node.fz = undefined;
    }
    if (released) {
      const api = graph3dRef.current as unknown as { d3ReheatSimulation?: () => void } | null;
      api?.d3ReheatSimulation?.();
      setGraph3dRunning(true);
    }
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

  const breadcrumbSegments = ((): { id: string; label: string; path: string }[] => {
    if (layoutMode !== "graph3d" || !selectedNode) return [];
    const nodes = graph3dNodeRef.current;
    const start = nodes.get(selectedNode);
    if (!start) return [];
    const chain: { id: string; label: string; path: string }[] = [];
    let cursor: Graph3DNode | undefined = start;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      chain.unshift({ id: cursor.id, label: cursor.label, path: cursor.path });
      if (!cursor.parentPath) break;
      cursor = [...nodes.values()].find((n) => n.path === cursor!.parentPath);
    }
    if (chain.length <= 6) return chain;
    return [chain[0], { id: "ellipsis", label: "…", path: "" }, ...chain.slice(-4)];
  })();

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
          <button
            className={pathfinderMode ? "active" : ""}
            onClick={togglePathfinder}
            title="PathFinder: click two nodes to highlight the shortest path between them"
          >
            Path
          </button>
          <button
            className={localFocusMode ? "active" : ""}
            onClick={() => setLocalFocusMode((v) => !v)}
            title={localFocusMode ? "Disable local focus — show full graph" : "Local focus: show only the neighborhood around the selected node (press F)"}
          >
            Focus
          </button>
          {localFocusMode && (
            <select
              value={localFocusDepth}
              onChange={(e) => setLocalFocusDepth(Number(e.target.value))}
              title="Neighborhood depth (hops from selected node)"
              className="graph-switch-select"
            >
              <option value={1}>1-hop</option>
              <option value={2}>2-hop</option>
              <option value={3}>3-hop</option>
            </select>
          )}
          {layoutMode === "graph3d" && (
            <button
              className={graph3dUseSpherical ? "active" : ""}
              onClick={() => setGraph3dUseSpherical((v) => !v)}
              title={graph3dUseSpherical ? "Switch to flat 3D layout" : "Switch to spherical shell layout (concentric spheres by depth)"}
            >
              Sphere
            </button>
          )}
        </div>
      </div>

      <div className="graph-overlay graph-stats">
        <strong>
          {displayPayload ? `${displayNodes.length} visible / ${displayPayload.totalInScope} indexed` : "Graph"}
        </strong>
        <span>{graphStats.dirCount} folders</span>
        <span>{graphStats.fileCount} files</span>
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
        {layoutMode === "graph3d" && (
          <>
            <button
              type="button"
              className={`graph-icon-btn ${graph3dRunning ? "active" : ""}`}
              onClick={toggleGraph3DSimulation}
              title={graph3dRunning ? "Pause 3D simulation" : "Resume 3D simulation"}
            >
              {graph3dRunning ? <Pause size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              className={`graph-icon-btn ${graph3dPinDrag ? "active" : ""}`}
              onClick={() => setGraph3dPinDrag((value) => !value)}
              title={graph3dPinDrag ? "Drag pins 3D nodes" : "Drag releases 3D nodes"}
            >
              {graph3dPinDrag ? <Pin size={14} strokeWidth={1.8} /> : <PinOff size={14} strokeWidth={1.8} />}
            </button>
            <button type="button" className="graph-icon-btn" onClick={releaseGraph3DPins} title="Release all pinned 3D nodes">
              <PinOff size={14} strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>

{layoutMode === "graph3d" && breadcrumbSegments.length > 0 && (
      <div className="graph-breadcrumb">
        {breadcrumbSegments.map((seg, idx) => (
          <span key={seg.id} className="graph-breadcrumb-segment">
            {seg.path ? (
              <button
                type="button"
                className="graph-breadcrumb-link"
                onClick={() => {
                  const node = graph3dNodeRef.current.get(seg.id);
                  if (!node) return;
                  selectedNodeRef.current = node.id;
                  setSelectedNode(node.id);
                  if (node.path) onSelectPath(node.path);
                  const api = graph3dRef.current;
                  if (api) {
                    setGraph3DAutoRotate(api, false);
                    focusGraph3DNode(api, node, 600);
                    api.nodeColor(api.nodeColor());
                    // DO NOT call api.nodeThreeObject(api.nodeThreeObject()) —
                    // rebuilding every Three.js node on a hot interaction path
                    // produces a black canvas / GPU-context crash. The
                    // refreshed color/link calls below are enough to repaint.
                    api.linkColor(api.linkColor());
                  }
                }}
              >
                {seg.label}
              </button>
            ) : (
              <span className="graph-breadcrumb-ellipsis">{seg.label}</span>
            )}
            {idx < breadcrumbSegments.length - 1 && <span className="graph-breadcrumb-sep">›</span>}
          </span>
        ))}
      </div>
    )}
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

      <div className="graph-canvas">
        {pathfinderMode && layoutMode !== "graph3d" && (
          <div className="pathfinder-status">
            {!pathfinderFrom
              ? "PathFinder: click a source node"
              : pathfinderNodeIds.size <= 1
                ? `PathFinder: click target node  ·  from: ${String(graphRef.current?.getNodeAttribute(pathfinderFrom, "label") ?? pathfinderFrom)}`
                : `Path: ${pathfinderNodeIds.size} nodes  ·  click any node to start new path`}
          </div>
        )}
        {/*
          Sigma and ForceGraph3D mount their canvas children imperatively into
          this inner div. Keeping it free of any React children prevents the
          reconciler from racing with library DOM mutations — without this
          split, `NotFoundError: The object can not be found here.` fires
          whenever the overlay below toggles while a canvas is alive.
        */}
        <div className="graph-canvas-mount" ref={containerRef} style={{ position: "relative" }} />
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
  const archLayer = detectArchLayer(node.path ?? "");

  return (
    <div className="graph-context-menu file-context-menu" style={{ left, top }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <div className="ctx-title" title={node.path}>{title}</div>
      {archLayer && (
        <div className="ctx-layer-badge" style={{ color: archLayer.color }}>
          ⬡ {archLayer.label} layer
        </div>
      )}
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

function layoutNodes(nodes: VisualGraphNode[], edges: GraphEdge[], mode: LayoutMode, spherical3d?: boolean): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  if (mode === "tree") return treeLayout(nodes, edges);
  if (mode === "graph3d") return spherical3d ? graph3dSphericalLayout(nodes, edges) : graph3dLayout(nodes, edges);
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
  _anchor: { path: string; x: number; y: number } | null,
) {
  const direct = previous?.get(node.path);
  if (direct) return direct;
  // Old behaviour: jitter nodes around the clicked anchor — this stacked
  // everything in a 20px circle and caused persistent overlap during the
  // animation.  Skip it; nodes render instantly at their layout positions.
  return { x: node.x, y: node.y };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
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


function edgePriority(edge: GraphEdge) {
  if (edge.edgeType === "contains") return 3;
  if (edge.edgeType === "import") return 2;
  if (edge.edgeType === "markdown_link") return 2;
  return 1;
}

function computeKHopNeighbors(nodeId: number, k: number, edges: GraphEdge[]): Set<number> {
  const neighbors = new Set<number>([nodeId]);
  let frontier = new Set<number>([nodeId]);
  for (let hop = 0; hop < k; hop++) {
    const next = new Set<number>();
    for (const edge of edges) {
      if (frontier.has(edge.sourceId) && !neighbors.has(edge.targetId)) next.add(edge.targetId);
      if (frontier.has(edge.targetId) && !neighbors.has(edge.sourceId)) next.add(edge.sourceId);
    }
    if (!next.size) break;
    for (const id of next) neighbors.add(id);
    frontier = next;
  }
  return neighbors;
}

function prioritizeFor3D(nodes: GraphDisplayNode[], limit: number): GraphDisplayNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
    })
    .slice(0, limit);
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
  return vegaRadialTidyLayout(nodes, roots, tree, nodes.length);
}


function treeLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  // Top-down tidy tree: root at the top, depth grows downward, siblings spread
  // horizontally. Leaf slots are the x-axis and depth levels are the y-axis.
  // This avoids the "vertical line" problem of the old left-to-right layout,
  // where a shallow filesystem (many files, 1–2 depth levels) had a tiny x
  // range and a massive y range, collapsing everything into a single column.
  const LEAF_GAP = 300;
  const DEPTH_GAP = 380;
  const ROOT_GAP_LEAVES = 4;
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const orderedRoots = [...roots].sort((a, b) => compareGraphChildren(tree.byId.get(a), tree.byId.get(b)));
  const placed = new Map<number, GraphDisplayNode>();
  let leafCursor = 0;

  // Returns the leaf-slot x of the placed node so parents can average over children.
  const place = (id: number, depth: number): number => {
    const node = tree.byId.get(id);
    if (!node) return leafCursor * LEAF_GAP;
    const existing = placed.get(id);
    if (existing) return existing.x;
    const kids = orderedVegaChildren(id, tree);
    let x: number;
    if (!kids.length) {
      x = leafCursor * LEAF_GAP;
      leafCursor += Math.max(1, Math.min(4, vegaLeafSlots(id, tree) * 0.55));
    } else {
      const childXs: number[] = [];
      for (const child of kids) childXs.push(place(child, depth + 1));
      x = childXs.reduce((sum, cx) => sum + cx, 0) / childXs.length;
    }
    placed.set(id, {
      ...node,
      x,
      y: -(depth * DEPTH_GAP), // root at y=0, children below (y-up space)
      depth,
      childCount: kids.length,
      angle: 0,
      leftside: false,
    });
    return x;
  };

  orderedRoots.forEach((root, index) => {
    if (index > 0) leafCursor += ROOT_GAP_LEAVES;
    place(root, 0);
  });

  const placedList = [...placed.values()];
  const xs = placedList.map((n) => n.x);
  const ys = placedList.map((n) => n.y);
  const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;

  return nodes.map((node, index) => {
    const placedNode = placed.get(node.id);
    if (!placedNode) return fallbackNode(node, index, 0, 0);
    return { ...placedNode, x: placedNode.x - midX, y: placedNode.y - midY };
  });
}


function findShortestPath(graph: Graph, source: string, target: string): string[] | null {
  if (source === target) return [source];
  const visited = new Set<string>([source]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: source, path: [source] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    for (const neighbor of graph.neighbors(id)) {
      if (neighbor === target) return [...path, target];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }
  return null;
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
  cameraRatioRef?: { current: number },
  pathfinderNodes?: Set<string>,
  pathfinderFrom?: string | null,
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

  const isClusterNode = Boolean(data.isCluster) || visualState === "proxy";

  // In icons mode the visible glyph is rendered at a screen-pixel min floor
  // (9px files, 12px clusters), but the underlying sphere — which is what
  // Sigma uses for hit detection — was staying at the base graph size. That
  // mismatch made clicks land on a *neighboring* node whenever the user
  // clicked the icon's edge. Match the sphere's graph-space size to the
  // rendered icon so the hit zone tracks what the user sees.
  let effectiveBase = rawBase;
  const isDir = Boolean(data.isDir);
  // iconMinPx / iconMaxPx clamp the screen-pixel size in the label renderer.
  // We use natural Sigma scaling (closer = bigger, farther = smaller) and
  // just enforce a min/max range — that gives the user the spatial intuition
  // they expect while preventing icons from becoming microscopic at zoom-out
  // or massive at zoom-in. The window is also density-aware per node type.
  let iconMinPx = 0;
  let iconMaxPx = 0;
  if (iconsMode) {
    const N = Math.max(1, graph.order);
    // Density-aware center: dense graphs target a smaller working size so
    // dense subtrees breathe; sparse graphs allow bigger icons. iconMaxPx
    // tightened (max≈28 vs previous 36) so zoom-in doesn't blow icons up
    // beyond the visual footprint reserved by the relax pass.
    if (isClusterNode) {
      iconMinPx = Math.max(11, Math.min(17, Math.round(115 / Math.sqrt(N))));
      iconMaxPx = Math.max(18, Math.min(28, Math.round(180 / Math.sqrt(N))));
    } else if (isDir) {
      iconMinPx = Math.max(10, Math.min(15, Math.round(100 / Math.sqrt(N))));
      iconMaxPx = Math.max(16, Math.min(24, Math.round(155 / Math.sqrt(N))));
    } else {
      iconMinPx = Math.max(7, Math.min(11, Math.round(75 / Math.sqrt(N))));
      iconMaxPx = Math.max(13, Math.min(19, Math.round(125 / Math.sqrt(N))));
    }
    // Keep effectiveBase = rawBase so the sphere (hit detection + edge
    // termination) scales naturally with Sigma. The visible glyph is sized
    // from data.size in the label renderer with the min/max clamp applied.
  }

  // INVARIANT — do not regress: in icons mode, BOTH files/folders AND
  // proxy/cluster nodes render as icons only. The sphere is always invisible
  // (the HTML/glyph overlay carries cluster appearance via clusterGlyphForNode).
  // Past LLM passes have repeatedly re-introduced a colored sphere for clusters
  // under the wrong belief that clusters need a fallback shape — they do not.
  // Keep this condition as `iconsMode || isClusterNode`. Charlie has flagged
  // this regression more than once.
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
      // Keep a hit-able minimum of 6px so dimmed nodes remain hoverable.
      // At 2px the WebGL picker can't reliably capture the mouse.
      targetSize = Math.max(6, effectiveBase * 0.72);
    }
    if (iconsMode || isClusterNode) targetGlyphOpacity = isClusterNode ? 0.24 : 0.32;
    targetLabel = "";
    // zIndex 1 instead of 0 — keeps dimmed nodes above the floor so they
    // aren't buried under overlapping geometry and remain hittable.
    targetZIndex = 1;
  }

  // Style breadcrumb nodes (parent/back folders from nav history) — make
  // them large and accent-colored so they're easy to spot as navigation anchors.
  if (isBreadcrumb && !dimUnrelated) {
    if (!iconsMode) {
      targetColor = graphThemeColor("--omarchy-accent", "#6f9ad0");
      targetSize = effectiveBase * 1.9;
    } else {
      targetGlyphScale = 1.65;
    }
    targetLabel = fullLabel;
    targetZIndex = 15;
  }

  if (connectedToActive) {
    if (!iconsMode) {
      targetSize = effectiveBase * 1.08;
    } else {
      // Stronger connected-node indication — 1.18× glyph and a guaranteed
      // full-opacity override (in case dimUnrelated would have faded the
      // node). This makes "what's connected to what" tractable visually
      // without needing labels or arrows.
      targetGlyphScale = 1.18;
      targetGlyphOpacity = 1;
    }
    targetZIndex = 40;
  }

  // Hover/select scales — per node type. Each role has its own emphasis:
  // clusters need to "pop" without inflating to absurd sizes (they're already
  // big at rest); folders are hierarchy anchors that grow noticeably; files
  // grow the most because they start the smallest and need to surface.
  if (isHovered) {
    if (!iconsMode) {
      // White highlight (not yellow color3) — yellow collides with the amber
      // family/edge colors and made hovered nodes blend into the edges.
      // 1.25× scale is the previous 1.6 dialled down: hovered spheres were
      // visually overwhelming, especially for already-big root folders.
      targetColor = graphThemeColor("--omarchy-fg", "#ffffff");
      targetSize = Math.max(8, effectiveBase * 1.25);
    } else {
      targetGlyphScale = isClusterNode ? 1.28 : isDir ? 1.42 : 1.6;
    }
    targetLabel = fullLabel;
    targetZIndex = 90;
  }

  if (isSelected) {
    if (!iconsMode) {
      // Selected uses the accent (cyan/blue typically) — distinct from hover
      // (white) and from family edge colors. Slightly smaller scale than
      // before so it doesn't dominate the layout.
      targetColor = graphThemeColor("--omarchy-accent", "#6f9ad0");
      targetSize = Math.max(9, effectiveBase * 1.2);
    } else {
      targetGlyphScale = isClusterNode ? 1.38 : isDir ? 1.52 : 1.45;
    }
    targetLabel = fullLabel;
    targetZIndex = 100;
  }

  // Icons mode: keep the sphere at its natural radius (effectiveBase) so
  // EdgeClampedProgram terminates edges at the icon perimeter instead of the
  // node center. The sphere is invisible because targetColor is transparent;
  // glyphBaseSize drives the visible icon scale in the label renderer.

  // PathFinder overlay — highest priority, overrides all other visual state.
  if (pathfinderNodes && pathfinderNodes.size > 0) {
    const onPath = pathfinderNodes.has(node);
    const isFrom = node === pathfinderFrom;
    if (!onPath) {
      return {
        ...data,
        color: iconsMode ? "rgba(0,0,0,0)" : "rgba(40,50,60,0.18)",
        size: iconsMode ? effectiveBase : effectiveBase * 0.35,
        zIndex: 0,
        forceLabel: false,
        label: "",
        glyphOpacity: 0.1,
        glyphScale: 0.7,
        iconMinPx,
        iconMaxPx,
      };
    }
    const pathColor = isFrom ? "#f5c542" : "#fbbf24";
    return {
      ...data,
      color: iconsMode ? "rgba(0,0,0,0)" : pathColor,
      size: iconsMode ? effectiveBase : effectiveBase * (isFrom ? 2.0 : 1.6),
      zIndex: 100,
      forceLabel: true,
      label: fullLabel,
      glyphOpacity: 1,
      glyphScale: isFrom ? 1.7 : 1.35,
      iconMinPx,
      iconMaxPx,
    };
  }

  // Only return new object if something actually changed
  if (
    data.color === targetColor &&
    data.size === targetSize &&
    data.zIndex === targetZIndex &&
    data.label === targetLabel &&
    data.glyphOpacity === targetGlyphOpacity &&
    data.glyphScale === targetGlyphScale &&
    data.forceLabel === targetForceLabel &&
    (data.iconMinPx ?? 0) === iconMinPx &&
    (data.iconMaxPx ?? 0) === iconMaxPx
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
    iconMinPx,
    iconMaxPx,
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
  pathfinderEdges?: Set<string>,
) {
  // Zoom-invariant edge thickness: Sigma's scaleSize divides by sqrt(ratio),
  // so multiplying by sqrt(ratio) here cancels it out. baseSize then maps
  // directly to screen pixels at every zoom level. Previously this was
  // pow(ratio, 1.2) which gave net ratio^0.7 → edges shrank below 1px on
  // zoom-in, manifesting as "no edge colors".
  const ratio = Math.max(0.001, cameraRatioRef?.current ?? 1);
  const zoomScale = Math.sqrt(ratio);
  const baseSize = (data.baseSize ?? data.size ?? 1) as number;
  const baseColor = String(data.baseColor ?? data.color ?? "rgba(99,143,195,0.18)");
  const visualState = String(data.visualState ?? "primary");

  // PathFinder: path edges glow gold; everything else nearly invisible.
  if (pathfinderEdges && pathfinderEdges.size > 0) {
    if (pathfinderEdges.has(edge)) {
      return { ...data, hidden: false, color: "#f5c542", size: 3.2 * zoomScale, zIndex: 100 };
    }
    return { ...data, hidden: false, color: "rgba(40,50,60,0.08)", size: 0.4 * zoomScale, zIndex: 0 };
  }

  const active = hovered ?? selected;

  if (!active || !dimUnrelated) {
    const targetSize = baseSize * zoomScale;
    if (data.size === targetSize && data.color === baseColor && data.hidden !== true) return data;
    return { ...data, hidden: false, color: baseColor, size: targetSize };
  }

  const source = graph.source(edge);
  const target = graph.target(edge);
  const related = source === active || target === active;

  // Related edges: brighten to ~92% alpha while preserving family color.
  // Unrelated edges: keep family color but drop to 12% alpha — fade without
  // losing identity. Previously unrelated edges went to a hardcoded gray which
  // erased the family color entirely.
  const mutedUnrelated = visualState === "proxy" || visualState === "ghost";
  const targetColor = related
    ? brightenForActive(baseColor, mutedUnrelated ? 0.62 : 0.92)
    : recolorWithAlpha(baseColor, mutedUnrelated ? 0.06 : 0.12);
  const targetSize = related
    ? Math.max(baseSize * 1.9, 1.8) * zoomScale
    : Math.max(baseSize * 0.55, 0.3) * zoomScale;
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

// Replace the alpha of an existing rgba/rgb/hex color while preserving the hue.
// Falls back to the input if parse fails (avoids stomping unrecognized formats).
function recolorWithAlpha(color: string, alpha: number): string {
  const rgbaMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  return color;
}

function brightenForActive(color: string, alpha: number): string {
  // Pull color toward a saturated version of itself for the "active" highlight,
  // then apply the target alpha. Preserves family hue (vs. forcing a single
  // accent color across all edge types).
  return recolorWithAlpha(color, alpha);
}

function isConnected(graph: Graph, node: string, active: string) {
  if (node === active) return true;
  try {
    return graph.hasEdge(node, active) || graph.hasEdge(active, node);
  } catch {
    return false;
  }
}

// Normalize a hex color to neutral mid-tones using HSL:
// S clamped to 44–64% (not pastel, not neon), L clamped to 40–50%.
// Hue is preserved so each family color stays recognizably distinct.
function normalizeGroupColor(hex: string): string {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 || !/^[0-9a-f]+$/i.test(clean)) return hex;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (delta > 0.001) {
    s = delta / (l > 0.5 ? 2 - max - min : max + min);
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
  }
  const tS = Math.min(0.64, Math.max(0.44, s > 0.05 ? s : 0.52));
  const tL = Math.min(0.50, Math.max(0.40, l));
  const c = (1 - Math.abs(2 * tL - 1)) * tS;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = tL - c / 2;
  const sect = Math.floor(h * 6) % 6;
  const segs: [number, number, number][] = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];
  const [r2, g2, b2] = segs[sect];
  const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, (v + m) * 255))).toString(16).padStart(2, "0");
  return `#${hex2(r2)}${hex2(g2)}${hex2(b2)}`;
}


// Use --omarchy-color* tokens so family colors automatically adapt to the
// active theme (every theme defines its own palette for color2/4/5/6/…).
const GROUP_COLOR_TOKENS: Array<{ cssVar: string; fallback: string }> = [
  { cssVar: "--omarchy-color2",  fallback: "#73c991" }, // green
  { cssVar: "--omarchy-color4",  fallback: "#a78bfa" }, // purple / blue
  { cssVar: "--omarchy-color6",  fallback: "#38bdf8" }, // cyan
  { cssVar: "--omarchy-color3",  fallback: "#f5c542" }, // yellow
  { cssVar: "--omarchy-color10", fallback: "#4ade80" }, // bright green
  { cssVar: "--omarchy-color12", fallback: "#c084fc" }, // bright purple
  { cssVar: "--omarchy-color14", fallback: "#5eead4" }, // teal
  { cssVar: "--omarchy-color11", fallback: "#fbbf24" }, // amber
];

function groupColorAt(index: number): string {
  const token = GROUP_COLOR_TOKENS[index % GROUP_COLOR_TOKENS.length];
  const raw = graphThemeColor(token.cssVar, token.fallback);
  return normalizeGroupColor(raw); // adjust to neutral mid-tone; callers apply alpha
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
  if (roots.length === 1) {
    // Single workspace root: seed colors from its direct children so each
    // top-level folder (Projects, .config, Downloads, …) gets a distinct hue.
    const root = roots[0];
    colorMap.set(root, groupColorAt(0));
    const depth1 = tree.children.get(root) ?? [];
    const seeds = depth1.length > 1 ? depth1 : [root];
    seeds.forEach((id, i) => assign(id, groupColorAt(i)));
  } else {
    roots.forEach((rootId, i) => assign(rootId, groupColorAt(i)));
  }
  return colorMap;
}


type EdgeVisualStyle = {
  program: "line" | "curve";
  size: number;
  color: string;
  curvature: number;
  zIndex: number;
};

function edgeStyleForGraph(
  edge: GraphEdge,
  groupColors?: Map<number, string>,
  visualState: VisualState = "primary",
  routingCtx?: RoutingContext,
  layoutMode?: LayoutMode,
): EdgeVisualStyle {
  const edgeType = edge.edgeType;
  const muted = visualState === "proxy" || visualState === "ghost";
  // Tree mode reads better with near-straight edges (the orthogonal column
  // structure does the visual hierarchy work; curves just add noise). Atlas
  // and other layouts keep the full curvature for organic flow.
  const layoutCurveScale = layoutMode === "tree" ? 0.22 : 1.0;
  const rawCurve = routingCtx ? computeEdgeRoute(edge, routingCtx).curvature : edgeCurvatureForId(edge.id);
  const curve = rawCurve * layoutCurveScale;

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
  // Sizes here are SCREEN PIXELS — reduceEdge multiplies by sqrt(ratio) so
  // baseSize from edgeStyleForGraph maps directly to rendered pixel width.
  if (edgeType === "contains") {
    // Hierarchy edges use the family color, hue-matched to their subtree.
    // Previous alphas (0.38 dark / 0.62 light) were too pale on dark themes,
    // which is what made the graph look "edgeless".
    const familyBase = groupColors?.get(edge.sourceId) ?? edgeCategoryColor("hierarchy");
    const isLight = themeIsLight();
    const edgeColor = isLight ? adjustColorBrightness(familyBase, 0.45) : familyBase;
    const alpha = muted ? (isLight ? 0.42 : 0.32) : (isLight ? 0.78 : 0.62);
    return {
      program: "curve",
      size: muted ? 0.7 : 1.1,
      color: withAlpha(edgeColor, alpha),
      // Tree mode wants near-straight hierarchy edges so columns read clean.
      curvature: 0.22 * layoutCurveScale,
      zIndex: 8,
    };
  }

  // All non-hierarchy edges render behind hierarchy (zIndex < 8).
  if (edgeType === "import" || edgeType === "dependency" || edgeType === "code_ref") {
    return { program: "curve", size: muted ? 0.85 : 1.5, color: withAlpha(edgeCategoryColor("code"), muted ? 0.30 : 0.68), curvature: curve * 0.7, zIndex: 3 };
  }
  if (edgeType === "markdown_link" || edgeType === "wikilink" || edgeType === "link") {
    return { program: "curve", size: muted ? 0.78 : 1.3, color: withAlpha(edgeCategoryColor("docs"), muted ? 0.28 : 0.62), curvature: curve * 0.95, zIndex: 3 };
  }
  if (edgeType === "symlink") {
    return { program: "curve", size: muted ? 1.0 : 1.7, color: withAlpha(edgeCategoryColor("symlink"), muted ? 0.34 : 0.72), curvature: curve * 1.3, zIndex: 4 };
  }
  if (edgeType === "related" || edgeType === "similar" || edgeType === "similarity" || edgeType === "semantic") {
    return { program: "curve", size: muted ? 0.68 : 1.15, color: withAlpha(edgeCategoryColor("semantic"), muted ? 0.22 : 0.52), curvature: curve * 1.45, zIndex: 2 };
  }
  if (edgeType === "tag" || edgeType === "hashtag") {
    return { program: "curve", size: muted ? 0.68 : 1.15, color: withAlpha(edgeCategoryColor("tags"), muted ? 0.22 : 0.52), curvature: curve * 1.45, zIndex: 2 };
  }

  return { program: "curve", size: muted ? 0.62 : 1.0, color: withAlpha(edgeCategoryColor("other"), muted ? 0.18 : 0.42), curvature: curve, zIndex: 2 };
}


function edgeVisualStateForGraph(graph: Graph, source: string, target: string): VisualState {
  const sourceState = graph.getNodeAttribute(source, "visualState") as VisualState | undefined;
  const targetState = graph.getNodeAttribute(target, "visualState") as VisualState | undefined;
  if (sourceState === "proxy" || targetState === "proxy") return "proxy";
  if (sourceState === "ghost" || targetState === "ghost") return "ghost";
  if (sourceState === "context" || targetState === "context") return "context";
  return "primary";
}

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
    // Natural Sigma scaling (closer = bigger, farther = smaller). data.size
    // is the camera-adjusted screen pixel size, recomputed every frame.
    // Only the FLOOR is enforced — without a min, icons disappear at zoom-out;
    // with a ceiling, icons hit the cap quickly under the linear zoom function
    // configured on the renderer and then look "smaller" relative to the
    // expanding layout, which is exactly the bug Charlie keeps catching.
    const iconMinPx = Number(attrs.iconMinPx ?? 0);
    const sizeSource = iconMinPx > 0 ? Math.max(iconMinPx, data.size) : data.size;
    const rawFontSize = sizeSource * (isAggregate ? 1.28 : 1.6);
    const fontSize = Math.min(120, rawFontSize) * glyphScale;

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

    // Draw the filename once the icon is reasonably readable. Threshold of
    // 13px surfaces filenames at default-zoom for typical folders/files
    // without crowding the canvas when zoomed all the way out.
    if (!isAggregate && showNames && data.label && fontSize >= 13) {
      context.globalAlpha = Math.min(0.92, context.globalAlpha);
      context.fillStyle = graphThemeColor("--omarchy-fg", "#d4d4d4");
      context.font = '600 13px IBM Plex Sans, Inter, system-ui, sans-serif';
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(String(data.label), data.x, data.y + fontSize * 0.52 + 3, 160);
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
    const fs = GLYPH_ATLAS_SIZE * 0.62;
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
