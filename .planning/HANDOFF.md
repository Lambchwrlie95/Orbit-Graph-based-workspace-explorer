# Orbit Developer Handoff

**Updated:** 2026-05-01
**Status:** Stabilizing after graph-first workbench, Phase 8 inspector integration, and typed command-boundary cleanup
**Current call:** Keep investing in Orbit as the product, using `/home/lamb/Projects/graph-file-manager` as the reliability/UI reference.

## Current Baseline

- `npm run commands:check` passes and confirms the frontend command catalog matches Rust `generate_handler`.
- `npm run frontend:smoke` passes against `http://127.0.0.1:1420/`.
- `npm run frontend:build` passes after the graph-only workbench refactor and command-boundary cleanup.
- `cargo test` passes 12/12.
- `cargo clippy --all-targets -- -D warnings` passes.
- Headless Chromium screenshot at 1440x900 confirms the current layout: top menu, left tool/bookmark sidebar, graph-only center, and right inspector/code sidebar.
- Frontend dev server was started on `http://127.0.0.1:1420/` for the Chromium smoke screenshot.
- Recent `~/.local/share/orbit/app.log` entries were checked after the error sweep; no new runtime error lines were present in the tail, only startup, graph load, and scan activity.

## What Changed In The Latest Passes

- Restored build health by fixing Rust raw-string regex syntax in `src-tauri/src/code_analyzer.rs`.
- Fixed additional backend test blockers in `src-tauri/src/git_status.rs`.
- Added missing Rust test-only dependencies in `src-tauri/Cargo.toml`.
- Reworked Orbit's visual style toward the older `graph-file-manager` workbench: compact chrome, dense panes, flatter dark UI, responsive pane collapse, and bottom status bar.
- Replaced the old graph component with a richer graph-first surface in `frontend/src/components/GraphView.tsx`.
- Fixed a runtime Graphology crash where duplicate edges for the same source/target pair caused `Graph.addEdgeWithKey` to throw; `GraphView.tsx` now deduplicates visible edge pairs and defensively skips already-added pairs.
- Added `frontend/src/components/ErrorBoundary.tsx` and wrapped the graph surface so a future graph render/runtime exception shows a recoverable graph error panel instead of crashing the whole React tree.
- Reworked the app shell around the graph-file-manager reference:
  - `frontend/src/components/UnifiedHeader.tsx` now provides a thin top menu with File/View/Run/Panels popovers and compact right-side controls.
  - `frontend/src/main.tsx` keeps the center pane graph-only. Explorer, Search, Assets, and Status live in the left sidebar; Inspector and Code live in the right sidebar.
  - Graph node folder focus and search-result folder open now route to the Explorer side panel instead of replacing the graph center.
  - `frontend/src/components/BookmarksPanel.tsx` restores workspace bookmarks with basename-only labels, internal full-path values, localStorage persistence, and a 12-item cap.
  - `frontend/src/components/Inspector.tsx` owns preview actions, image previews, line-numbered text/code previews, code analysis, and image analysis in the right sidebar.
  - `frontend/src/hooks/useImageAnalysis.ts` and `frontend/src/components/inspector/ImageAnalysisPanel.tsx` call the existing image metadata/color commands and display dimensions, aspect, format, size, and dominant colors.
  - `frontend/src/components/CodeMode.tsx` had a `humans.txt` editable-file typo fixed.
  - `frontend/src/types/index.ts` no longer declares `GraphNode` twice.
- Completed a Rust error sweep:
  - Registered the file edit, batch code analysis, git status, and operation stats Tauri commands that frontend/Phase 8 code can call.
  - Wired `analyze_code_file` through SQLite-backed cached analysis when a file has already been indexed.
  - Added git diff additions/deletions to file git status.
  - Cleared stale code-analysis rows during workspace scans before re-indexing.
  - Removed or justified unused/dead backend paths until `clippy --all-targets -- -D warnings` is clean.
- Updated planning docs so completion claims are more honest: build/test is green, but smoke/UAT coverage is still pending.
- Added `frontend/src/lib/tauriCommands.ts` as the typed frontend boundary for every Tauri command used by Orbit.
- Migrated raw frontend `invoke(...)` calls to `tauriInvoke(...)` so command names, arguments, and results are checked in one place.
- Extended `frontend/src/types/index.ts` with shared command-result types for code analysis, git status, image analysis, thumbnails, and operation stats.
- Added `scripts/check-tauri-commands.mjs` and `npm run commands:check` to catch frontend/Rust command registration drift.
- Added `scripts/smoke-frontend.mjs` and `npm run frontend:smoke` for a baseline Chromium render check of the workbench shell.

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
- `frontend/src/components/UnifiedHeader.tsx` - reference-style top menu and compact panel/file actions.
- `frontend/src/components/BookmarksPanel.tsx` - local workspace bookmarks.
- `frontend/src/main.tsx` - app shell, graph-only center, left/right side-panel routing, graph loading, selected path propagation, status bar.
- `frontend/src/components/Inspector.tsx` - right sidebar details, previews, image analysis, and code analysis.
- `frontend/src/lib/tauriCommands.ts` - typed frontend Tauri command catalog and wrapper.
- `frontend/src/styles.css` - workbench and graph styling.
- `scripts/check-tauri-commands.mjs` - command catalog drift check.
- `scripts/smoke-frontend.mjs` - baseline browser smoke check.
- `src-tauri/src/graph.rs` - graph query, caps, clustering, backend positions.
- `src-tauri/src/code_analyzer.rs` - code import/export extraction; recently fixed compile/test issues.
- `src-tauri/src/git_status.rs` - git status helper; recently fixed git2 API/test issues.
- `.planning/STATE.md` - current project state.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` - updated with validation caveats.

## Dirty Worktree Note

The worktree contains changes from before and during the latest pass. Do not reset blindly.

Known dirty areas after this pass:

- UI/frontend: `Inspector.tsx`, `main.tsx`, `styles.css`, `UnifiedHeader.tsx`, `BookmarksPanel.tsx`, image-analysis hook/panel, and existing frontend changes from earlier passes.
- Types/editor cleanup: `frontend/src/types/index.ts` and `frontend/src/components/CodeMode.tsx`.
- Command boundary and checks: `frontend/src/lib/tauriCommands.ts`, migrated frontend invoke sites, `scripts/check-tauri-commands.mjs`, `scripts/smoke-frontend.mjs`, and `package.json`.
- Planning/docs: `STATE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, this handoff, and `docs/WORKBENCH.md`.
- Untracked `docs/.codex` is present in the workspace and was not edited in this pass.
- Do not reset blindly; inspect `git status --short` first.

## Next Best Work

1. Add deeper smoke tests around scan, graph load, thumbnail/image commands, bookmarks persistence, top-menu actions, and side-panel routing.
2. Run the app against a real project root and inspect graph quality after scanning.
3. Finish Phase 8 markdown analysis: links, backlinks, heading outline, and markdown preview split behavior.
4. Continue graph polish with real data: relationship edges, clustering behavior, selection routing, minimap usefulness.
5. Persist graph preferences: layout, labels, focus mode, filters.
