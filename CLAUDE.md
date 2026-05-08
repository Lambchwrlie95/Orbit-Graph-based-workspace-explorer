# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Orbit is a graph-first file intelligence IDE built with Tauri 2, Rust, React/TypeScript, SQLite, Graphology, and Sigma.js. The central idea is that the graph is the primary thinking surface — not a feature bolted onto a file manager. The app shape is a frameless window with a 28px unified header bar, a thin left sidebar (Explorer/Search), a large central graph surface, and a right inspector (Inspector/Code).

## Commands

### Dev (Wayland / X11)
```sh
npm run dev           # Wayland (default)
npm run dev:x11       # X11 fallback
```

### Frontend only
```sh
npm run frontend:dev    # Vite dev server
npm run frontend:build  # tsc + Vite build
```

### Integrity checks (run before committing)
```sh
npm run commands:check   # Verify frontend TAURI_COMMANDS catalog matches Rust generate_handler![...]
npm run frontend:smoke   # Headless Chromium smoke test — checks the workbench shell renders
npm run frontend:check   # commands:check + frontend:build combined
```

### Rust
```sh
cd src-tauri && cargo test            # Run all Rust tests
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo build
```

### Packaging (Linux AppImage)
```sh
npm run build:appimage
npm run build:appimage:debug
npm run build:appimage:clean
```

### Install desktop entry (development)
```sh
./scripts/install-desktop-entry.sh
```

## Architecture

### Responsibility split

| Layer | Owns |
|-------|------|
| **Rust (`src-tauri/src/`)** | File scanning, SQLite writes, metadata extraction, filesystem watching, graph builder queries, file previews, thumbnail generation, image/color analysis, code analysis (imports/exports), git status |
| **React (`frontend/src/`)** | Layout, graph rendering orchestration (Graphology + Sigma.js), mode switching, panel state, keyboard shortcuts, visual state |
| **SQLite (`orbit.db` in `~/.local/share/orbit/`)** | Persistent file records, code analysis, import relationships, thumbnail cache, image metadata |
| **Graphology** | In-memory graph (current visible nodes/edges), graph algorithms, layout data |
| **Sigma.js** | Draw, zoom, pan, node/edge interaction |

### Tauri command boundary

All frontend→backend calls go through `frontend/src/lib/tauriCommands.ts` via the typed `tauriInvoke()` wrapper. The `TAURI_COMMANDS` constant in that file must stay in sync with `tauri::generate_handler![...]` in `src-tauri/src/main.rs`. Run `npm run commands:check` to catch drift.

When adding a new Tauri command:
1. Add the `#[tauri::command]` fn in Rust and register it in `main.rs` `generate_handler!`.
2. Add the command name to `TAURI_COMMANDS`, and add its args/result types to the maps in `tauriCommands.ts`.

### Graph scoping rules

Graph queries always carry both `root_path` (the workspace root) and `scope_path` (the current drill-down folder). The graph builder in `src-tauri/src/graph.rs` enforces that scope stays inside root. The default node cap is 200, clamped to 100–2,000. Large folders are collapsed into cluster nodes (`/__cluster__` suffix) until expanded.

When graph scope appears wrong, trace: frontend `loadGraph` call → `tauriInvoke("load_graph", { request })` → Rust `load_graph` command → `graph::load_graph()` → `GraphPayload` back to `GraphView`.

### Frontend state

All application state lives in `frontend/src/main.tsx` (the `App` component). There is no global Zustand store for the main shell — Zustand (`frontend/src/components/editorStore.ts`) is used only for Monaco editor tab state. `useViewPersistence` persists explorer view mode and sort order per folder path.

### Backend modules

| File | Purpose |
|------|---------|
| `scanner.rs` | Walk directory tree with jwalk, collect `ScannedEntry` rows |
| `db.rs` | All SQLite read/write: init, index_rows, children, search (FTS5), graph queries |
| `graph.rs` | Build `GraphPayload` from SQLite; handles clustering and node limits |
| `preview.rs` | Build `PreviewPayload` (text preview, metadata) for inspector |
| `code_analyzer.rs` | Static import/export analysis for JS/TS/Rust/Python files |
| `image_analyzer.rs` | Image metadata (dimensions, format) |
| `color_extractor.rs` | Dominant color extraction from images |
| `thumbnail_generator.rs` | Lazy thumbnail generation and caching |
| `git_status.rs` | Per-file git status via git2 crate |
| `performance.rs` | In-memory operation timing metrics |
| `logger.rs` | File-backed structured app log |
| `commands/` | Thin Tauri command wrappers: `file`, `analysis`, `image_analysis`, `thumbnail` |

### Performance constraints

- Graph node limit: 200 by default, never exceed 2,000.
- Scanner hard cap: `MAX_SCAN_ENTRIES = 120_000`.
- Explorer virtual scrolling kicks in above 50 items (`VirtualList`).
- Cache staleness check: samples 50 files from SQLite.
- Thumbnails are lazy — generated on demand and stored in `~/.local/share/orbit/thumbnails/`.
- SQLite writes are serialized via `AppState.db_write_lock`.

## Planning files

The `.planning/` directory contains the project roadmap and phase state. Key files:
- `.planning/STATE.md` — current milestone status and phase completion (update after meaningful progress)
- `.planning/PROJECT.md` — core value, requirements, and architectural decisions
- `.planning/HANDOFF.md` — session handoff notes with current baseline
- `.planning/ROADMAP.md` — phase-by-phase delivery plan

Current status (as of 2026-05-01): v1.0 complete, v2.0 at ~86% — Phase 8 (Code Mode / Enhanced Inspector) partially implemented; markdown/backlinks and similar-image flows still pending.
