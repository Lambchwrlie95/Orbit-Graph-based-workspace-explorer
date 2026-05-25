import type { GraphEdge, GraphNode } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeType = 'folder' | 'code' | 'image' | 'text' | 'config' | 'web' | 'document' | 'other' | 'cluster';

export type VisualState = "primary" | "context" | "ghost" | "proxy";

export type EdgeCategory = "hierarchy" | "code" | "docs" | "symlink" | "semantic" | "tags" | "other";

export type VisualGraphNode = GraphNode & {
  visualState?: VisualState;
  proxyKind?: string;
};

export type GraphDisplayNode = VisualGraphNode & {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NODE_TYPE_CONFIG: Record<NodeType, { label: string; color: string }> = {
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

export const NODE_TYPE_FALLBACKS: Record<NodeType, string> = {
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

// Per-category metadata for the legend + edge renderer. The `color` field
// resolves at read time so a flavor switch (Catppuccin, Dracula, etc.) or a
// live Omarchy palette change picks up new colors without re-rendering the
// constants. `cssVar`/`fallback` are the source of truth.
export const EDGE_CATEGORY_CONFIG: Record<EdgeCategory, { label: string; cssVar: string; fallback: string; description: string }> = {
  hierarchy: { label: "Hierarchy", cssVar: "--orbit-edge-hierarchy", fallback: "#6f9ad0", description: "folder containment" },
  code:      { label: "Code refs", cssVar: "--orbit-edge-code",      fallback: "#a78bfa", description: "imports/dependencies" },
  docs:      { label: "Doc links", cssVar: "--orbit-edge-docs",      fallback: "#5eead4", description: "markdown/wiki/web links" },
  symlink:   { label: "Symlink",   cssVar: "--orbit-edge-symlink",   fallback: "#ed9a4a", description: "filesystem aliases" },
  semantic:  { label: "Related",   cssVar: "--orbit-edge-semantic",  fallback: "#86efac", description: "semantic/similar edges" },
  tags:      { label: "Tags",      cssVar: "--orbit-edge-tags",      fallback: "#f472b6", description: "tag relationships" },
  other:     { label: "Other edges", cssVar: "--orbit-edge-other",   fallback: "#638fc3", description: "uncategorized relationships" },
};

// ---------------------------------------------------------------------------
// Core style utilities
// ---------------------------------------------------------------------------

export function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function graphThemeColor(token: string, fallback: string): string {
  return cssVar(token, fallback);
}

export function withAlpha(rgba: string, alpha: number): string {
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

// Returns true when the current graph canvas background is a light color.
// Used to boost edge contrast so they remain visible on light themes.
export function themeIsLight(): boolean {
  const hex = graphThemeColor("--orbit-graph-canvas", "#101010").replace(/^#/, "");
  if (hex.length < 6 || !/^[0-9a-f]+$/i.test(hex)) return false;
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.35;
}

// Helper to darken/lighten a hex color
export function adjustColorBrightness(hex: string, factor: number): string {
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

export function getNodeType(node: GraphNode): NodeType {
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

export function getNodeColor(node: VisualGraphNode): string {
  // Drive node fill from the legend bucket so a swatch in the legend always
  // matches the corresponding sphere on the canvas.
  const nodeType = getNodeType(node);
  const raw = NODE_TYPE_CONFIG[nodeType].color;
  // NODE_TYPE_CONFIG stores colors as CSS custom properties ("var(--token)").
  // Sigma and THREE cannot render CSS variable strings — resolve to hex first.
  const color = raw.startsWith("var(")
    ? cssVar(raw.slice(4, -1), NODE_TYPE_FALLBACKS[nodeType] ?? "#94a3b8")
    : raw;
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

export function clusterGlyphForNode(node: Pick<VisualGraphNode, "proxyKind" | "isCluster"> & { visualState?: VisualState }) {
  if (node.proxyKind === "images") return "▧";
  if (node.proxyKind === "folders") return "⌘";
  if (node.proxyKind === "code") return "⌬";
  if (node.proxyKind === "configs") return "⚙";
  return node.isCluster || node.visualState === "proxy" ? "⬡" : "◇";
}

export function clusterGlyphForAttrs(attrs: Record<string, unknown>) {
  return clusterGlyphForNode({
    isCluster: Boolean(attrs.isCluster),
    proxyKind: typeof attrs.proxyKind === "string" ? attrs.proxyKind : undefined,
    visualState: attrs.visualState as VisualState | undefined,
  });
}

export function edgeCategoryColor(category: EdgeCategory): string {
  const entry = EDGE_CATEGORY_CONFIG[category];
  return graphThemeColor(entry.cssVar, entry.fallback);
}

// ---------------------------------------------------------------------------
// Shared display utilities (used by both GraphView and graph3d)
// ---------------------------------------------------------------------------

export function edgeCategoryForType(edgeType: string): EdgeCategory {
  if (edgeType === "contains") return "hierarchy";
  if (edgeType === "import" || edgeType === "dependency" || edgeType === "code_ref") return "code";
  if (edgeType === "markdown_link" || edgeType === "wikilink" || edgeType === "link") return "docs";
  if (edgeType === "symlink") return "symlink";
  if (edgeType === "related" || edgeType === "similar" || edgeType === "similarity" || edgeType === "semantic") return "semantic";
  if (edgeType === "tag" || edgeType === "hashtag") return "tags";
  return "other";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function seededAngle(id: number) {
  const x = Math.sin(Math.abs(id) * 999.13) * 10000;
  return (x - Math.floor(x)) * Math.PI * 2;
}

export function shortNodePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

export function graphEdgePairKey(source: string, target: string) {
  return source < target ? `${source}:${target}` : `${target}:${source}`;
}

export function nodeVisualState(node: GraphDisplayNode): VisualState {
  if (node.visualState) return node.visualState;
  if (node.depth <= 1) return "primary";
  if (node.isDir || node.isCluster) return "context";
  return "ghost";
}

export function visibleNodeLabel(node: GraphDisplayNode) {
  if (nodeVisualState(node) === "proxy") return "";
  if (nodeVisualState(node) === "ghost") return "";
  if (node.isCluster) return node.label;
  if (node.isDir && node.depth <= 2) return node.label;
  return "";
}

export function getNodeSize(node: GraphDisplayNode): number {
  const visualState = nodeVisualState(node);
  if (visualState === "proxy") {
    return Math.min(18, 8 + Math.log2(Math.max(1, node.childCount) + 2) * 1.7);
  }
  if (node.isCluster) return 14;
  if (node.isDir) {
    const baseSize = node.depth <= 1 ? 8 : 5;
    const maxSize = 14;
    const growth = Math.log2(Math.min(node.childCount, 50) + 2) * 0.75;
    const size = Math.min(maxSize, baseSize + growth);
    return visualState === "ghost" ? Math.max(4, size * 0.82) : size;
  }
  const sizeBoost = node.sizeBytes > 0 ? Math.min(2.5, Math.log10(node.sizeBytes + 1) * 0.35) : 0;
  const size = 4 + sizeBoost;
  return visualState === "ghost" ? Math.max(2.6, size * 0.72) : size;
}

export function compareGraphChildren(a?: GraphNode, b?: GraphNode) {
  if (!a || !b) return 0;
  if (a.isCluster !== b.isCluster) return a.isCluster ? -1 : 1;
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
}

// ---------------------------------------------------------------------------
// Layout helpers (shared between constellation/tree/3D layouts)
// ---------------------------------------------------------------------------

export function hierarchy(nodes: VisualGraphNode[], edges: GraphEdge[]) {
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

export function fallbackNode(node: VisualGraphNode, index: number, depth: number, childCount: number): GraphDisplayNode {
  const angle = seededAngle(node.id);
  const radius = 120 + (index % 18) * 18;
  return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, depth, childCount };
}

export function subtreeWeight(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const kids = children.get(id) ?? [];
  if (kids.length === 0) return 1;
  return Math.max(1, Math.min(48, kids.reduce((sum, child) => sum + subtreeWeight(child, children, seen), 0)));
}

export function subtreeMaxDepth(id: number, children: Map<number, number[]>, seen = new Set<number>()): number {
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

export function orbitRadiusForDepth(depth: number): number {
  if (depth <= 0) return 0;
  return depth * VEGA_RADIAL_DEPTH_GAP;
}

export function orderedVegaChildren(id: number, tree: ReturnType<typeof hierarchy>) {
  const kids = [...(tree.children.get(id) ?? [])];
  return kids.sort((a, b) => {
    const nodeA = tree.byId.get(a);
    const nodeB = tree.byId.get(b);
    // Keep folders first so the radial tree reads as structural branches, but
    // otherwise preserve name ordering for deterministic inspectability.
    return compareGraphChildren(nodeA, nodeB);
  });
}

export function vegaLeafSlots(id: number, tree: ReturnType<typeof hierarchy>, seen = new Set<number>()): number {
  if (seen.has(id)) return 1;
  seen.add(id);
  const node = tree.byId.get(id);
  if (!node) return 1;
  const kids = orderedVegaChildren(id, tree);
  if (!kids.length) {
    if (node.visualState === "proxy" || node.isCluster) return 6.4;
    if (node.isDir) return 4.2;
    return 2.1;
  }
  const childSlots = kids.reduce((sum, child) => sum + vegaLeafSlots(child, tree, new Set(seen)), 0);
  // Parents with many direct children reserve a little extra arc, matching the
  // Vega mental model while avoiding the old shelf pile-ups.
  return Math.max(childSlots, Math.min(14, 1.6 + kids.length * 0.42));
}

export function visualFootprintRadius(node: GraphDisplayNode, layoutScale = 1): number {
  const base = getNodeSize(node);
  // Icons render at ~1.6× the node sphere radius (rawFontSize = data.size * 1.6).
  // The footprint must account for this so the push relaxation reserves space
  // for the full visible glyph, not just the invisible hit-target sphere.
  // The additive constants are multiplied by layoutScale so they stay
  // proportional to the coordinate space — without this, compacted layouts
  // (layoutScale < 1) get over-pushed and partially undo the compaction.
  // Floor the layoutScale contribution at 0.55 so small graphs don't collapse
  // padding to 10-15px (which is less than the rendered icon).
  const s = Math.max(0.55, layoutScale);
  if (node.visualState === "proxy" || node.isCluster) return base * 8.0 * s + 48 * s;
  if (node.isDir) return base * 10.0 * s + (node.depth <= 2 ? 60 : 52) * s;
  return base * 7.5 * s + 28 * s;
}

export function relaxRadialVisualFootprints(nodes: GraphDisplayNode[], layoutScale = 1): GraphDisplayNode[] {
  if (nodes.length < 2) return nodes;
  const placed = nodes.map((node) => ({ ...node }));
  const maxNodes = Math.min(placed.length, 900);
  // Iterate until no overlap is detected, capped to avoid pathological cases.
  // Empirically a tight 5-stack of files needs ~12 passes at high push factor
  // to fully fan out. Stop early once a pass made no corrections.
  const maxIterations = placed.length > 500 ? 32 : 64;
  const pushFactor = 0.94;

  for (let pass = 0; pass < maxIterations; pass += 1) {
    let movedAny = false;
    for (let i = 0; i < maxNodes; i += 1) {
      const a = placed[i];
      for (let j = i + 1; j < maxNodes; j += 1) {
        const b = placed[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance < 0.001) {
          const angle = seededAngle(a.id + b.id + pass);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const minDistance = visualFootprintRadius(a, layoutScale) + visualFootprintRadius(b, layoutScale) + Math.max(20, 14 * layoutScale);
        if (distance >= minDistance) continue;
        const push = (minDistance - distance) * pushFactor;
        const nx = dx / distance;
        const ny = dy / distance;
        a.x -= nx * push * 0.5;
        a.y -= ny * push * 0.5;
        b.x += nx * push * 0.5;
        b.y += ny * push * 0.5;
        movedAny = true;
      }
    }
    if (!movedAny) break;
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Vega radial layout constants and implementation
// ---------------------------------------------------------------------------

export const VEGA_RADIAL_LEAF_GAP = 520;
export const VEGA_RADIAL_DEPTH_GAP = 1000;
export const VEGA_RADIAL_ROOT_GAP_LEAVES = 10;
export const VEGA_RADIAL_MIN_RADIUS = 2400;
export const VEGA_RADIAL_START_ANGLE = 270; // Same visual start as Vega sample: root fan begins at top.

// Module-level handoff so the JSX-side halo layer can read the most recent
// family wedge geometry without us needing to thread it through every render.
// The layout writes; the renderer reads.
type FamilyWedge = {
  id: number;
  startAngle: number;
  endAngle: number;
  maxDepth: number;
};
export let lastFamilyWedges: FamilyWedge[] = [];

export function placeVegaRadialNode(
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

const ARCH_LAYER_RULES: Array<{ patterns: string[]; label: string; color: string }> = [
  { patterns: ["route", "routes", "api", "apis", "controller", "controllers", "handler", "handlers", "endpoint", "endpoints"], label: "API", color: "#38bdf8" },
  { patterns: ["service", "services", "usecase", "usecases", "use-case", "use-cases"], label: "Service", color: "#a78bfa" },
  { patterns: ["model", "models", "entity", "entities", "domain", "repository", "repositories"], label: "Data", color: "#4ade80" },
  { patterns: ["component", "components", "view", "views", "page", "pages", "screen", "screens"], label: "UI", color: "#f472b6" },
  { patterns: ["middleware", "interceptor", "interceptors", "guard", "guards"], label: "Middleware", color: "#fb923c" },
  { patterns: ["util", "utils", "helper", "helpers", "lib", "libs", "shared", "common"], label: "Utility", color: "#94a3b8" },
  { patterns: ["test", "tests", "spec", "specs", "__tests__", "__mocks__", "mock", "mocks"], label: "Test", color: "#6b7280" },
  { patterns: ["config", "configs", "configuration", "setting", "settings"], label: "Config", color: "#a8a29e" },
];

export function detectArchLayer(filePath: string): { label: string; color: string } | null {
  const parts = filePath.toLowerCase().replace(/\\/g, "/").split("/");
  for (const { patterns, label, color } of ARCH_LAYER_RULES) {
    for (const part of parts) {
      const clean = part.replace(/\.[^.]+$/, "");
      if (patterns.some(p => clean === p || clean.startsWith(p + ".") || clean.endsWith("." + p))) {
        return { label, color };
      }
    }
  }
  return null;
}

export function vegaRadialTidyLayout(
  nodes: VisualGraphNode[],
  roots: number[],
  tree: ReturnType<typeof hierarchy>,
  totalNodes = 200,
): GraphDisplayNode[] {
  const placed = new Map<number, GraphDisplayNode>();
  const orderedRoots = [...roots].sort((a, b) => compareGraphChildren(tree.byId.get(a), tree.byId.get(b)));
  const maxDepth = Math.max(1, ...orderedRoots.map((id) => subtreeMaxDepth(id, tree.children)));
  const totalLeafSlots = orderedRoots.reduce((sum, id) => sum + vegaLeafSlots(id, tree), 0)
    + Math.max(0, orderedRoots.length - 1) * VEGA_RADIAL_ROOT_GAP_LEAVES;

  // For small graphs, shrink all layout distances so the bounding box is
  // proportionally smaller and Sigma doesn't need to zoom out as far.
  // layoutScale is applied to ALL three radius terms — not just minRadius —
  // otherwise circumferenceRadius (driven by leaf count) dominates and the
  // scale has no effect on the final camera zoom.
  const layoutScale = totalNodes < 15 ? 0.30 : totalNodes < 35 ? 0.45 : totalNodes < 120 ? 0.62 : totalNodes < 300 ? 0.78 : 1.0;
  const minRadius = VEGA_RADIAL_MIN_RADIUS * layoutScale;
  const leafGap = VEGA_RADIAL_LEAF_GAP * layoutScale;
  const depthGapBase = VEGA_RADIAL_DEPTH_GAP * layoutScale;

  // Vega's sample exposes this as a radius signal. Orbit derives it from graph
  // density so crowded folders expand outward instead of stacking icons.
  const circumferenceRadius = (Math.max(8, totalLeafSlots) * leafGap) / (Math.PI * 2);
  const depthRadius = (maxDepth + 0.5) * depthGapBase;
  const radius = Math.max(minRadius, circumferenceRadius, depthRadius);
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

  const resolved = nodes.map((node, index) => placed.get(node.id) ?? fallbackNode(node, index, 0, 0));
  return relaxRadialVisualFootprints(resolved, layoutScale);
}
