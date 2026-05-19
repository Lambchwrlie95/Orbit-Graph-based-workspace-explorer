# Orbit Handoff

## Current Direction

Orbit is a **graph-native workspace explorer / local knowledge map**. The app should help the user understand files, folders, notes, code relationships, and assets through a clean constellation graph plus Inspector-driven context.

Do **not** rebuild Code Mode. In-app editing is out of scope for the current direction.

## Current Baseline

- Repo: `/home/lamb/Projects/Orbit-Graph-based-workspace-explorer`
- Branch: `start`
- Frontend build: passing as of 2026-05-19
- Rust check: passing as of 2026-05-19
- Main visual direction: constellation map with folder hubs, branching rays, readable labels, and negative space
- User preference: no force-directed hairball, no global polar ring layout, no broad colored background halo wash

## Pivot Summary

Removed:

- Monaco editor integration
- Code Mode and editor tabs
- markdown editor/preview split
- `editorStore`
- `useOpenFiles`
- `read_file_for_edit` / `save_file` Tauri commands
- dead Code Mode/editor CSS

Kept / emphasized:

- Graph view as the core surface
- Inspector as the primary details panel
- read-only previews
- external open/edit actions through `$EDITOR` / `xdg-open`
- Wikipedia-style About panel
- graph relationship edges and filters

## Important Files

Frontend:

- `frontend/src/main.tsx` — app state, graph loading/navigation, main layout
- `frontend/src/components/GraphView.tsx` — Sigma graph rendering, constellation layout, edge legend/filtering
- `frontend/src/components/Inspector.tsx` — right-side details panel
- `frontend/src/components/inspector/AboutPanel.tsx` — Wikipedia/About panel
- `frontend/src/lib/wiki.ts` — Wikipedia summary/cache helpers
- `frontend/src/lib/wikiQuery.ts` — filename/folder query inference
- `frontend/src/lib/tauriCommands.ts` — typed Tauri command boundary
- `frontend/src/styles.css` — app styling

Backend:

- `src-tauri/src/graph.rs` — graph payload loading and overview/full-scope behavior
- `src-tauri/src/models.rs` — graph/file payload types
- `src-tauri/src/main.rs` — command registration and app setup
- `src-tauri/src/scanner.rs` — workspace scanning/indexing
- `src-tauri/src/preview.rs` — read-only preview builder
- `src-tauri/src/markdown_analyzer.rs` — markdown analysis groundwork
- `src-tauri/src/code_analyzer.rs` — code relationship analysis groundwork

## Verification Commands

Use these before treating the baseline as stable:

```bash
npm run --prefix frontend build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Desktop smoke:

```bash
npm run dev
```

Then verify:

- app launches
- workspace opens/scans
- graph loads
- folder focus/drilldown works
- node selection updates Inspector
- About panel loads or fails gracefully
- external open actions still work
- no Code Mode buttons/routes remain

## Next Feature Wave

Build **Node Notes + Wikilinks + Backlinks**:

- node/folder/file notes stored locally
- `[[wikilinks]]` parser
- backlinks in Inspector
- note-derived graph edges
- graph edge filters include note/wiki relationships

This is the right next step because it turns Orbit from a graph viewer into a graph-native wiki/workspace memory layer.

## Caveats

- The worktree is dirty from intentional pivot work; do not reset blindly.
- Historical Code Mode documents live under `.planning/archive/` and are for history only.
- LAN/mobile preview is frontend-only and does not guarantee Tauri-native commands work.
