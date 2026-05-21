
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
# Claude Handoff — Orbit graph ideas pass

Date: 2026-05-21
Repo: `/home/lamb/Projects/Orbit-Graph-based-workspace-explorer`

## User intent

Charlie is about to hit Codex usage limits. Continue the Orbit graph pass using the examples in:

`resources-ideas/graph-ideas/`

The user will unlock the desktop later for real visual verification. Do not claim the graph is visually fixed until a real Tauri screenshot shows Orbit, not the lock screen/browser-only preview.

## Critical product direction

Orbit graph should feel like a graph-native planet/world workspace:

- clean fill-the-world constellation
- folder hubs / anchors
- branching rays and readable labels
- negative space / no overlap
- no random force hairball, no global donut/ring clutter, no halos/glow blobs
- 3D mode should use real `3d-force-graph` / Three.js, not Sigma projected pseudo-3D
- for 3D: folders are chunky solid anchors; files/proxies are close satellites; short links; click-to-focus; orbit controls; pin/drag; pause/resume; collision

Load/read this skill before editing: Hermes `orbit-graph-development`.

## Current dirty state

At handoff time the working tree already has intentional uncommitted work beyond GraphView:

- `frontend/src/components/GraphView.tsx` — current graph pass
- `frontend/src/components/Inspector.tsx`
- `frontend/src/components/inspector/NotesPanel.tsx`
- `frontend/src/components/inspector/OutgoingLinksPanel.tsx` — new file
- `frontend/src/lib/tauriCommands.ts`
- `frontend/src/styles.css`
- `src-tauri/src/commands/notes.rs`
- `src-tauri/src/db.rs`
- `src-tauri/src/main.rs`

Do not reset these blindly. Preserve the notes/wikilink work unless the user explicitly says otherwise.

## What Codex/Hermes already applied in GraphView

Current GraphView changes include:

1. Dedicated `graph3dLayout(nodes, edges)`
   - Uses hierarchy.
   - Folders branch as parent-local arms.
   - Files/clusters/proxies become close local satellites / arc lanes.
   - Sets `projectionScale: 1` and `z3d` so `buildGraph3DData` does not double-scale native 3D layout.

2. 3D force tuning
   - Link distance function exists: `graph3dLinkDistance`.
   - Stronger chunkier node sizes and solid Three shapes.
   - D3 link/charge/collide force tuning added.
   - Additional custom `createGraph3DCollisionForce()` was added to mimic the collision example.

3. 3D idea examples partially integrated
   - `click-to-focus.html` → `focusGraph3DNode()` and `onNodeClick` camera movement.
   - `orbit-controls.html` → `controlType: "orbit"` and damping/auto-rotate setup.
   - `fit-graph-to-canvas.html` → `zoomToFit` in Fit button and engine stop.
   - `highlight-node-links.html` → hover/selected node and link dimming/color refresh.
   - `pin-node-mode.html` → drag-end can set `fx/fy/fz`; UI pin toggle now started.
   - `pause-resume-animation.html` → Pause/Play UI started.
   - `node-colition-detection-trashed-files-idea.html` → custom 3D collision force added.
   - `manipulate-link-force-distance-good-idea.html` → edge-type distance function already used.

4. 2D radial/tree improvements already exist from previous pass
   - Vega-like tree/radial tidy logic.
   - `relaxRadialVisualFootprints` no-overlap pass.
   - Proxy/cluster icon handling to avoid noisy glyph piles.

## Immediate TODO for Claude

First task: re-run validation after any new edits. The TypeScript build passed after this handoff was written, but keep this as the first check after further changes.

Run:

```bash
npm run --prefix frontend build
```

Earlier expected issues, now checked once:

- `Graph3DNode` currently extends `NodeObject`; assigning `vx/vy/vz` in `createGraph3DCollisionForce()` compiled under the current dependency types. If dependency types change, add explicit fields:
  - `vx?: number; vy?: number; vz?: number;`
- `ForceGraph3DInstance` type may not expose `pauseAnimation`, `resumeAnimation`, or `d3ReheatSimulation`; current code casts to `unknown` for these.
- `createGraph3DCollisionForce()` uses `Number(a.id)`; ids are stringified numeric ids now, but safer fallback may be needed if future IDs become nonnumeric.
- `graph-icon-btn active` CSS has now been added in `frontend/src/styles.css`.

Then run full verification:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run commands:check
npm run --prefix frontend build
npm run frontend:smoke
git diff --check
```

Latest verification before handoff update: all commands above passed. Note: plain `cargo fmt` from repo root fails because `Cargo.toml` lives under `src-tauri/`; use `--manifest-path`.

## Suggested Claude model routing

Use Claude Code print mode unless you need iterative screenshots.

- `claude-sonnet-4-6` / alias `sonnet`: best default for finishing TS/Rust integration and fixing build errors.
  - Command shape:
    `claude -p "<task>" --model sonnet --effort high --allowedTools "Read,Edit,Write,Bash" --max-turns 10`
- `claude-opus-4-6` or newest Opus offered by `/model`: use for hard visual-layout reasoning, graph architecture decisions, or reviewing whether the 3D layout matches the product direction.
  - Command shape:
    `claude -p "Review GraphView 3D layout vs product target; suggest/fix surgical changes" --model opus --effort max --allowedTools "Read,Edit,Bash" --max-turns 8`
- `claude-haiku-4-5` / alias `haiku`: use for cheap mechanical tasks only: summarize diffs, update docs, scan files, small CSS tweaks.
  - Command shape:
    `claude -p "Update handoff/docs to reflect current changes" --model haiku --effort low --allowedTools "Read,Edit" --max-turns 4`

## Suggested Claude tasks

1. **Build-fix pass** — Sonnet/high
   - Fix TS/Rust compilation from current dirty tree.
   - Do not redesign layout unless necessary.

2. **3D ideas completion pass** — Sonnet/high or Opus/max
   - Finish pause/resume and pin/unpin UI polish.
   - Ensure collision force is bounded/performance-safe.
   - Ensure hover neighbor highlighting is obvious but not glow/halo-based.

3. **Visual review after unlock** — Opus/max if available
   - Launch Tauri app, use actual desktop screenshots.
   - Check screenshot is Orbit graph, not lock screen.
   - Iterate until 3D is chunky/readable and 2D remains clean.

4. **Final verification + summary** — Sonnet/high
   - Run full verification commands above.
   - Produce concise summary of changed files and remaining risks.

## Do not do

- Do not reset `GraphView.tsx` or other dirty files without inspecting diffs.
- Do not claim visual quality is verified from browser-only Vite preview.
- Do not add halos/glow as the readability mechanism.
- Do not convert 3D back into flattened 2D Sigma/projection.
