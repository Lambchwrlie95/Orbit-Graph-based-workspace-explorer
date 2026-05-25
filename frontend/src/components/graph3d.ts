import ForceGraph3D, { type ForceGraph3DInstance, type LinkObject, type NodeObject } from "3d-force-graph";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { iconRuleForPath } from "../lib/fileGlyphs";
import type { GraphEdge, IconThemePayload } from "../types";
import {
  type NodeType, type VisualState, type EdgeCategory,
  type VisualGraphNode, type GraphDisplayNode,
  NODE_TYPE_FALLBACKS, EDGE_CATEGORY_CONFIG,
  graphThemeColor, withAlpha, getNodeType, getNodeColor,
  clusterGlyphForNode, edgeCategoryColor,
  edgeCategoryForType, escapeHtml, seededAngle, shortNodePath, graphEdgePairKey,
  nodeVisualState, visibleNodeLabel,
  hierarchy, vegaRadialTidyLayout,
} from "../lib/graphStyle";

export type { ForceGraph3DInstance };
export { ForceGraph3D };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Graph3DNode = NodeObject & {
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
  nodeType: NodeType;
  extension?: string | null;
  parentPath?: string | null;
  clusterSummary?: VisualGraphNode["clusterSummary"];
  childCount: number;
  sizeBytes: number;
  depth: number;
  visualState?: VisualState;
  glyphText?: string;
  neighborSet?: Set<string>; // pre-computed neighbor IDs for O(1) highlight lookup
};

export type Graph3DLink = LinkObject<Graph3DNode> & {
  id: string;
  source: string | Graph3DNode;
  target: string | Graph3DNode;
  edgeType: string;
  category: EdgeCategory;
  color: string;
  width: number;
  curvature: number;
};

export type OrbitGraph3DControls = {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  enableDamping?: boolean;
  dampingFactor?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  zoomSpeed?: number;
  rotateSpeed?: number;
  panSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  screenSpacePanning?: boolean;
  mouseButtons?: Record<string, unknown>;
  // TrackballControls-specific knobs (free rotation, no up-axis lock):
  staticMoving?: boolean;
  dynamicDampingFactor?: number;
  noRotate?: boolean;
  noZoom?: boolean;
  noPan?: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Golden angle in radians (~137.5°). Spacing children at this angle around a
// parent maximizes the minimum angular gap between any two siblings, which is
// why sunflower seeds and pinecones use it. We use it for organic spread.
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const STARFIELD_COUNT = 720;
export const STARFIELD_RADIUS_MIN = 1800;
export const STARFIELD_RADIUS_MAX = 3400;

// ── 3D node object registry & texture cache ─────────────────────────────────
// three-force-graph replaces THREE.Object3D instances on every nodeThreeObject
// call without disposing them. We track the previous object per node so we can
// dispose its SpriteMaterials (freeing JS descriptors), while the texture cache
// keeps the actual GPU texture alive across rebuilds and reuses it when the
// node's visual state hasn't changed. clearGraph3DNodeRegistry() flushes both
// when the 3D graph is torn down, releasing all GPU texture memory at once.
const _3dObjRegistry = new Map<string, THREE.Object3D>();
const _3dTexCache = new Map<string, THREE.CanvasTexture>();

export function clearGraph3DNodeRegistry(): void {
  for (const tex of _3dTexCache.values()) tex.dispose();
  _3dTexCache.clear();
  _3dObjRegistry.clear();
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function buildGraph3DData(
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
  const graphNodes: Graph3DNode[] = nodes.map((node) => {
    const visualState = node.visualState ?? nodeVisualState(node);
    const icon = iconRuleForPath(node.path, node.isDir, node.isCluster, iconTheme);
    const baseColor = graph3dNodeBaseColor(node, groupColors);
    const glyphText = node.isCluster || visualState === "proxy" ? clusterGlyphForNode(node) : icon.text;
    const native3d = node.projectionScale === 1 && Number.isFinite(node.z3d);
    const seedScale = native3d ? 1 : scale;
    const depthZ = native3d ? Number(node.z3d) : (node.depth - 1.5) * 14;
    const index = siblingIndex.get(node.id) ?? node.id;
    const total = Math.max(1, siblingCount.get(node.id) ?? 1);
    const orbitAngle = index * GOLDEN_ANGLE;
    const orbitRadius = native3d ? 0 : parentByChild.has(node.id) ? Math.min(34, 10 + Math.sqrt(total) * 3.2 + node.depth * 1.4) : 0;
    const localLift = parentByChild.has(node.id) ? ((index % 5) - 2) * (native3d ? 1.8 : 5.5) : 0;
    const x = Number.isFinite(node.x) ? node.x * seedScale + Math.cos(orbitAngle) * orbitRadius : undefined;
    const y = Number.isFinite(node.y) ? node.y * seedScale + Math.sin(orbitAngle) * orbitRadius : undefined;
    const z = Number.isFinite(depthZ) ? depthZ + localLift : undefined;
    const anchorNode = native3d && x !== undefined && y !== undefined && z !== undefined;
    return {
      id: String(node.id),
      name: node.label,
      label: visibleNodeLabel(node),
      path: node.path,
      parentPath: node.parentPath,
      color: baseColor,
      val: graph3dNodeValue(node, visualState),
      x,
      y,
      z,
      fx: anchorNode ? x : undefined,
      fy: anchorNode ? y : undefined,
      fz: anchorNode ? z : undefined,
      isDir: node.isDir,
      isCluster: node.isCluster,
      nodeType: getNodeType(node),
      extension: node.extension,
      clusterSummary: node.clusterSummary,
      childCount: node.childCount,
      sizeBytes: node.sizeBytes,
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
    const style = graph3dEdgeStyleForCategory(category);
    links.push({
      id: String(edge.id),
      source,
      target,
      edgeType: edge.edgeType,
      category,
      color: style.color,
      width: style.size,
      curvature: style.curvature === 0 ? 0 : style.curvature + Math.sin(Number(edge.id) * 12.9898) * 0.045,
    });
  }
  // Cross-link neighbor sets so color lookups are O(1) instead of O(links).
  const nodesById3d = new Map(graphNodes.map((n) => [n.id, n]));
  for (const link of links) {
    const srcId = String(link.source);
    const tgtId = String(link.target);
    const src = nodesById3d.get(srcId);
    const tgt = nodesById3d.get(tgtId);
    if (src) { if (!src.neighborSet) src.neighborSet = new Set(); src.neighborSet.add(tgtId); }
    if (tgt) { if (!tgt.neighborSet) tgt.neighborSet = new Set(); tgt.neighborSet.add(srcId); }
  }

  return { nodes: graphNodes, links };
}

export function graph3dNodeLabel(node: Graph3DNode): string {
  const kind = node.isCluster ? "Cluster" : node.isDir ? "Folder" : node.extension || "File";
  const glyph = node.glyphText ? `${node.glyphText} ` : "";
  return `<div class="graph-3d-label"><strong>${escapeHtml(`${glyph}${node.name}`)}</strong><br/><span>${escapeHtml(kind)}</span><br/><small>${escapeHtml(shortNodePath(node.path))}</small></div>`;
}

function graph3dNodeBaseColor(node: GraphDisplayNode, groupColors: Map<number, string>): string {
  if (node.isDir && !node.isCluster) return graph3dBrighten(graph3dSolidColor(groupColors.get(node.id) ?? graphThemeColor("--omarchy-color2", "#8bd17c"), "#8bd17c"), 1.45);
  const color = getNodeColor(node);
  return graph3dBrighten(graph3dSolidColor(color, NODE_TYPE_FALLBACKS[getNodeType(node)] ?? "#d8dee9"), 1.25);
}

function graph3dNodeValue(node: GraphDisplayNode, visualState: VisualState): number {
  const clusterTotal = node.clusterSummary?.totalChildren ?? node.childCount ?? 0;
  const contentWeight = node.isCluster || visualState === "proxy"
    ? Math.log2(Math.max(1, clusterTotal) + 1)
    : node.isDir
      ? Math.log2(Math.max(1, node.childCount) + 1)
      : Math.log10(Math.max(1, node.sizeBytes) + 1);

  if (node.isCluster || visualState === "proxy") {
    return Math.min(20, 6.2 + contentWeight * 1.15);
  }
  if (node.isDir) {
    // Folders are the skill-tree hubs: visibly larger by default, then grow
    // smoothly with visible children. Log scaling avoids giant outliers.
    return Math.min(24, 8.4 + contentWeight * 1.35);
  }
  return Math.min(9.2, 3.1 + contentWeight * 0.42);
}

export function graph3dNodeObject(
  node: Graph3DNode,
  hoveredId: string | null,
  selectedId: string | null,
  dimUnrelated: boolean,
  links: Graph3DLink[],
  showText: boolean,
): THREE.Object3D {
  // INVARIANT — do not regress: 3D nodes are ICONS ONLY. No mesh shape behind
  // the icon, no plate/card background, no halo. The user has flagged
  // multiple times that "shapes behind icons" and "cards" are not what they
  // want. Render exactly one transparent sprite carrying the glyph.
  const focus = hoveredId || selectedId;
  const isActive = node.id === hoveredId || node.id === selectedId;
  // Use pre-computed neighbor set for O(1) lookup; fall back to link scan only
  // when the set is absent (shouldn't happen after buildGraph3DData runs).
  const isRelated = Boolean(focus) && (
    node.neighborSet
      ? node.neighborSet.has(focus!)
      : links.some((link) => {
          const source = graph3dEndpointId(link.source);
          const target = graph3dEndpointId(link.target);
          return (source === focus && target === node.id) || (target === focus && source === node.id);
        })
  );
  const dimmed = dimUnrelated && Boolean(focus) && !isActive && !isRelated;
  const radius = Math.max(node.isDir ? 5.5 : node.isCluster ? 4.2 : 3.2, Math.sqrt(Math.max(1, node.val)) * (node.isDir ? 1.9 : node.isCluster ? 1.48 : 1.08));
  const tint = graph3dSolidColor(graph3dNodeColor(node, hoveredId, selectedId, dimUnrelated, links), node.color);

  // Dispose SpriteMaterials on the previous object for this node. The underlying
  // texture stays alive in _3dTexCache — only the material wrapper is freed.
  const oldObj = _3dObjRegistry.get(node.id);
  if (oldObj) {
    oldObj.traverse((child) => {
      if (child instanceof THREE.Sprite && child.material instanceof THREE.SpriteMaterial) {
        child.material.dispose();
      }
    });
  }

  const group = new THREE.Group();
  const badge = graph3dBadgeSprite(node, isActive, dimmed, radius, tint);
  group.add(badge);

  const shouldShowBillboard = showText && (node.isDir || node.isCluster || isActive || isRelated);
  if (shouldShowBillboard && !dimmed) {
    const sprite = graph3dBillboard(node, isActive, radius);
    sprite.position.y = radius * 1.9;
    group.add(sprite);
  }

  _3dObjRegistry.set(node.id, group);
  return group;
}

function graph3dNodeGeometry(node: Graph3DNode, radius: number): THREE.BufferGeometry {
  if (node.isDir && !node.isCluster) return new THREE.BoxGeometry(radius * 1.72, radius * 1.2, radius * 0.92, 2, 2, 1);
  if (node.isCluster || node.visualState === "proxy") return new THREE.DodecahedronGeometry(radius * 0.98, 0);
  return new THREE.IcosahedronGeometry(radius * 0.86, 1);
}

// Glowing neuron orb sprite. No plates, no borders — just a soft radial glow
// with the icon glyph floating in the bright core. AdditiveBlending lets
// overlapping orbs accumulate light naturally, triggering the bloom pass.
function graph3dBadgeSprite(node: Graph3DNode, active: boolean, dimmed: boolean, radius: number, accent: string): THREE.Sprite {
  // Cache key encodes the visual state that determines pixel output. Including
  // accent captures the difference between hovered (#fff4a8) and selected
  // (#f5c542) active states without separate flags.
  const state = active ? "a" : dimmed ? "d" : "n";
  const cacheKey = `b:${node.id}:${state}:${accent}`;
  let texture = _3dTexCache.get(cacheKey);
  if (!texture) {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      const center = size / 2;
      const solid = graph3dSolidColor(accent, "#88bbdd");
      const bright = graph3dBrighten(solid, 2.2);

      // Layer 1 — wide outer haze (deepest glow, most transparent)
      const outerR = size * (node.isDir ? 0.50 : 0.44);
      const outer = ctx.createRadialGradient(center, center, 0, center, center, outerR);
      outer.addColorStop(0,   withAlpha(solid, active ? 0.30 : 0.14));
      outer.addColorStop(0.55, withAlpha(solid, active ? 0.10 : 0.04));
      outer.addColorStop(1,   withAlpha(solid, 0));
      ctx.fillStyle = outer;
      ctx.fillRect(0, 0, size, size);

      // Layer 2 — core glow (the "soma" of the neuron)
      const coreR = size * (active ? 0.30 : node.isDir ? 0.26 : 0.22);
      const core = ctx.createRadialGradient(center, center, 0, center, center, coreR);
      core.addColorStop(0,   withAlpha(bright, active ? 0.90 : 0.68));
      core.addColorStop(0.42, withAlpha(solid,  active ? 0.52 : 0.34));
      core.addColorStop(1,   withAlpha(solid,  0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, size, size);

      // Layer 3 — hot center point to trigger bloom threshold
      const hotR = size * (active ? 0.09 : 0.055);
      const hot = ctx.createRadialGradient(center, center, 0, center, center, hotR);
      hot.addColorStop(0, active ? withAlpha("#ffffff", 0.82) : withAlpha(bright, 0.78));
      hot.addColorStop(1, withAlpha(bright, 0));
      ctx.fillStyle = hot;
      ctx.fillRect(0, 0, size, size);

      // Glyph — bright against the glow, same Nerd Font stack as 2D atlas
      const glyph = node.glyphText && node.glyphText.length > 0
        ? node.glyphText
        : (node.isDir ? "" : "•");
      const glyphPx = Math.round(size * (active ? 0.44 : 0.36));
      ctx.font = `normal ${glyphPx}px "JetBrainsMono Nerd Font", "JetBrains Mono NF", "Symbols Nerd Font", "SymbolsNerdFont", "Hack Nerd Font", "FiraCode Nerd Font", "Noto Sans Symbols 2", "Noto Sans Symbols", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = active ? 1.0 : 0.88;
      ctx.fillStyle = active ? "#ffffff" : graph3dBrighten(solid, 3.8);
      ctx.fillText(glyph, center, center + size * 0.02);
      ctx.globalAlpha = 1.0;
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    _3dTexCache.set(cacheKey, texture);
  }
  // NormalBlending is deliberate here. Additive transparent sprites look good
  // on some GPUs, but on WebKitGTK/Intel they can collapse into a wire-only
  // scene when the renderer/compositor alpha path is active: links render, the
  // node sprites effectively disappear. The canvas already contains the glow;
  // render it as a regular translucent sprite so every node remains visible.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.NormalBlending,
    alphaTest: 0.015,
    depthWrite: false,
    depthTest: false,
  }));
  const badgeScale = radius * (active ? 11.0 : 9.0);
  sprite.scale.set(badgeScale, badgeScale, 1);
  return sprite;
}

function graph3dBillboard(node: Graph3DNode, active: boolean, radius: number): THREE.Sprite {
  const cacheKey = `l:${node.id}:${active ? "a" : "n"}`;
  let texture = _3dTexCache.get(cacheKey);
  if (!texture) {
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
      const glyph = node.glyphText || (node.isDir ? "" : "•");
      ctx.fillText(glyph, width / 2, height * 0.34);
      ctx.font = `${active ? 24 : 19}px IBM Plex Sans, sans-serif`;
      ctx.fillStyle = active ? "#f8f1bf" : "#e5e7eb";
      const label = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;
      ctx.fillText(label, width / 2, height * 0.72);
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    _3dTexCache.set(cacheKey, texture);
  }
  const width = active ? 420 : 340;
  const height = active ? 124 : 96;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const scale = active ? radius * 2.2 : radius * 1.7;
  sprite.scale.set(scale * (width / height), scale, 1);
  return sprite;
}

export function graph3dSolidColor(value: string, fallback = "#d8dee9"): string {
  const token = value.trim().match(/^var\((--[^),\s]+)(?:,\s*([^)]*))?\)$/);
  if (token) return graph3dSolidColor(graphThemeColor(token[1], token[2]?.trim() || fallback), fallback);
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return graph3dRgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return fallback;
  if (hex[1].length === 6) return `#${hex[1]}`;
  return `#${hex[1].split("").map((char) => char + char).join("")}`;
}

export function graph3dBrighten(value: string, factor: number): string {
  const color = graph3dSolidColor(value);
  const raw = color.slice(1);
  const parsed = Number.parseInt(raw, 16);
  const r = Math.min(255, Math.round(((parsed >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((parsed >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((parsed & 255) * factor));
  return graph3dRgbToHex(r, g, b);
}

export function graph3dBlend(foreground: string, background: string, amount: number): string {
  const fg = graph3dSolidColor(foreground).slice(1);
  const bg = graph3dSolidColor(background, "#101010").slice(1);
  const f = Number.parseInt(fg, 16);
  const b = Number.parseInt(bg, 16);
  const mix = (a: number, z: number) => Math.round(a * (1 - amount) + z * amount);
  return graph3dRgbToHex(
    mix((f >> 16) & 255, (b >> 16) & 255),
    mix((f >> 8) & 255, (b >> 8) & 255),
    mix(f & 255, b & 255),
  );
}

export function graph3dRgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0")).join("")}`;
}

export function graph3dNodeColor(
  node: Graph3DNode,
  hoveredId: string | null,
  selectedId: string | null,
  dimUnrelated: boolean,
  links: Graph3DLink[],
): string {
  if (node.id === selectedId) return "#f5c542";
  if (node.id === hoveredId) return "#fff4a8";
  if (!dimUnrelated || (!hoveredId && !selectedId)) return node.color;
  const focus = (hoveredId || selectedId)!;
  // Use pre-computed neighbor set for O(1) lookup; fall back to link scan for
  // nodes that were built before neighbor sets were available.
  const related = node.neighborSet
    ? node.neighborSet.has(focus)
    : links.some((link) => {
        const source = graph3dEndpointId(link.source);
        const target = graph3dEndpointId(link.target);
        return (source === focus && target === node.id) || (target === focus && source === node.id);
      });
  return related ? node.color : withAlpha(node.color, 0.22);
}

export function graph3dLinkColor(link: Graph3DLink, hoveredId: string | null, selectedId: string | null, dimUnrelated: boolean): string {
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  const base = graph3dSolidColor(link.color, edgeCategoryColor(link.category));
  if (focus && (source === focus || target === focus)) return graph3dBrighten(base, 1.28);
  if (dimUnrelated && focus) return graph3dBlend(base, graphThemeColor("--orbit-graph-canvas", "#101010"), 0.72);
  if (link.category !== "hierarchy") return graph3dBrighten(base, 1.12);
  return base;
}

export function graph3dLinkWidth(link: Graph3DLink, hoveredId: string | null, selectedId: string | null): number {
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  if (focus && (source === focus || target === focus)) return Math.max(4.5, link.width * 2.0);
  if (link.category === "hierarchy") return Math.max(1.8, link.width);
  return Math.max(2.0, link.width);
}

export function graph3dLinkDistance(link: Graph3DLink, nodesById: Map<string, Graph3DNode>): number {
  const source = nodesById.get(graph3dEndpointId(link.source));
  const target = nodesById.get(graph3dEndpointId(link.target));
  if (link.category !== "hierarchy") return 96;
  if (source?.isDir && target?.isDir) return 134;
  if (source?.isDir || target?.isDir) return 66;
  return 38;
}

export function graph3dLinkParticles(link: Graph3DLink, hoveredId: string | null, selectedId: string | null): number {
  const focus = hoveredId || selectedId;
  if (!focus) return 0;
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  if (source !== focus && target !== focus) return 0;
  return link.category === "code" || link.category === "symlink" ? 4 : 3;
}

export function graph3dLinkParticleWidth(link: Graph3DLink, hoveredId: string | null, selectedId: string | null): number {
  const source = graph3dEndpointId(link.source);
  const target = graph3dEndpointId(link.target);
  const focus = hoveredId || selectedId;
  const active = Boolean(focus && (source === focus || target === focus));
  return active ? Math.max(1.7, link.width * 0.9) : Math.max(1.05, link.width * 0.62);
}

export function graph3dLinkParticleSpeed(link: Graph3DLink): number {
  if (link.category === "hierarchy") return 0.0018; // slow, subtle — containment pulses
  if (link.category === "code") return 0.006;
  if (link.category === "docs") return 0.0048;
  if (link.category === "symlink") return 0.0072;
  if (link.category === "semantic" || link.category === "tags") return 0.0036;
  return 0.004;
}

// Adds ambient particles, fog, and bloom to the 3D scene.
// Returns a cleanup function to remove them when the graph is destroyed.
export function graph3dAddSceneEffects(
  graphApi: ForceGraph3DInstance<Graph3DNode, Graph3DLink>,
  container: HTMLElement,
): () => void {
  const api = graphApi as unknown as {
    scene: () => THREE.Scene;
    postProcessingComposer: () => { addPass: (p: unknown) => void; removePass: (p: unknown) => void };
  };

  const scene = api.scene();

  // Synaptic dust — 2400 ambient particles drifting in 3D space.
  // Additive blending makes them contribute to the bloom without hard edges.
  const particleCount = 2400;
  const positions = new Float32Array(particleCount * 3);
  const spread = 520;
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x3a7090,
    size: 1.2,
    transparent: true,
    opacity: 0.26,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // Exponential fog — near nodes are crisp, distant ones fade to black.
  scene.fog = new THREE.FogExp2(0x020810, 0.00085);

  // Bloom: nodes with bright hot-centers glow. OutputPass converts sRGB correctly.
  const composer = api.postProcessingComposer();
  let bloomPass: unknown = null;
  let outputPass: unknown = null;
  try {
    const canvasW = container.clientWidth || window.innerWidth;
    const canvasH = container.clientHeight || window.innerHeight;
    bloomPass = new UnrealBloomPass(new THREE.Vector2(canvasW, canvasH), 0.42, 0.68, 0.32);
    outputPass = new OutputPass();
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
  } catch (e) {
    console.warn("Orbit 3D: bloom unavailable", e);
  }

  return () => {
    scene.remove(particles);
    pGeo.dispose();
    pMat.dispose();
    scene.fog = null;
    if (bloomPass) { try { composer.removePass(bloomPass); } catch {} }
    if (outputPass) { try { composer.removePass(outputPass); } catch {} }
  };
}

export function graph3dEndpointId(endpoint: string | number | Graph3DNode): string {
  return typeof endpoint === "object" ? String(endpoint.id) : String(endpoint);
}

export function graph3dApplyWallpaper(
  api: ForceGraph3DInstance<Graph3DNode, Graph3DLink>,
  wallpaperUrl: string | null,
  fallbackColor: string,
): void {
  const scene = api.scene();
  if (wallpaperUrl) {
    new THREE.TextureLoader().load(wallpaperUrl, (texture) => {
      scene.background = texture;
    });
  } else {
    const color = graph3dSolidColor(fallbackColor, "#101010");
    scene.background = new THREE.Color(color);
    api.backgroundColor(color);
  }
}

export function graph3dCollisionRadius(node: Graph3DNode): number {
  if (node.isDir && !node.isCluster) return Math.max(20, Math.sqrt(Math.max(1, node.val)) * 4.6);
  if (node.isCluster || node.visualState === "proxy") return Math.max(14, Math.sqrt(Math.max(1, node.val)) * 3.1);
  return Math.max(8, Math.sqrt(Math.max(1, node.val)) * 2.25);
}

export function createGraph3DCollisionForce() {
  let nodes: Graph3DNode[] = [];
  const force = ((alpha: number) => {
    const strength = Math.min(0.24, Math.max(0.04, alpha * 0.32));
    const limit = Math.min(nodes.length, 350);
    for (let i = 0; i < limit; i += 1) {
      const a = nodes[i];
      const ax = a.x ?? 0;
      const ay = a.y ?? 0;
      const az = a.z ?? 0;
      const ar = graph3dCollisionRadius(a);
      for (let j = i + 1; j < limit; j += 1) {
        const b = nodes[j];
        let dx = (b.x ?? 0) - ax;
        let dy = (b.y ?? 0) - ay;
        let dz = (b.z ?? 0) - az;
        let distance = Math.hypot(dx, dy, dz);
        if (!Number.isFinite(distance) || distance < 0.001) {
          const angle = seededAngle(Number(a.id) + Number(b.id));
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dz = Math.sin(angle * 0.7);
          distance = Math.hypot(dx, dy, dz);
        }
        const minDistance = ar + graph3dCollisionRadius(b);
        if (distance >= minDistance) continue;
        const overlap = minDistance - distance;
        const nx = dx / distance;
        const ny = dy / distance;
        const nz = dz / distance;
        const pinnedA = a.fx !== undefined || a.fy !== undefined || a.fz !== undefined;
        const pinnedB = b.fx !== undefined || b.fy !== undefined || b.fz !== undefined;
        if (!pinnedA) {
          a.vx = (a.vx ?? 0) - nx * overlap * strength * (pinnedB ? 1 : 0.5);
          a.vy = (a.vy ?? 0) - ny * overlap * strength * (pinnedB ? 1 : 0.5);
          a.vz = (a.vz ?? 0) - nz * overlap * strength * (pinnedB ? 1 : 0.5);
        }
        if (!pinnedB) {
          b.vx = (b.vx ?? 0) + nx * overlap * strength * (pinnedA ? 1 : 0.5);
          b.vy = (b.vy ?? 0) + ny * overlap * strength * (pinnedA ? 1 : 0.5);
          b.vz = (b.vz ?? 0) + nz * overlap * strength * (pinnedA ? 1 : 0.5);
        }
      }
    }
  }) as ((alpha: number) => void) & { initialize?: (nextNodes: Graph3DNode[]) => void };
  force.initialize = (nextNodes: Graph3DNode[]) => {
    nodes = nextNodes;
  };
  return force;
}

export function focusGraph3DNode(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>, node: Graph3DNode, duration = 700) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const z = node.z ?? 0;
  const distance = Math.max(72, Math.sqrt(Math.max(1, node.val)) * 16);
  const length = Math.hypot(x, y, z);
  const ratio = length > 0 ? 1 + distance / length : 1;
  graph.cameraPosition(
    length > 0 ? { x: x * ratio, y: y * ratio, z: z * ratio + distance * 0.28 } : { x: 0, y: -distance, z: distance },
    { x, y, z },
    duration,
  );
}

export function frameGraph3DScene(
  graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>,
  nodes: Map<string, Graph3DNode>,
  duration = 360,
) {
  const list = [...nodes.values()].filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z));
  if (!list.length) {
    graph.cameraPosition({ x: 0, y: -520, z: 360 }, { x: 0, y: 0, z: 0 }, duration);
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const node of list) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const z = node.z ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  const radius = Math.max(120, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
  const distance = Math.min(2400, Math.max(620, radius * 1.24));
  graph.cameraPosition(
    { x: center.x, y: center.y - distance * 0.78, z: center.z + distance * 0.46 },
    center,
    duration,
  );
}

export function configureGraph3DControls(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>) {
  const controls = graph3dControls(graph);
  if (!controls) return;
  // TrackballControls knobs (active path):
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.30;
  controls.rotateSpeed = 1.4;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.28;
  controls.noRotate = false;
  controls.noZoom = false;
  controls.noPan = false;
  controls.minDistance = 36;
  controls.maxDistance = 22000;
  // OrbitControls knobs (harmless on Trackball — kept for safety if the
  // controlType ever flips back during debugging):
  controls.enableDamping = true;
  controls.dampingFactor = 0.16;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.12;
}

export function setGraph3DAutoRotate(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>, enabled: boolean) {
  const controls = graph3dControls(graph);
  if (controls) controls.autoRotate = enabled;
}

export function installGraph3DAtmosphere(
  graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>,
  backgroundColor: string,
) {
  const sceneApi = graph as unknown as { scene?: () => THREE.Scene };
  const scene = sceneApi.scene?.();
  if (!scene) return;
  const bgHex = graph3dSolidColor(backgroundColor, "#0b0d12");
  const fogColor = new THREE.Color(bgHex);
  // Wide fog range so the graph stays visible when zoomed far out.
  // near=800 keeps close nodes crisp; far=28000 matches the camera far plane.
  scene.fog = new THREE.Fog(fogColor, 800, 28000);
  // Push the camera far clipping plane out to match so distant nodes are not
  // frustum-culled before the fog takes effect.
  const camApi2 = graph as unknown as { camera?: () => THREE.PerspectiveCamera };
  const perspectiveCam = camApi2.camera?.();
  if (perspectiveCam && "far" in perspectiveCam) {
    perspectiveCam.far = 50000;
    perspectiveCam.updateProjectionMatrix();
  }
  scene.traverse((obj) => {
    if ((obj as { userData?: { orbitStarfield?: boolean; orbitAtmosphereLight?: boolean } }).userData?.orbitStarfield
      || (obj as { userData?: { orbitAtmosphereLight?: boolean } }).userData?.orbitAtmosphereLight) {
      scene.remove(obj);
    }
  });
  const ambient = new THREE.AmbientLight(0xffffff, 1.15);
  ambient.userData.orbitAtmosphereLight = true;
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
  keyLight.position.set(-420, -620, 780);
  keyLight.userData.orbitAtmosphereLight = true;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(new THREE.Color(bgHex).lerp(new THREE.Color("#8bd17c"), 0.72), 0.82);
  rimLight.position.set(560, 420, -360);
  rimLight.userData.orbitAtmosphereLight = true;
  scene.add(rimLight);
  const positions = new Float32Array(STARFIELD_COUNT * 3);
  for (let i = 0; i < STARFIELD_COUNT; i += 1) {
    const r = STARFIELD_RADIUS_MIN + Math.random() * (STARFIELD_RADIUS_MAX - STARFIELD_RADIUS_MIN);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(bgHex).lerp(new THREE.Color("#ffffff"), 0.42),
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.userData.orbitStarfield = true;
  points.frustumCulled = false;
  scene.add(points);
}

export function graph3dControls(graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>) {
  return (graph as unknown as { controls?: () => OrbitGraph3DControls }).controls?.();
}

export function graph3dEdgeStyleForCategory(category: EdgeCategory): { color: string; size: number; curvature: number } {
  const color = graph3dSolidColor(edgeCategoryColor(category), EDGE_CATEGORY_CONFIG[category].fallback);
  switch (category) {
    case "hierarchy":
      return { color, size: 2.0, curvature: 0 };
    case "code":
      return { color, size: 3.5, curvature: 0.18 };
    case "docs":
      return { color, size: 3.0, curvature: 0.14 };
    case "symlink":
      return { color, size: 4.5, curvature: 0.22 };
    case "semantic":
      return { color, size: 2.5, curvature: 0.28 };
    case "tags":
      return { color, size: 2.5, curvature: 0.32 };
    default:
      return { color, size: 2.2, curvature: 0.12 };
  }
}

// Orbit-native 3D seed layout: compact parent-local shells instead of the 2D
// Atlas map flattened into Three.js. The force simulation can still breathe,
// but folders begin as large local anchors and files/clusters as close
// satellites, which avoids the distant "ants on strings" look.
export function graph3dLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  if (nodes.length === 0) return [];
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const radial = vegaRadialTidyLayout(nodes, roots, tree);
  const siblingInfo = graph3dSiblingInfo(edges);
  const maxRadius = Math.max(1, ...radial.map((node) => Math.hypot(node.x, node.y)));
  // Keep the 2D Atlas organization, but fold it into a shallower 3D world.
  // The previous native 3D shell independently fanned every parent, so the
  // same hierarchy that looked tidy in 2D became a tangled curtain in 3D.
  // This preserves radial order/depth and only uses Z for readable separation.
  const worldScale = Math.min(0.38, Math.max(0.035, 760 / maxRadius));

  return radial.map((node) => {
    const sibling = siblingInfo.get(node.id);
    const siblingIndex = sibling?.index ?? 0;
    const siblingCount = Math.max(1, sibling?.count ?? 1);
    const normalizedSibling = siblingCount <= 1 ? 0 : (siblingIndex / (siblingCount - 1)) * 2 - 1;
    const nodeAngle = ((node.angle ?? 0) * Math.PI) / 180;
    const familyWave = Math.sin(nodeAngle * 2.1 + node.depth * 0.8) * 34;
    const localShelf = normalizedSibling * (node.isDir ? 42 : 26);
    const depthShelf = (node.depth - 1) * 30;
    const aggregateLift = node.isCluster || node.visualState === "proxy" ? -28 : 0;
    return {
      ...node,
      x: node.x * worldScale,
      y: node.y * worldScale,
      z3d: familyWave + localShelf + depthShelf + aggregateLift,
      projectionScale: 1,
    };
  });
}

// Ego-centric 3D layout: distribute nodes on concentric spheres by BFS depth.
// Uses the Fibonacci sphere algorithm (golden angle ≈ 2.399 rad) so each shell
// gets near-uniform point spacing without any overlap. Returned nodes have
// projectionScale=1 so buildGraph3DData pins them via fx/fy/fz before the
// physics simulation starts, giving an instant readable scaffold.
export function graph3dSphericalLayout(nodes: VisualGraphNode[], edges: GraphEdge[]): GraphDisplayNode[] {
  if (nodes.length === 0) return [];

  const DEPTH_STEP = 150;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  // BFS depth assignment via containment edges
  const containsMap = new Map<number, number[]>();
  const parentOf = new Map<number, number>();
  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    const arr = containsMap.get(edge.sourceId) ?? [];
    arr.push(edge.targetId);
    containsMap.set(edge.sourceId, arr);
    parentOf.set(edge.targetId, edge.sourceId);
  }

  const nodeSet = new Set(nodes.map((n) => n.id));
  const bfsRoots = nodes.filter((n) => !parentOf.has(n.id) || !nodeSet.has(parentOf.get(n.id)!));
  const depth = new Map<number, number>();
  const queue: Array<{ id: number; d: number }> = bfsRoots.map((r) => ({ id: r.id, d: 0 }));
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const child of containsMap.get(id) ?? []) {
      if (nodeSet.has(child) && !depth.has(child)) queue.push({ id: child, d: d + 1 });
    }
  }
  for (const node of nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 1);
  }

  // Group node ids by depth
  const byDepth = new Map<number, number[]>();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 1;
    const arr = byDepth.get(d) ?? [];
    arr.push(node.id);
    byDepth.set(d, arr);
  }

  // Fibonacci sphere positions per shell
  const positions = new Map<number, { x: number; y: number; z: number }>();
  for (const [d, ids] of byDepth) {
    const shellRadius = d === 0 ? 0 : d * DEPTH_STEP;
    const n = ids.length;
    ids.forEach((id, i) => {
      if (shellRadius === 0 || n === 1) {
        positions.set(id, { x: 0, y: 0, z: 0 });
        return;
      }
      const cosTheta = 1 - (2 * i + 1) / n;
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = GOLDEN_ANGLE * i;
      positions.set(id, {
        x: Math.cos(phi) * sinTheta * shellRadius,
        y: cosTheta * shellRadius,
        z: Math.sin(phi) * sinTheta * shellRadius,
      });
    });
  }

  // Run through vegaRadialTidyLayout to get depth/childCount/angle fields that
  // GraphDisplayNode requires, then override x/y/z3d with spherical positions.
  const tree = hierarchy(nodes, edges);
  const roots = tree.roots.length ? tree.roots : [nodes[0].id];
  const base = vegaRadialTidyLayout(nodes, roots, tree);

  return base.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0, z: 0 };
    return { ...node, x: pos.x, y: pos.y, z3d: pos.z, projectionScale: 1 };
  });
}

export function graph3dSiblingInfo(edges: GraphEdge[]) {
  const childrenByParent = new Map<number, number[]>();
  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    const children = childrenByParent.get(edge.sourceId) ?? [];
    children.push(edge.targetId);
    childrenByParent.set(edge.sourceId, children);
  }
  const info = new Map<number, { index: number; count: number }>();
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a - b);
    children.forEach((child, index) => info.set(child, { index, count: children.length }));
  }
  return info;
}

// Navigation gizmo: an 88×88 canvas overlay that shows the camera orientation
// as a colored 6-face cube. Clicking a face snaps the camera to that axis.
export function installOrientationCube(
  graph: ForceGraph3DInstance<Graph3DNode, Graph3DLink>,
  container: HTMLElement,
): () => void {
  const SIZE = 88;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  Object.assign(canvas.style, {
    position: "absolute",
    top: "12px",
    right: "12px",
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: "10",
    pointerEvents: "auto",
  });
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const HALF = SIZE / 2;
  const CUBE_R = 27;

  const VERTS: [number, number, number][] = [
    [ 1, 1, 1], [ 1, 1,-1], [ 1,-1, 1], [ 1,-1,-1],
    [-1, 1, 1], [-1, 1,-1], [-1,-1, 1], [-1,-1,-1],
  ];
  const FACES = [
    { v: [0,2,3,1], normal: new THREE.Vector3( 1, 0, 0), label: "+X", token: "--omarchy-color9" },
    { v: [4,5,7,6], normal: new THREE.Vector3(-1, 0, 0), label: "-X", token: "--omarchy-color1" },
    { v: [0,4,6,2], normal: new THREE.Vector3( 0, 0, 1), label: "+Z", token: "--omarchy-color14" },
    { v: [1,3,7,5], normal: new THREE.Vector3( 0, 0,-1), label: "-Z", token: "--omarchy-color6" },
    { v: [0,1,5,4], normal: new THREE.Vector3( 0, 1, 0), label: "+Y", token: "--omarchy-color10" },
    { v: [2,6,7,3], normal: new THREE.Vector3( 0,-1, 0), label: "-Y", token: "--omarchy-color2" },
  ];

  const camApi = graph as unknown as { camera?: () => THREE.Camera };
  let animFrameId = 0;

  // Build a stable Y-up camera basis from the view direction alone, ignoring
  // any roll that TrackballControls may have accumulated. This keeps the gizmo
  // visually upright even when the camera has rolled.
  function getCameraBasis(camera: THREE.Camera) {
    const fwd = new THREE.Vector3();
    (camera as THREE.PerspectiveCamera).getWorldDirection(fwd);
    const wUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, wUp).normalize();
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0); // camera pointing straight up/down
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    return { fwd, right, up };
  }

  function projectToScreen(worldDir: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): [number, number] {
    return [
      HALF + worldDir.dot(right) * CUBE_R,
      HALF - worldDir.dot(up) * CUBE_R,
    ];
  }

  function cubeTheme() {
    const canvas = graph3dSolidColor(graphThemeColor("--orbit-graph-canvas", "#101010"), "#101010");
    const accent = graph3dSolidColor(graphThemeColor("--omarchy-accent", "#20b8a5"), "#20b8a5");
    const fg = graph3dSolidColor(graphThemeColor("--omarchy-fg", "#e5edf4"), "#e5edf4");
    return {
      shell: withAlpha(graph3dBlend(canvas, accent, 0.14), 0.72),
      stroke: withAlpha(graph3dBlend(fg, accent, 0.20), 0.26),
      label: graph3dBlend(fg, accent, 0.08),
      face: (token: string, backFace: boolean) => {
        const base = graph3dSolidColor(graphThemeColor(token, accent), accent);
        return backFace
          ? graph3dBlend(base, canvas, 0.54)
          : graph3dBlend(base, fg, 0.08);
      },
    };
  }

  function draw() {
    const camera = camApi.camera?.();
    if (!camera) return;
    const { fwd, right, up } = getCameraBasis(camera);

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    const theme = cubeTheme();

    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF - 1, 0, Math.PI * 2);
    ctx.fillStyle = theme.shell;
    ctx.fill();
    ctx.restore();

    const projected = FACES.map((face) => {
      const depth = -face.normal.dot(fwd); // positive = facing camera
      const pts = face.v.map((i) => {
        const v = new THREE.Vector3(VERTS[i][0], VERTS[i][1], VERTS[i][2]);
        return projectToScreen(v, right, up);
      });
      return { pts, depth, label: face.label, color: theme.face(face.token, depth <= -0.05) };
    });
    projected.sort((a, b) => a.depth - b.depth); // back to front

    for (const { pts, depth, label, color } of projected) {
      const visible = depth > -0.05;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.globalAlpha = visible ? 0.88 : 0.26;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = theme.stroke;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      if (visible) {
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = theme.label;
        ctx.font = "bold 9px IBM Plex Sans, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, cx, cy);
      }
      ctx.restore();
    }
  }

  function loop() {
    draw();
    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);

  function onClick(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - HALF;
    const my = e.clientY - rect.top - HALF;
    if (Math.hypot(mx, my) > HALF) return;

    const camera = camApi.camera?.();
    if (!camera) return;
    const { fwd, right, up } = getCameraBasis(camera);

    let best: (typeof FACES)[0] | null = null;
    let bestScore = -Infinity;
    for (const face of FACES) {
      const depth = -face.normal.dot(fwd);
      if (depth < 0) continue;
      const sx = face.normal.dot(right) * CUBE_R;
      const sy = -face.normal.dot(up) * CUBE_R;
      const score = depth - Math.hypot(mx - sx, my - sy) * 0.018;
      if (score > bestScore) { bestScore = score; best = face; }
    }
    if (!best) return;

    const controls = graph3dControls(graph) as (OrbitGraph3DControls & { target?: THREE.Vector3 }) | undefined;
    const target = controls?.target
      ? { x: controls.target.x, y: controls.target.y, z: controls.target.z }
      : { x: 0, y: 0, z: 0 };
    const dist = camera.position.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
    const n = best.normal;
    graph.cameraPosition(
      { x: target.x + n.x * dist, y: target.y + n.y * dist, z: target.z + n.z * dist },
      target,
      480,
    );
  }

  // Drag-to-rotate: dragging the cube rotates the main 3D graph the same way
  // real 3D apps (Blender, Maya) do. We convert the 2D drag delta into
  // spherical-coordinate offsets applied to the camera position.
  let dragStart: { x: number; y: number } | null = null;
  const DRAG_SPEED = 0.007;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragStart = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragStart) return;
    e.stopPropagation();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    dragStart = { x: e.clientX, y: e.clientY };

    const camera = camApi.camera?.();
    if (!camera) return;
    const controls = graph3dControls(graph) as (OrbitGraph3DControls & { target?: THREE.Vector3 }) | undefined;
    const target = controls?.target ?? new THREE.Vector3(0, 0, 0);

    const offset = camera.position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= dx * DRAG_SPEED;
    spherical.phi -= dy * DRAG_SPEED;
    spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
    const newOffset = new THREE.Vector3().setFromSpherical(spherical);
    graph.cameraPosition(
      { x: target.x + newOffset.x, y: target.y + newOffset.y, z: target.z + newOffset.z },
      { x: target.x, y: target.y, z: target.z },
      0,
    );
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragStart) return;
    dragStart = null;
    canvas.style.cursor = "grab";
    canvas.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  }

  canvas.style.cursor = "grab";
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  return () => {
    cancelAnimationFrame(animFrameId);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  };
}

export function graph3dChildPosition(
  parent: GraphDisplayNode,
  heading: number,
  yaw: number,
  index: number,
  siblingCount: number,
  radius: number,
  depth: number,
  kind: "branch" | "preview",
) {
  const forward = new THREE.Vector3(Math.cos(heading), Math.sin(heading), 0).normalize();
  const right = new THREE.Vector3(-Math.sin(heading), Math.cos(heading), 0).normalize();
  const up = new THREE.Vector3(0, 0, 1);
  const golden = (index * 0.61803398875) % 1;
  const normalized = siblingCount <= 1 ? 0.5 : index / Math.max(1, siblingCount - 1);
  const pitchSpan = kind === "branch" ? 0.74 : 0.48;
  const pitch = (normalized - 0.5) * pitchSpan + (golden - 0.5) * (kind === "branch" ? 0.24 : 0.34);
  const fan = forward.clone().multiplyScalar(Math.cos(yaw));
  fan.add(right.clone().multiplyScalar(Math.sin(yaw)));
  fan.multiplyScalar(Math.cos(pitch));
  fan.add(up.clone().multiplyScalar(Math.sin(pitch)));
  fan.normalize();
  const zCompression = kind === "branch" ? 0.86 : 0.58;
  const parentZ = parent.z3d ?? 0;
  return {
    x: parent.x + fan.x * radius,
    y: parent.y + fan.y * radius,
    z: parentZ + fan.z * radius * zCompression + (depth % 2 === 0 ? 18 : -12),
  };
}

