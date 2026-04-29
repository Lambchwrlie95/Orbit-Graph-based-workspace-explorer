# Orbit

## What This Is

Orbit is a graph-first file intelligence IDE: part project/file explorer, part Obsidian-style graph, part asset manager, and part lightweight code IDE. It helps a user understand files through relationships: folders, imports, links, tags, assets, recent work, duplicates, colors, previews, and code.

The product should not feel like a normal file manager with a graph bolted on. The graph is the primary thinking surface, while explorer, inspector, asset, code, and search modes make the app practical for real daily file work.

## Core Value

Orbit must make local files understandable and actionable by showing the relationships that matter without overwhelming the user or their machine.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] User can open a folder or project as the current workspace scope.
- [ ] User can scan files incrementally and persist file metadata in SQLite.
- [ ] User can browse the current scope in tree and list views.
- [ ] User can view a scoped graph of folders/files/relationships without rendering the whole disk.
- [ ] User can select a graph node or explorer item and inspect path, type, size, modified date, preview, relationships, and actions.
- [ ] User can open files externally from the app.
- [ ] User can search by filename for the MVP.
- [ ] User can rely on performance safeguards: lazy loading, scoped graphs, cached metadata, and hard graph node limits.

### Out of Scope

- Full VS Code replacement - start as a fast file intelligence app with editing later, not a complete IDE.
- Whole-disk graph rendering - visually useless and too slow; show scopes, clusters, and expandable summaries instead.
- Tantivy search in v1 - SQLite FTS5 comes first; Tantivy is only for later if SQLite search is not enough.
- Rendering tens of thousands of graph nodes - normal graph views should stay within roughly 500-2,000 nodes.
- Immediate thumbnail generation for every asset - thumbnails should be lazy and cached.
- Advanced code intelligence/language server features - defer until the scanner, graph, explorer, and inspector are reliable.

## Context

The guiding idea is "Graph-first file IDE." Orbit should answer practical questions visually:

- What belongs to this project?
- What files are connected?
- What changed recently?
- What images/assets are related?
- What code imports what?
- What files are duplicates?
- What files are unused?
- What can I open, edit, or organize fast?

The app should feel like Obsidian graph plus VS Code layout plus Eagle asset browser plus a Linux file manager, but lighter. The first visible experience should be useful, not decorative: thin sidebar, large central graph, right inspector, bottom results/logs/preview/terminal area, and a mode switcher for Graph, Explorer, Assets, Code, and Search.

The final stack preference is:

- Desktop shell: Tauri 2
- Native engine: Rust
- UI: React + TypeScript
- Persistent database: SQLite
- Graph model: Graphology
- Graph renderer: Sigma.js
- Search: SQLite FTS5 first
- Advanced search later: Tantivy only if needed
- Code editor: Monaco Editor
- File watching: Rust notify crate
- Packaging: Tauri build, with Linux packages/AppImage later

Backend responsibilities:

- File scanning
- Safe file operations
- Metadata extraction
- Database writes
- Filesystem watching
- Relationship detection
- Search queries
- Opening files/folders

Frontend responsibilities:

- Layout
- Graph rendering
- Panels
- Tabs
- Themes
- Shortcuts
- Command palette
- Visual state

SQLite responsibilities:

- File records
- Folder records
- Relationships
- Tags
- Favorites
- Recent activity
- Thumbnail cache paths
- Settings

Graphology responsibilities:

- Temporary in-memory graph
- Current visible nodes
- Current visible edges
- Graph algorithms
- Layout data

Sigma.js responsibilities:

- Drawing
- Zoom
- Pan
- Node interaction
- Edge interaction
- Visual graph performance

Important app modes:

- Graph Mode: main relationship view for scoped folders, files, imports, markdown links, asset references, tags, recent changes, duplicates, and similar files.
- Explorer Mode: normal file manager views including tree, grid, columns, and list.
- Inspector Mode: metadata, preview, tags, relationships, actions, code imports/exports/git status, image dimensions/colors/similarity, and markdown links/backlinks/headings.
- Code Mode: Monaco-based tabs, syntax highlighting, search in file, basic edit/save, markdown preview, and JSON/YAML/TOML editing.
- Asset Mode: thumbnail grid, dominant colors, duplicate detection, dimensions, copy path/color, external open, and tag/collection support.

MVP v0.1 focuses on the real foundation:

- Open folder
- Scan files
- Store metadata in SQLite
- Show tree/list view
- Show simple scoped graph
- Click node to show inspector
- Open file externally
- Search by filename

## Constraints

- **Performance**: Never scan entire home repeatedly, render huge graphs, generate all thumbnails immediately, or load full file contents into memory - the app must run well on a low-spec PC.
- **Graph scope**: Do not show the whole disk at once - use current project, current folder, selected file neighborhood, recently changed cluster, asset cluster, and code dependency cluster.
- **Node limits**: Normal graph views should cap visible graph nodes around 500-2,000 and cluster large folders.
- **Architecture**: Rust backend owns filesystem/indexing/database logic; React frontend owns layout and visual state.
- **Search**: SQLite FTS5 is the initial search engine; Tantivy is deferred until a real need appears.
- **Product shape**: The app starts as a file intelligence tool with editing, not a full IDE.
- **UI style**: Dark glassy interface, thin sidebar, large central graph, color-coded file types, small image thumbnails, right inspector, bottom command/status area, and fast keyboard shortcuts.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Orbit as a graph-first file intelligence IDE | A file manager with a graph would feel gimmicky; relationships are the primary value | - Pending |
| Use Tauri 2, Rust, React, TypeScript, SQLite, Graphology, Sigma.js, and Monaco | This stack cleanly separates native file/indexing work from a polished web UI and graph/editor experience | - Pending |
| Use SQLite FTS5 before Tantivy | SQLite is simpler, local, reliable, and likely enough for MVP search | - Pending |
| Scope graph views aggressively | Whole-disk graphs are slow and visually useless | - Pending |
| Make v0.1 foundation-first | Scanning, persistence, browsing, scoped graph, inspector, external open, and filename search prove the product core | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-29 after initialization*
