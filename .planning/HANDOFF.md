# Orbit Developer Handoff

**Updated:** 2026-04-30  
**Status:** Stabilizing before Phase 8  
**Current call:** Keep investing in Orbit as the product, using `/home/lamb/Projects/graph-file-manager` as the reliability/UI reference.

## Current Baseline

- `npm run frontend:build` passes.
- `cargo test` passes 12/12 without warnings.
- `cargo clippy --all-targets -- -D warnings` passes.
- Frontend dev server was started on `http://127.0.0.1:1421/` because port `1420` was already in use.
- Wide and narrow Chromium screenshots were checked after the UI/graph changes.
- Recent `~/.local/share/orbit/app.log` entries were checked after the error sweep; no new runtime error lines were present in the tail, only startup, graph load, and scan activity.

## What Changed In The Latest Passes

- Restored build health by fixing Rust raw-string regex syntax in `src-tauri/src/code_analyzer.rs`.
- Fixed additional backend test blockers in `src-tauri/src/git_status.rs`.
- Added missing Rust test-only dependencies in `src-tauri/Cargo.toml`.
- Reworked Orbit's visual style toward the older `graph-file-manager` workbench: compact chrome, dense panes, flatter dark UI, responsive pane collapse, and bottom status bar.
- Replaced the old graph component with a richer graph-first surface in `frontend/src/components/GraphView.tsx`.
- Fixed a runtime Graphology crash where duplicate edges for the same source/target pair caused `Graph.addEdgeWithKey` to throw; `GraphView.tsx` now deduplicates visible edge pairs and defensively skips already-added pairs.
- Added `frontend/src/components/ErrorBoundary.tsx` and wrapped the graph surface so a future graph render/runtime exception shows a recoverable graph error panel instead of crashing the whole React tree.
- Moved mode navigation out of the central/top bar:
  - Graph, Explorer, Assets, and Search now live in the left sidebar.
  - Code now lives as a code tab in the right inspector sidebar.
  - The main surface is reserved for the active work view, with no mode tabs in the middle.
- Completed a Rust error sweep:
  - Registered the file edit, batch code analysis, git status, and operation stats Tauri commands that frontend/Phase 8 code can call.
  - Wired `analyze_code_file` through SQLite-backed cached analysis when a file has already been indexed.
  - Added git diff additions/deletions to file git status.
  - Cleared stale code-analysis rows during workspace scans before re-indexing.
  - Removed or justified unused/dead backend paths until `clippy --all-targets -- -D warnings` is clean.
- Updated planning docs so completion claims are more honest: build/test is green, but smoke/UAT coverage is still pending.

## Graph State

The graph should be treated as Orbit's most polished surface.

Current graph features:

- Stable Sigma renderer lifecycle; hover no longer recreates the renderer.
- Duplicate source/target edge pairs are deduped before insertion into Graphology.
- A graph-local error boundary prevents GraphView exceptions from taking down the app shell.
- Layout modes: Orbit, Tree, Force.
- Graph filter input.
- Toggles for folders, files, labels, and focus/dim unrelated nodes.
- Rich graph stats overlay.
- Legend.
- Minimap, hidden when there is no graph data.
- Zoom, fit, and selected-node focus controls.
- Hover detail card.
- Selection sync from app state via `selectedPath`.
- Responsive behavior for narrow screens.

Next graph priorities:

- Add real relationship edge richness: imports, markdown links/backlinks, duplicate/similarity, tags, assets.
- Persist graph preferences: layout mode, labels, focus mode, filters.
- Add smoke tests for graph load and mode toggles.
- Validate with real scanned project data, not just empty graph screenshots.
- Keep graph requests root-scoped end to end: frontend invoke -> Tauri command -> graph builder -> watcher/cache refresh.

## Important Files

- `frontend/src/components/GraphView.tsx` - primary graph UI and interaction surface.
- `frontend/src/components/ModeSwitcher.tsx` - reusable sidebar mode switcher with a filtered mode list.
- `frontend/src/main.tsx` - app shell, graph loading, selected path propagation, status bar.
- `frontend/src/components/Inspector.tsx` - right sidebar details and Code mode entry.
- `frontend/src/styles.css` - workbench and graph styling.
- `src-tauri/src/graph.rs` - graph query, caps, clustering, backend positions.
- `src-tauri/src/code_analyzer.rs` - code import/export extraction; recently fixed compile/test issues.
- `src-tauri/src/git_status.rs` - git status helper; recently fixed git2 API/test issues.
- `.planning/STATE.md` - current project state.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` - updated with validation caveats.

## Dirty Worktree Note

The worktree contains changes from before and during the latest pass. Do not reset blindly.

Known dirty areas include:

- UI/frontend: `AssetMode.tsx`, `GraphView.tsx`, `Inspector.tsx`, `MonacoEditor.tsx`, `main.tsx`, `styles.css`.
- Packages/config: `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`.
- Backend: `code_analyzer.rs`, `db.rs`, `git_status.rs`.
- Planning: `STATE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, plus this handoff.
- Untracked local automation artifacts: `.aionrs/`.
- Untracked Phase 7 summary: `.planning/phases/07-asset-mode/07-03-SUMMARY.md`.

## Next Best Work

1. Add smoke tests around scan, graph load, thumbnail/image commands, and UI mode flows.
2. Run the app against a real project root and inspect graph quality after scanning.
3. Continue graph polish with real data: relationship edges, clustering behavior, selection routing, minimap usefulness.
4. Persist graph preferences: layout, labels, focus mode, filters.
5. Then execute Phase 8 Code Mode & Enhanced Inspector from a green baseline.
