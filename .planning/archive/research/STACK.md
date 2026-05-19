# Stack Research: Orbit

## Recommendation

Use the stack specified in the project brief:

| Layer | Choice | Why |
|-------|--------|-----|
| Desktop shell | Tauri 2 | Lightweight desktop shell with Rust application logic and web frontend |
| Native engine | Rust | Fast filesystem scanning, indexing, metadata extraction, watching, and safe file operations |
| UI | React + TypeScript | Strong component model for panels, tabs, command palette, inspector, and polished app shell |
| Database | SQLite | Local, self-contained, reliable persistent index/cache |
| Search | SQLite FTS5 first | Simple local full-text search that fits MVP complexity |
| Advanced search | Tantivy later | Defer until SQLite search is proven insufficient |
| Graph model | Graphology | In-memory graph data structure and algorithms |
| Graph renderer | Sigma.js | WebGL rendering and interaction for visible graph scopes |
| Code editor | Monaco Editor | VS Code-like editing surface for later Code Mode |
| File watching | Rust notify crate | Incremental updates when files change |
| Packaging | Tauri build | Desktop packaging, Linux/AppImage later |

## Prescriptive Architecture

- Rust owns filesystem, SQLite writes, watchers, relationship extraction, search queries, and native open/reveal operations.
- React owns layout, tabs, panels, shortcuts, command palette, mode switching, visual state, and rendering orchestration.
- SQLite owns durable local state: files, folders, relationships, tags, favorites, recents, settings, and thumbnail cache paths.
- Graphology owns the temporary visible graph and graph algorithms for the current scope.
- Sigma.js owns drawing, zoom, pan, node interaction, edge interaction, and performance-sensitive graph rendering.

## What Not To Use Yet

- Do not introduce Tantivy in the MVP. It adds indexing complexity before there is evidence SQLite FTS5 is not enough.
- Do not add a full language server layer in v1. Monaco can provide editing later without turning Orbit into a VS Code clone.
- Do not build custom graph rendering before Sigma.js is tested against the product's visible-node limits.

## Confidence

High for the MVP stack. The architecture cleanly matches the product boundary: Rust for local file intelligence, React for interaction design, SQLite for persistence, and Sigma/Graphology for graph visualization.
