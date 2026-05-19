---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Orbit Graph/Wiki Workspace
status: stabilizing pivot baseline
stopped_at: graph/wiki pivot cleanup and verification
last_updated: "2026-05-19T08:00:00Z"
last_activity: 2026-05-19
progress:
  total_phases: 8
  completed_phases: 7
  current_phase: 8
  total_plans: 22
  completed_plans: 19
  percent: 86
---

# Project State

## Current Direction

Orbit is now a **graph-native local workspace explorer**: a fast file map, inspector, and wiki/relationship layer for understanding local projects and notes.

Orbit is **not** pursuing an in-app IDE/code editor. Monaco, Code Mode, editor tabs, edit/save commands, and editor state stores have been removed. Files are previewed read-only in Orbit and opened externally through `$EDITOR` / `xdg-open`.

## Current Baseline

- Repo: `/home/lamb/Projects/Orbit-Graph-based-workspace-explorer`
- Branch: `start`
- v1.0 foundation: complete
- v2.0 desktop features: partially implemented and stabilizing
- Current phase: Phase 8 redirected from Code Mode to Wiki Inspector
- Build status: frontend build and Rust `cargo check` pass as of 2026-05-19

## Implemented / Retained

- Tauri 2 desktop shell with Rust backend and React/TypeScript frontend
- SQLite workspace index and cached metadata
- Explorer list/grid/columns surfaces
- Inspector with read-only previews and metadata
- Graph workspace view using Graphology/Sigma
- Constellation layout as the preferred graph visualization
- Large-workspace guardrails with scoped graph loading and node budgets
- Edge-category legend/filtering for hierarchy, code refs, doc links, symlinks, related, tags, and other edges
- Wikipedia-style About panel in the Inspector with inferred/manual queries
- External open/edit flows instead of in-app editing

## Removed in the Pivot

- `frontend/src/components/CodeMode.tsx`
- `frontend/src/components/MonacoEditor.tsx`
- `frontend/src/components/EditorTabs.tsx`
- `frontend/src/components/MarkdownPreview.tsx`
- `frontend/src/hooks/useOpenFiles.ts`
- `frontend/src/stores/editorStore.ts`
- `src-tauri/src/commands/file.rs`
- Tauri commands: `read_file_for_edit`, `save_file`
- Monaco dependencies
- Dead Code Mode / editor CSS

Historical Code Mode phase plans are archived under `.planning/archive/` and should not be treated as current implementation targets.

## Current Product Priorities

1. **Stabilize the pivot baseline**
   - keep frontend/Rust checks passing
   - smoke test desktop launch and graph/inspector flows
   - keep docs aligned with graph/wiki direction

2. **Finish Wiki Inspector layer**
   - per-node notes
   - `[[wikilinks]]`
   - backlinks
   - note-derived graph edges
   - Inspector tabs/sections for About, Preview, Notes, Backlinks, Related

3. **Polish graph readability**
   - preserve parent-local branch-arm constellation style
   - avoid force-physics hairballs, global polar rings, and muddy background halos
   - keep normal focused subtrees complete while using overview/LOD for huge roots

4. **Complete asset intelligence**
   - thumbnails and image metadata exist
   - similar/duplicate grouping and full asset-mode workflow remain pending

## Verification Snapshot

Last verified on 2026-05-19:

- `npm run --prefix frontend build` — passes
- `cargo check --manifest-path src-tauri/Cargo.toml` — passes
- `git diff --check` — pending final cleanup pass

## Known Risks

- Worktree is intentionally dirty from the pivot and graph work; do not reset blindly.
- Some planning docs and archived phase artifacts still describe old Code Mode goals for historical context.
- Full desktop UAT still needed: open workspace, scan, graph load, select files/folders, Inspector/About, external open actions, settings persistence.
- Phone/LAN preview is frontend-only; Tauri-native commands may not work from mobile browser.

## Next Work

Immediate next step: complete stabilization smoke test, then checkpoint the pivot. After that, implement Node Notes + Wikilinks + Backlinks as the first graph/wiki feature wave.
