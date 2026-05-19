---
created_at: "2026-05-18"
purpose: Curated architecture knowledge salvaged from pre-pivot planning docs. Stale Code-Mode artifacts moved to .planning/archive/ on 2026-05-18; valuable lessons preserved here so future agents don't lose them.
---

# Architecture Notes (Curated)

## Reference Codebases

When implementing scanner / watcher / graph-builder concerns, consult `/home/lamb/Projects/graph-file-manager` as prior art:

- `src-tauri/src/db.rs` — SQLite setup patterns.
- `src-tauri/src/indexer.rs`, `scanner.rs`, `watch.rs` — filesystem indexing/watch concerns (directly relevant to Phase 2's progressive indexer).
- `src-tauri/src/graph_builder.rs` — graph payload construction and **root-scoping pitfalls** (the "graph data accidentally mixes roots" bug).
- `src-tauri/src/preview.rs` — preview flow boundaries.
- `src-tauri/src/logger.rs` — durable file-backed diagnostics.
- `src-tauri/src/main.rs` + frontend invoke call sites — Tauri command naming and payload-shape lessons.

Do not copy wholesale — Orbit's graph-native wiki shape diverges from graph-file-manager's product. Use as implementation reference only.

## Layered Architecture (still authoritative)

| Layer | Owns |
|-------|------|
| **Rust (`src-tauri/src/`)** | Filesystem ops, SQLite writes, watchers, relationship extraction, search queries, native open/reveal |
| **React (`frontend/src/`)** | Layout, tabs, panels, shortcuts, command palette, mode switching, visual state, rendering orchestration |
| **SQLite** | Durable local state: files, folders, relationships, tags, favorites, recents, settings, thumbnail cache paths, embeddings (v2) |
| **Graphology** | Temporary visible graph + graph algorithms for the current scope |
| **Sigma.js** | Drawing, zoom, pan, node/edge interaction, performance-sensitive graph rendering |

(See `CLAUDE.md` for the current, more detailed responsibility split.)

## Naming & File Organization

- Rust: `snake_case` for functions/variables, `PascalCase` for types. Modules in `snake_case.rs`.
- TypeScript: `camelCase` for functions/variables, `PascalCase` for types/components. React components in `PascalCase.tsx`.
- Rust modules in `src-tauri/src/` organized by concern.
- Tauri command handlers in `src-tauri/src/commands/`.
- React components in `frontend/src/components/` organized by feature; hooks in `frontend/src/hooks/`; types in `frontend/src/types/`.
- Imports: Rust uses explicit `use crate::`; TypeScript uses absolute imports from `../types`, `../utils`, `../lib/`.

## Performance Constants Worth Knowing

These were set during v1.0 and still hold (some will be revisited in Phase 2):

- `MAX_SCAN_ENTRIES = 120_000` — scanner hard cap.
- `DEFAULT_NODE_LIMIT = 800` (was 200 in v1.0) — graph node cap.
- Folder cluster threshold — folders with many children auto-cluster to limit node count.
- Virtual scrolling kicks in above 50 items in the explorer.
- Thumbnails are lazy and cached under `~/.local/share/orbit/thumbnails/`.
- SQLite writes are serialized via `AppState.db_write_lock`.

## Anti-Features (still applicable post-pivot)

From v1.0 research, deliberately scoped out:

- **Whole-disk graph view by default.** The Universe View (Phase 2) is the *replacement* — abstract, virtualized, not eager.
- **Rendering tens of thousands of file nodes as dots.**
- **Immediate thumbnail generation for every asset.** Generate on demand.
- **A bloated IDE feature set.** Code editing is permanently out of scope per 2026-05-18 pivot.
- **Search infrastructure more complex than the MVP needs.** Stick with SQLite FTS5; defer Tantivy.

## Pitfalls That Still Apply (operational)

The pre-pivot `research/PITFALLS.md` documented seven failure modes; six remain relevant verbatim and live in the trimmed PITFALLS.md:

1. **Whole-disk graph collapse** — every graph request must be scoped; visible-node caps enforced.
2. **Scanner overreach** — never recursively walk a root at startup; index incrementally; debounce watcher events.
3. **UI becomes decorative** — ship explorer + search + inspector + external-open alongside graph.
4. **Root-scoped graph drift** — propagate root_path + scope_path + mode through every layer; verify the path from frontend invoke through Tauri command, graph builder, watcher update.
5. **Search complexity too early** — SQLite FTS5 first; Tantivy only with measured limits.
6. **Missing durable diagnostics** — file-backed app logs; surface log locations in diagnostics.

The seventh pitfall (Premature IDE Scope / Monaco bloat) is moot post-pivot — Code Mode was removed 2026-05-18.

## Stale Direction (archived 2026-05-18)

Pre-pivot direction treated Orbit as "a graph-first file intelligence IDE" with Code Mode (Monaco), Edit/Save commands, and Markdown preview as v2 deliverables. That direction is archived at `.planning/archive/` and `git log`. Current direction:

- **Orbit is a graph-native wiki for the filesystem** (see `.planning/PROJECT.md`).
- **Code editing is out of scope.** External editing goes through `$EDITOR` / `xdg-open`.
- **v2 milestone is "Universe View"** — instant shallow load, proxy summary nodes, background progressive fill, hierarchical edge bundling, wikilinks/backlinks/tags, semantic edges via `fastembed-rs`, optional Ollama for LLM features.

For full v2 plan see `.planning/v2-GRAPH-OVERHAUL.md`.
