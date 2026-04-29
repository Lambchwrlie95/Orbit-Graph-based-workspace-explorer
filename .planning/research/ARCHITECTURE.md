# Architecture Research: Orbit

## Component Boundaries

### Rust Backend

- Workspace open/close commands
- Filesystem scan jobs
- SQLite schema and migrations
- Metadata extraction
- File watcher integration
- Relationship detection
- Search queries
- Safe file operations
- Native open/reveal operations

### React Frontend

- Shell layout
- Mode switcher: Graph, Explorer, Assets, Code, Search
- Sidebar project/filter navigation
- Central graph/explorer/editor surfaces
- Inspector panel
- Bottom results/logs/preview/terminal area
- Command palette and keyboard shortcuts

### SQLite

- Durable index/cache
- File and folder records
- Edge records
- Tags and file tags
- Recents/favorites/settings
- Thumbnail cache paths

### Graph Layer

- Backend returns scoped graph payloads.
- Frontend loads payloads into Graphology.
- Sigma renders the current visible graph.
- Large folders become cluster/summary nodes until expanded.

## Data Flow

Filesystem -> Rust scanner -> SQLite -> relationship engine -> graph/search APIs -> React -> Graphology -> Sigma.js.

Selection flows both ways: selecting an explorer row or graph node updates the shared selection state and refreshes the inspector.

## Suggested Build Order

1. Create the Tauri/Rust/React shell and SQLite schema.
2. Implement workspace open, scanning, and metadata persistence.
3. Build explorer/list views and filename search.
4. Add inspector selection and external open actions.
5. Add scoped graph API and Sigma rendering.
6. Add relationship detection and asset/code intelligence in later phases.

## Reference Codebase

Use `/home/lamb/Projects/graph-file-manager` as a reference where useful:

- `src-tauri/src/db.rs` for SQLite setup patterns.
- `src-tauri/src/indexer.rs`, `scanner.rs`, and `watch.rs` for filesystem indexing/watch concerns.
- `src-tauri/src/graph_builder.rs` for graph payload construction and root-scoping pitfalls.
- `src-tauri/src/preview.rs` for preview flow boundaries.
- `src-tauri/src/logger.rs` for durable file-backed diagnostics.
- `src-tauri/src/main.rs` and frontend invoke call sites for Tauri command naming and payload-shape lessons.

Do not copy the old product shape wholesale. Orbit should use these as implementation references while keeping the new React + graph-first architecture.
