// Edge routing strategies.
//
// Edge ROUTING is separate from edge STYLE (color/size/program). Routing
// answers "what shape does the edge take in space?". Style answers "how
// thick is it, what color, what kind of stroke?". Keeping them apart lets
// us swap routing algorithms over time (LCA-biased now, true hierarchical
// bundling next, metro-style lanes later) without touching the per-edge
// vocabulary.
//
// The plan:
//   Phase 1 (this module)    — straight + lca-biased (single-control-point
//                              Sigma curves whose curvature is biased toward
//                              the source/target least-common-ancestor).
//   Phase 2 (future)          — hierarchical-bundled: walk both ancestor
//                              chains, emit multi-segment polyline through
//                              every ancestor up to the LCA so siblings
//                              with shared LCAs visibly share a "trunk".
//                              Requires a multi-segment edge program.
//   Phase 4 (future)          — metro: separate parallel lanes per edge
//                              category for dense graphs.
//
// EdgeRoute.controlPoints is left here so Phase 2 implementations can fill
// it without changing the public shape. Phase 1 leaves it undefined and
// Sigma renders via the @sigma/edge-curve single-arc program.

import type { GraphEdge } from "../types";

export type EdgeRoutingStrategy =
  | "straight"
  | "random"
  | "lca-biased"
  | "hierarchical-bundled"
  | "metro";

export const DEFAULT_EDGE_ROUTING_STRATEGY: EdgeRoutingStrategy = "lca-biased";

export type EdgeRoute = {
  /** Single-arc curvature used by `@sigma/edge-curve`. Range [-1, 1]. */
  curvature: number;
  /** Reserved for Phase 2+ multi-segment renderers. Always undefined today. */
  controlPoints?: { x: number; y: number }[];
};

export type EdgePosition = { x: number; y: number };

/**
 * Everything an edge routing strategy needs to know about the surrounding
 * graph. Built once per layout/render pass and reused across all edges.
 */
export type RoutingContext = {
  strategy: EdgeRoutingStrategy;
  /** Map node id → parent node id (in the containment hierarchy). */
  parentOf: Map<number, number>;
  /** Map node id → on-canvas position from the current layout. */
  positionOf: Map<number, EdgePosition>;
};

/** Single dispatch point — call this for every edge. */
export function computeEdgeRoute(edge: GraphEdge, ctx: RoutingContext): EdgeRoute {
  // Containment edges are the visual skeleton. They always travel straight
  // along the radial branch; curving them would smear the hierarchy line.
  if (edge.edgeType === "contains") return { curvature: 0 };

  switch (ctx.strategy) {
    case "straight":
      return { curvature: 0 };
    case "lca-biased":
      return computeLcaBiasedRoute(edge, ctx);
    case "hierarchical-bundled":
    case "metro":
      // Not implemented yet. Fall back to LCA-biased so the visual stays
      // sane; the caller can detect via strategy name if needed.
      return computeLcaBiasedRoute(edge, ctx);
    case "random":
    default:
      return computeRandomRoute(edge);
  }
}

/**
 * Walk up the containment chain starting at `nodeId` and return every
 * ancestor (including self) in order. Stops at root (no parent) or on
 * cycles. Reuses a small ancestors list per call — cheap enough to call
 * twice per edge.
 */
function ancestorPath(nodeId: number, parentOf: Map<number, number>): number[] {
  const path: number[] = [];
  const seen = new Set<number>();
  let cursor: number | undefined = nodeId;
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    path.push(cursor);
    cursor = parentOf.get(cursor);
  }
  return path;
}

/**
 * Return the lowest (most specific) common ancestor of two nodes in the
 * containment hierarchy, or `null` if they share no ancestor.
 */
function findLca(
  aPath: number[],
  bPath: number[],
): number | null {
  const aSet = new Set(aPath);
  for (const id of bPath) if (aSet.has(id)) return id;
  return null;
}

/**
 * LCA-biased single-arc routing.
 *
 * Conceptually: project the LCA's position onto the perpendicular of the
 * source→target line. The signed perpendicular distance becomes the curve's
 * concavity direction. Two edges that share an LCA see the same projection
 * sign, so their arcs lean toward the same side — visually "grouped"
 * without true multi-segment bundling.
 *
 * Magnitude is clamped to a moderate range so curves stay readable; very
 * long edges don't become extreme arcs. When LCA is missing (cross-root
 * edges or orphan nodes), we fall back to a small uniform curve.
 */
function computeLcaBiasedRoute(edge: GraphEdge, ctx: RoutingContext): EdgeRoute {
  const sourcePos = ctx.positionOf.get(edge.sourceId);
  const targetPos = ctx.positionOf.get(edge.targetId);
  if (!sourcePos || !targetPos) return { curvature: 0 };

  const sourceAncestors = ancestorPath(edge.sourceId, ctx.parentOf);
  const targetAncestors = ancestorPath(edge.targetId, ctx.parentOf);
  const lcaId = findLca(sourceAncestors, targetAncestors);
  const lcaPos = lcaId != null ? ctx.positionOf.get(lcaId) : undefined;

  if (!lcaPos) {
    // No common ancestor in this view (cross-root edge, or LCA not loaded).
    // A small fixed curve keeps the edge visually distinct from a straight
    // hierarchy line without picking an arbitrary direction.
    return { curvature: 0.18 };
  }

  // Midpoint of straight A→B line.
  const midX = (sourcePos.x + targetPos.x) / 2;
  const midY = (sourcePos.y + targetPos.y) / 2;

  // Vector from midpoint toward LCA.
  const dx = lcaPos.x - midX;
  const dy = lcaPos.y - midY;

  // Perpendicular to edge (rotated 90° CCW).
  const ex = targetPos.x - sourcePos.x;
  const ey = targetPos.y - sourcePos.y;
  const edgeLen = Math.sqrt(ex * ex + ey * ey) || 1;
  const px = -ey / edgeLen;
  const py = ex / edgeLen;

  // Signed offset along perpendicular = "how far off-axis is the LCA".
  // Normalized by edge length so the curvature is shape-invariant: an edge
  // 4× longer with an LCA 4× further away curves the same amount.
  const offset = (dx * px + dy * py) / edgeLen;

  // 0.45 = empirical magnitude factor. Below this, the curve is too subtle
  // to read as grouping; above it, edges turn into showy loops.
  const curvature = clamp(offset * 0.45, -0.6, 0.6);

  // Ensure even tiny offsets render as a visible curve, not a near-line.
  const minMagnitude = 0.08;
  if (Math.abs(curvature) < minMagnitude) {
    return { curvature: curvature < 0 ? -minMagnitude : minMagnitude };
  }
  return { curvature };
}

/**
 * Pre-LCA fallback: per-id hash → curvature. Edges go random directions
 * with random magnitudes. Kept so callers can opt back in for A/B testing
 * — not the default and not recommended.
 */
function computeRandomRoute(edge: GraphEdge): EdgeRoute {
  const hash = Math.sin(Math.abs(edge.id) * 78.233) * 43758.5453;
  const signedUnit = hash - Math.floor(hash) - 0.5; // -0.5 to +0.5
  const magnitude = 0.18 + Math.abs(signedUnit) * 0.6;
  return { curvature: signedUnit < 0 ? -magnitude : magnitude };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
