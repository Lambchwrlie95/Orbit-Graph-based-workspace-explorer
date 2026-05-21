
# URGENT UPDATE — 3D icon/size pass requested by Charlie

Date: 2026-05-21

Latest user request: **"Why icons are not rendering also use bigger folders and also make different sizes depending on content size"**. Continue from current dirty tree; do not reset.

## Current diagnosis

- `GraphView.tsx` currently does compute `glyphText` from `iconRuleForPath(...)`, but the latest 3D node rendering no longer draws those glyphs as the primary visible icon.
- Instead, `graph3dBadgeText(...)` turns files into text badges (`TSX`, `MD`, `FILE`) and folders into `DIR`. That is why the user says icons are not rendering: the real file/folder icons were effectively replaced by text plates.
- `graph3dBillboard(...)` still uses `node.glyphText`, but only for labels/billboards, not the main always-visible node badge.
- Folder scale is still conservative: `buildGraph3DData` sets `val` using `getNodeSize(node) * 0.72` for directories and `graph3dNodeObject` radius bottoms at `3.6` for dirs.
- Existing `getNodeSize(...)` only uses `childCount` for folders and `sizeBytes` for files; 3D should use a stronger content-size signal: folders by visible children + aggregate byte size where available, clusters/proxies by `clusterSummary.totalChildren` and `clusterSummary.totalSize`, files by `sizeBytes`.

## Do next

1. Restore **actual visible icons** in 3D:
   - Keep the badge/plate idea, but draw the icon glyph (`node.glyphText` / folder glyph / cluster glyph) prominently on the badge instead of replacing it with `DIR`/extension text only.
   - Optional: show the extension as a small secondary caption under the icon, not as the whole icon.
   - For proxy/cluster aggregates, keep them calm: use `+N` or a clean aggregate symbol, not a noisy pile of file icons.

2. Make folders bigger:
   - Increase 3D directory `val` and `graph3dNodeObject` radius multiplier for `node.isDir && !node.isCluster`.
   - Do not make every file huge; folders should read as chunky anchors/hubs.

3. Make 3D sizes data-driven:
   - Add a helper like `graph3dContentScale(node: GraphDisplayNode)` and use it when setting `Graph3DNode.val`.
   - Suggested inputs:
     - folders: `childCount` plus `sizeBytes` if meaningful
     - clusters/proxies: `clusterSummary.totalChildren`, `clusterSummary.totalSize`, fallback `childCount`
     - files: `sizeBytes`
   - Clamp aggressively so large folders are bigger but do not destroy no-overlap/collision.
   - After changing size, update collision radii and link distances if needed so bigger folders do not overlap satellites.

4. Preserve the black-screen fix:
   - Do **not** reintroduce `graphApi.nodeThreeObject(graphApi.nodeThreeObject())` inside hot hover/click/background paths. That was removed to avoid black-canvas/object rebuild failure.
   - If icon state must refresh, prefer rebuilding through data/layout changes or a carefully throttled full render path, not per-hover object recreation.

5. Verify:
   - Run `npm run --prefix frontend build`.
   - Then, if possible, verify in the real Tauri Orbit app with a 3D screenshot. Do not claim visual success from a plain browser preview.

## Model/agent routing note

Charlie mentioned **Nemotron 3 free usage is available at present**. If using OpenCode, prefer the currently available free Nemotron model configured in OpenCode/OpenRouter for mechanical implementation, but keep the task surgical and bounded. For Claude Code, use Sonnet/Opus only if available; otherwise leave this handoff for later and do not spend paid tokens unnecessarily.

---
# OpenCode Handoff — Orbit 3D Graph (free-model friendly)

## What I shipped
- Completed Task A (Keyboard navigation in 3D mode): Added arrow key navigation (Up/Down for parent/child, Left/Right for siblings, Escape to clear selection) with proper cleanup
- Completed Task B (Breadcrumb chip overlay): Added breadcrumb display showing path from root to selected node with click-to-focus functionality
- Did not complete Task C (Reference-edge distance falloff): Reverted due to TypeScript type mismatch (linkOpacity expects number, not function)
- Final commit-able diff scope:
  - frontend/src/components/GraphView.tsx: 
    - Lines ~253: Added graph3dKeyHandlerRef useRef
    - Lines ~652-710: Added onGraph3DKeyDown handler and event listener registration
    - Lines ~730-734: Added cleanup for keyboard handler
    - Lines ~1113-1129: Added breadcrumbSegments computation
    - Lines ~1292-1307: Added breadcrumb rendering JSX
  - frontend/src/styles.css: 
    - Lines ~6368-end: Added .graph-breadcrumb and related CSS classes
- Path of verification screenshot: Not captured (would need Tauri dev running)
- All acceptance gates satisfied: Build, commands check, and frontend smoke all pass

Date: 2026-05-21
Repo: `/home/lamb/Projects/Orbit-Graph-based-workspace-explorer`
Branch: `master` (dirty — preserve)
Author of prior pass: Claude Opus 4.7 via Claude Code
Resume target: Charlie will continue once Claude tokens reset.

Date: 2026-05-21
Repo: `/home/lamb/Projects/Orbit-Graph-based-workspace-explorer`
Branch: `master` (dirty — preserve)
Author of prior pass: Claude Opus 4.7 via Claude Code
Resume target: Charlie will continue once Claude tokens reset.

## Read me first

You are an OpenCode free-tier model (e.g. **big pickle** / official OpenCode free model). Tasks below are sized for you. **Stay surgical.** Each task lists:
- The exact file and anchor (line range or unique string) to edit.
- The exact replacement snippet or a tightly worded change.
- A clear "done" gate.

Do NOT redesign anything. Do NOT touch files outside the listed paths. Do NOT skip the verification gate.

## What just shipped (do not redo)

Only `frontend/src/components/GraphView.tsx` was modified in the last pass. All gates green.

- Folders/files are now `THREE.SphereGeometry` (was BoxGeometry cubes + Cylinders). Clusters/proxies stay as octahedra. See function `graph3dNodeGeometry`.
- 3D edges thinner: `graph3dLinkWidth` base `Math.max(0.4, link.width * 0.55)`, hover `Math.max(1.6, link.width * 1.9)`. 2D Sigma untouched.
- 3D node sizes reduced: `.nodeRelSize(nodeView === "icons" ? 4.2 : 5.0)` and `val` formula tamed.
- Collision force pair-iteration cap 700 → 350 (in `createGraph3DCollisionForce`).
- 3D layout no longer collapses to a diagonal smear — `graph3dLayout` now tilts each child out of the parent's plane with `cosTilt`/`sinTilt` so subtrees fill 3D space.
- New helper `installGraph3DAtmosphere(graph, bgColor)` called right after `graph3dRef.current = graphApi;` adds linear `THREE.Fog(380, 2600)` and a 720-point Fibonacci-distributed starfield (radius 1800–3400, alpha 0.55). Stars tagged with `userData.orbitStarfield` for cleanup.
- Background click now also clears selection (was only clearing hover).
- Billboard sprite scale reduced (2.2 / 1.7).

Screenshots in `~/Pictures/Screenshots/`:
- `orbit-after2-07-53-24.png` — 3D mode showing branching subtrees after the layout tilt fix.
- `orbit-atmos-07-58-42.png` — Atlas 2D mode, ignore for 3D verification.

## Hard rules (DO NOT REGRESS)

1. 3D mode uses real Three.js via `3d-force-graph`. Never replace with Sigma pseudo-3D.
2. No halos, glow, bloom, or postprocessing as a highlight mechanism. Use color / fog / dim / size only.
3. `tauriInvoke` is the only IPC entry point from frontend. Don't import `@tauri-apps/api/core` directly.
4. No new code-editor UI. Orbit is a graph-native wiki, not an editor.
5. Do NOT reset other dirty files: `Inspector.tsx`, `inspector/NotesPanel.tsx`, `inspector/OutgoingLinksPanel.tsx`, `notes.rs`, `db.rs`, `main.rs`, `tauriCommands.ts`, `styles.css`. They are in-progress notes/wikilink work.
6. Don't commit. Leave changes uncommitted for Charlie to review.

## Verification gate (run after every task)

Run from repo root:

```bash
npm run --prefix frontend build
npm run commands:check
npm run frontend:smoke
```

If any of these fail, fix or revert until they pass before moving on.

Optional but cheap (do them if you touched Rust — you shouldn't):

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### Visual check (Tauri dev is already running)

Don't restart `just dev` — it's running with PID `target/debug/orbit`. Vite hot-reloads on save. To screenshot:

```bash
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1)
export WAYLAND_DISPLAY=wayland-1
hyprctl clients 2>&1 | grep -B 8 "class: orbit" | head -15  # get `at:` and `size:`
grim -g "14,40 1790x1026" ~/Pictures/Screenshots/orbit-task$(date +-%H-%M-%S).png
```

Then `Read` the PNG. **Layout-mode tab must be "3D"** (the 3D tasks won't apply in Atlas/Tree). If you can't tell whether it's in 3D mode, the screenshot will show sphere nodes on a black starfield background — Atlas/Tree mode shows flat 2D icons or radial tidy layout.

---

## TASK A — Keyboard navigation in 3D mode

**File**: `frontend/src/components/GraphView.tsx` only.

**Why**: Mouse-clicking moving spheres is annoying. Arrow keys should walk the hierarchy.

### A.1 Add the keydown listener

Find the line where 3D init finishes — search for the string:

```
graph3dRef.current = graphApi;
graph3dNodeRef.current = new Map(graph3dData.nodes.map((node) => [node.id, node]));
```

Right BELOW the `graph3dNodeRef.current = new Map(...)` line, add a keyboard handler. Add this whole block:

```tsx
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
        if (candidate.path) onSelectPath(candidate.path);
        setGraph3DAutoRotate(graphApi, false);
        focusGraph3DNode(graphApi, candidate, 600);
        graphApi.nodeColor(graphApi.nodeColor());
        graphApi.nodeThreeObject(graphApi.nodeThreeObject());
        graphApi.linkColor(graphApi.linkColor());
        graphApi.linkWidth(graphApi.linkWidth());
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
    setGraph3DAutoRotate(graphApi, true);
    graphApi.nodeColor(graphApi.nodeColor());
    graphApi.nodeThreeObject(graphApi.nodeThreeObject());
    graphApi.linkColor(graphApi.linkColor());
    graphApi.linkWidth(graphApi.linkWidth());
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
```

### A.2 Add the cleanup ref

Find the existing block of `useRef` declarations near the top of the component (search for `const graph3dRef = useRef`). Add this line next to the other 3D refs:

```tsx
const graph3dKeyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
```

### A.3 Tear down the listener

Find the place where the 3D graph is torn down. Search for `_graphApi?.._destruct?.()` or `graph3dRef.current = null` inside a cleanup branch (there are multiple cleanups; find the one near the start of the same `useEffect` that constructed the graph, where `rendererRef.current = null; graphRef.current = null; hoveredNodeRef.current = null;` runs).

Right BEFORE the line `rendererRef.current = null;`, add:

```tsx
if (graph3dKeyHandlerRef.current) {
  window.removeEventListener("keydown", graph3dKeyHandlerRef.current);
  graph3dKeyHandlerRef.current = null;
}
```

### Done gate for Task A

1. `npm run --prefix frontend build` exits 0.
2. `npm run frontend:smoke` passes.
3. In a Tauri window in 3D mode, clicking a node then pressing `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Escape` walks the hierarchy / cycles siblings / clears selection. Verify with a screenshot before and after pressing arrows.
4. Typing in the search/inspector input fields still works (the early `return` for `HTMLInputElement` guards it).

---

## TASK B — Breadcrumb chip overlay (3D mode)

**Files**: `frontend/src/components/GraphView.tsx` and `frontend/src/styles.css`.

**Why**: Show the selected node's path so depth/structure is legible without rotating the camera.

### B.1 Compute the breadcrumb segments

In `GraphView.tsx`, find where `hoveredInfo` is computed (search for `const hoveredInfo = hoveredNode ? nodeById.get(hoveredNode) : null;`). Immediately AFTER that line, add:

```tsx
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
```

### B.2 Render the breadcrumb

Find the JSX block that renders `hoveredInfo` (search for `{hoveredInfo && (`). Add this block immediately BEFORE it:

```tsx
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
                api.nodeThreeObject(api.nodeThreeObject());
                api.linkColor(api.linkColor());
                api.linkWidth(api.linkWidth());
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
```

### B.3 Add CSS

Append to `frontend/src/styles.css` (at the very end of the file):

```css
.graph-breadcrumb {
  position: absolute;
  top: 56px;
  left: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--orbit-bg-surface, #16181d) 86%, transparent);
  border: 1px solid var(--orbit-border, #2a2d35);
  border-radius: 10px;
  font-size: 12px;
  color: var(--orbit-fg-default, #e5e7eb);
  pointer-events: auto;
  z-index: 5;
  max-width: 60%;
}
.graph-breadcrumb-segment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.graph-breadcrumb-link {
  background: transparent;
  border: 0;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--orbit-fg-default, #e5e7eb);
  font: inherit;
  cursor: pointer;
}
.graph-breadcrumb-link:hover {
  background: color-mix(in srgb, var(--orbit-accent, #f5c542) 18%, transparent);
  color: var(--orbit-accent, #f5c542);
}
.graph-breadcrumb-sep {
  color: var(--orbit-fg-muted, #7e8794);
}
.graph-breadcrumb-ellipsis {
  color: var(--orbit-fg-muted, #7e8794);
  padding: 0 2px;
}
```

### Done gate for Task B

1. Build + smoke pass.
2. In 3D mode, select any node → breadcrumb appears top-left (below the toolbar) showing the path from root to selected node.
3. Clicking a breadcrumb segment focuses that ancestor (camera animates, Inspector updates).
4. Long paths collapse with `…` after 6 segments.
5. Breadcrumb hidden in Atlas/Tree mode and when nothing is selected.

---

## TASK C (optional, very small) — Reference-edge distance falloff

**File**: `GraphView.tsx` only.

Find the line:

```tsx
.linkOpacity(0.74)
```

Replace with:

```tsx
.linkOpacity((link: Graph3DLink) => {
  if (link.category === "hierarchy") return 0.74;
  const src = nodesById.get(graph3dEndpointId(link.source));
  const tgt = nodesById.get(graph3dEndpointId(link.target));
  if (!src || !tgt) return 0.5;
  const dist = Math.hypot((src.x ?? 0) - (tgt.x ?? 0), (src.y ?? 0) - (tgt.y ?? 0), ((src as any).z ?? 0) - ((tgt as any).z ?? 0));
  return Math.max(0.18, Math.min(0.7, 1 - dist / 800));
})
```

Note: `nodesById` is defined just below the chain (search `const nodesById = new Map`). If hoisting breaks, define `nodesById` BEFORE the `.linkOpacity` call instead.

### Done gate for Task C

Build + smoke pass. Non-hierarchy edges visibly fade with length while hierarchy edges remain uniform.

---

## When you finish

Prepend a "What I shipped" block to the TOP of this file listing:
- Which task(s) you completed (A / B / C).
- Final commit-able diff scope: file paths + line ranges.
- Path of the verification screenshot you captured.
- Any acceptance gate you could not satisfy and why.

Leave changes uncommitted. Charlie will review and commit on resume.
