# Feature Research: Orbit

## Table Stakes For v1 Foundation

- Open a folder/project as a workspace scope.
- Scan files and persist metadata locally.
- Browse the current scope in a normal explorer view.
- Search files by filename.
- Show a scoped graph without rendering the entire disk.
- Select an item and see useful metadata in an inspector.
- Open a file externally.
- Avoid performance failure on large folders through limits, clustering, lazy loading, and caching.

## Differentiators

- Graph-first file understanding rather than graph-as-gimmick.
- Relationship engine for contains, imports, links, tags, duplicates, similar images, and recent-work clusters.
- Asset intelligence: thumbnails, dimensions, dominant colors, duplicates, and copy-color/copy-path flows.
- Lightweight code IDE features through Monaco, without replacing VS Code.
- Command palette and keyboard-first operation.

## Anti-Features

- Whole-disk graph view by default.
- Rendering 80,000 file nodes as dots.
- Immediate thumbnail generation for every asset.
- A bloated IDE feature set before the file intelligence foundation is reliable.
- Search infrastructure more complex than the MVP needs.

## Feature Dependencies

- Graph Mode depends on scanner, SQLite metadata, and relationship queries.
- Inspector depends on file metadata and selection state shared between graph and explorer.
- Asset Mode depends on image metadata and thumbnail cache paths.
- Code Mode depends on safe read/write operations and Monaco integration.
- Duplicate/similar detection depends on hashes and asset metadata.
