# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Orbit is a Tauri 2 desktop app that renders the filesystem as a navigable knowledge graph. It is **not** a code editor — the project pivoted away from Monaco/Code Mode on 2026-05-18 and is now framed as a "graph-native wiki for the filesystem" with file inspection, markdown notes, wikilinks, and previews. Code editing is out of scope.

Stack: **Tauri 2 (Rust) + React 18 + TypeScript + Vite + SQLite (rusqlite, bundled) + Sigma.js v3 (WebGL) + graphology**. No bundler other than Vite. No state library — components manage their own state.

## Common commands

All recipes are in `justfile`; npm scripts in root `package.json` are the underlying implementation.

```sh
just dev              # Tauri dev on Wayland (preferred on Linux)
just dev-x11          # X11 fallback
just frontend-dev     # Vite only on http://127.0.0.1:1420 (no Rust shell)

just build            # tsc + vite build (frontend only)
just build-tauri      # full release build
just appimage         # bundle AppImage

just check            # the "is it green?" gate: commands-check + build + smoke
just commands-check   # verify frontend TAURI_COMMANDS matches Rust generate_handler!
just smoke            # headless Chromium render check (auto-starts Vite on :1420)
just clippy           # cargo clippy --all-targets -- -D warnings
just test             # cargo test  (run from src-tauri/, no frontend tests exist)
just cargo-check      # cargo check (compile only)

just log              # tail ~/.local/share/orbit/app.log
just open-db          # open SQLite index at ~/.local/share/orbit/orbit.db
```

Run a single Rust test: `cd src-tauri && cargo test <test_name>` (e.g. `load_graph_caps_large_scope_with_cluster_node`). The frontend has **no test suite** — verification is `commands:check` (drift gate) + `frontend:smoke` (headless render) + manual.

## Critical gates before shipping

1. **`npm run commands:check`** — Tauri command catalog drift is a build break. `frontend/src/lib/tauriCommands.ts` exports a `TAURI_COMMANDS` `as const` array; `src-tauri/src/main.rs` has `tauri::generate_handler![…]` at ~line 605. They must match exactly. When you add/remove a Rust command, update both.
2. **`cd src-tauri && cargo clippy --all-targets -- -D warnings`** — clippy is warnings-as-errors.
3. **`npm run frontend:smoke`** — catches blank-page regressions; runs Vite then drives Chromium.

`just check` runs 1+build+3 in sequence. Always run it before claiming a task done.

## Architecture in one page

### Boundary

All Rust↔TS traffic flows through Tauri commands. Frontend calls go through the typed wrapper `tauriInvoke<C>(name, args)` in `frontend/src/lib/tauriCommands.ts` — **never** import `@tauri-apps/api/core` directly in components. Events (e.g. `omarchy-theme-changed`, `orbit:scan:progress`) use Tauri's `emit`/`listen`.

### Backend (`src-tauri/src/`)

- `main.rs` (~700 lines) — Tauri setup, `AppState { db_path, db_write_lock }`, command handler registry, background omarchy-color watcher.
- `db.rs` (~1100 lines) — SQLite schema + all read/write helpers. `init_database` creates tables; **there is no migration framework** — when adding columns to existing tables, write a `PRAGMA table_info` check + conditional `ALTER TABLE` inline. Tables include `files`, `import_relationships`, `node_notes`, plus thumbnails (`db/thumbnail_schema.sql`).
- `scanner.rs` — `jwalk`-based filesystem walker. Emits progress events. Today this is greedy/full-tree; the v2 plan moves it behind an `indexer.rs` shallow-first worker.
- `graph.rs` — `load_graph` assembles nodes/edges for a scope. `visible_relationship_edges` joins `import_relationships`. Has cluster/overflow logic (`DEFAULT_FOLDER_CHILD_LIMIT = 22`).
- `code_analyzer.rs`, `markdown_analyzer.rs`, `image_analyzer.rs`, `image_hash.rs`, `color_extractor.rs`, `thumbnail_generator.rs` — per-file inspection helpers. Lazy, called by `commands/analysis.rs` / `commands/image_analysis.rs` / `commands/thumbnail.rs`.
- `preview.rs` — multi-format file preview payloads (text/image/video/pdf/font/archive). MIME helpers + size limits live here.
- `commands/notes.rs` — `get_node_note`, `save_node_note`. Parses `[[wikilinks]]` (incl. `|alias` and `#heading`).
- `omarchy.rs` + `icon_theme.rs` — Linux desktop integration (Omarchy colorscheme syncing, icon theme resolution including nvim-web-devicons-derived nerd-font mappings — see `THIRD_PARTY_NOTICES.md`).
- `performance.rs`, `logger.rs` — instrumentation; log lands at `~/.local/share/orbit/app.log`.

### Frontend (`frontend/src/`)

- `main.tsx` — root mount, workspace lifecycle (`applyWorkspace` / `scanWorkspace` / background rescans on focus & visibility). Clears `wikilinkResolver` cache at every workspace transition.
- `components/GraphView.tsx` (~2100 lines, the hot file) — Sigma renderer. Houses `layoutNodes` (mode dispatcher), `constellationLayout` (d3-hierarchy radial tidy), `treeLayout` (linear tidy), `relaxWithFA2`, `reduceNode`/`reduceEdge`, edge curvature, legend. **Do not** introduce ForceAtlas2 into constellation mode — it's intentionally skipped.
- `components/Inspector.tsx` (~700 lines) — right-panel inspector. Branches on `PreviewKind` (text/markdown/image/video/pdf/font/archive/audio). Mounts `inspector/NotesPanel` and `inspector/BacklinksPanel`.
- `lib/edgeRouting.ts` — pluggable `EdgeRoutingStrategy` (straight / random / lca-biased / hierarchical-bundled / metro). LCA computed via ancestor-chain walk.
- `lib/syntax.ts` — lazy-loaded highlight.js. Languages imported via Vite dynamic import.
- `lib/markdown.ts` — `marked`-based renderer with wikilink preprocessing into `<a class="md-wikilink" data-wikilink="…">`.
- `lib/wikilinkResolver.ts` — 4-tier resolution (exact stem → CI stem → substring → `search_files`). Cache keyed by `(rootPath, target)`; **must be cleared on workspace switch and after scan completion**.
- `lib/fileGlyphs.ts` (`iconRuleForPath`), `lib/wiki.ts` (`lookupWiki`) — reused everywhere; don't rebuild.
- `lib/tauriCommands.ts` — typed Tauri invoker. The `TAURI_COMMANDS` array is the single source of truth for the IPC surface.

### Persistent state locations

- SQLite index: `~/.local/share/orbit/orbit.db`
- Log: `~/.local/share/orbit/app.log`
- Thumbnails: `~/.local/share/orbit/thumbnails/`
- User icon themes: under XDG data dir, managed by `icon_theme.rs`.

## Working invariants (do not regress)

These are explicit project commitments from the v2 graph-overhaul plan; treat any change against them as a bug, not a tradeoff.

1. **Universe View** — the graph behaves as if the whole filesystem is mapped. Unscanned regions appear as first-class proxy nodes, never as emptiness.
2. **Instant shallow load** — first paint of any scope (including `~` or `/`) must complete in <500ms. No phase may add an eager full-tree scan that blocks first paint.
3. **No eager full-system scan** — scanning is demand-driven (viewport, hover, zoom, search, explicit "deepen").
4. **Edge layer toggles** — every relationship type is independently toggleable in the legend. Containment defaults ON.
5. **Bounded visible-node count** — renderer never exceeds the configured cap (default 800, hard ceiling 5000). Proxy/cluster collapsing absorbs the overflow.
6. **`tauriInvoke` is the only IPC entry point** from the frontend. No raw `invoke()` calls in components.
7. **No code editor** — the Monaco/Code-Mode era is over. Don't reintroduce editor surfaces.

## Conventions specific to this codebase

- **Tauri commands** are defined as plain `#[tauri::command] async fn` in `src-tauri/src/` (often inside `commands/*.rs`), re-exported through `main.rs`'s `generate_handler!`, and mirrored in `frontend/src/lib/tauriCommands.ts:TAURI_COMMANDS`. The `commands:check` script enforces parity.
- **Schema changes** require an inline migration (PRAGMA + ALTER) in `db.rs` because `CREATE TABLE IF NOT EXISTS` does not alter existing tables. Users carry pre-existing DBs.
- **Wayland-first**: `npm run dev` exports `WINIT_UNIX_BACKEND=wayland GDK_BACKEND=wayland MOZ_ENABLE_WAYLAND=1`. Use `dev:x11` only as a fallback.
- **Icon themes**: nerd-font mappings derive from `nvim-web-devicons` (see `THIRD_PARTY_NOTICES.md`). Respect that attribution when changing icon code.
- **Fonts**: UI uses IBM Plex Sans (`@fontsource/ibm-plex-sans`); mono is Lilex (bundled in `frontend/src/assets`) at line-height 1.618. Don't switch.
- **No comments on the what** — names should carry intent. Comments belong only where a non-obvious invariant or workaround would otherwise be lost.
