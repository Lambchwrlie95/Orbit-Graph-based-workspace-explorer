# AGENTS.md

## Project

Orbit is a graph-first file intelligence IDE built with Tauri 2, Rust, React, TypeScript, SQLite, Graphology, Sigma.js, and later Monaco. The core value is making local files understandable and actionable through relationships without overwhelming the user or the machine.

Read these planning files before major work:

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

## GSD Workflow

- Start with `$gsd-discuss-phase 1` for Phase 1 context, or `$gsd-plan-phase 1` to plan directly.
- Keep requirements traceable to exactly one roadmap phase.
- Update `.planning/STATE.md` after meaningful progress.
- Do not expand scope into full IDE features before v1 foundations are reliable.
- Preserve performance constraints: scoped graph views, visible-node limits, lazy loading, background Rust work, and SQLite cache reuse.
- Use `/home/lamb/Projects/graph-file-manager` as a reference implementation when useful, especially for Tauri command wiring, scanner/indexer/watcher patterns, SQLite persistence, graph builder scope handling, previews, and durable logging.

## Engineering Direction

- Rust backend owns scanning, metadata extraction, SQLite writes, filesystem watching, relationship detection, search queries, and safe native file operations.
- React frontend owns layout, graph rendering orchestration, panels, mode switching, shortcuts, command palette, and visual state.
- SQLite is the first persistence/search foundation. Use filename search first and SQLite FTS5 before considering Tantivy.
- Graphology owns the current in-memory graph; Sigma.js owns rendering and interaction.
- Normal graph views should not render the whole disk or tens of thousands of nodes.
- Graph queries must carry active root path and graph mode end to end. Trace frontend invoke -> Tauri command -> graph builder -> watcher refresh before changing Sigma rendering when graph scope is wrong.

## UI Direction

- Build the actual working app surface first, not a landing page.
- The primary app shape is a thin sidebar, large central graph/explorer/editor surface, right inspector, and bottom results/logs/preview/terminal area.
- Modes: Graph, Explorer, Assets, Code, Search.
- Keep the UI efficient, keyboard-friendly, and visually polished without sacrificing density or responsiveness.
