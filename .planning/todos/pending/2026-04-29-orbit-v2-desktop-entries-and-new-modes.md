---
created: "2026-04-29T13:30:00Z"
title: Orbit v2 - Desktop entries and new modes (Explorer, Inspector, Code, Asset)
area: features
files: []
---

## Problem

Orbit v1 has the basic graph-based file explorer working. For v2, we need to:
1. Update desktop entries to use this version of the project
2. Add additional modes beyond Graph Mode:
   - Explorer Mode - Normal file manager views (tree, grid, columns, list)
   - Inspector Mode - Detailed file analysis with previews and relationships
   - Code Mode - Monaco editor integration for editing
   - Asset Mode - Visual asset management with thumbnails and colors

## Solution

### Desktop Entries (2 entries)
Update both desktop entry files to reference the correct project:
- Point to the Orbit application
- Set proper icons and categories
- Ensure correct exec path

### Explorer Mode
Normal file manager view that complements the graph. Views needed:
- **Tree view** - Hierarchical folder navigation
- **Grid view** - Icon-based browsing
- **Columns view** - Miller columns (Finder-style)
- **List view** - Detailed file listing

Why this matters: Graph alone is not enough. Sometimes you just need normal browsing.

### Inspector Mode
When clicking any file, show comprehensive information:
- Basic: path, type, size, modified date
- Preview: thumbnail or content preview
- Tags and relationships
- Actions: open, copy path, reveal in folder

**For code files:**
- Imports and exported symbols
- Related files
- Git status

**For images:**
- Thumbnail with dimensions
- Dominant colors
- Similar images
- Files that use this asset

**For markdown:**
- Links and backlinks
- Headings outline
- Tags
- Rendered preview

### Code Mode
Use Monaco Editor with features:
- Tabbed editing
- Syntax highlighting
- Search in file
- Basic edit/save
- Markdown preview
- JSON/YAML/TOML editing

Philosophy: Do not try to replace VS Code immediately. Start as a fast file intelligence app with editing, not a full IDE.

### Asset Mode
Special mode for images/icons/themes/assets:
- Thumbnail grid view
- Dominant color extraction
- Duplicate detection
- Similar dimensions grouping
- Copy path/color functionality
- Open externally
- Tag/collection support

This makes it especially useful for Linux customization projects.

## Implementation Notes

Core architecture to maintain:
```
Filesystem → Rust scanner → SQLite → Rust relationship engine → Graph API → React UI → Graphology → Sigma.js
```

Split responsibilities:
- **Rust backend**: file scanning, safe operations, metadata extraction, database writes, filesystem watching, relationship detection, search queries, opening files
- **React frontend**: layout, graph rendering, panels, tabs, themes, shortcuts, command palette, visual state
- **SQLite**: file records, relationships, tags, favorites, recent activity, thumbnail cache, settings
- **Graphology**: in-memory graph, visible nodes/edges, graph algorithms, layout data
- **Sigma.js**: drawing, zoom, pan, interaction, performance

## Performance Rules

- Never render more than 500-2,000 graph nodes at once
- Index incrementally
- Lazy-load thumbnails
- Cache metadata
- Use background Rust tasks
- Use SQLite indexes
- Use virtualized lists

## Deferred From

This content was captured from a design discussion. Original source discussed Orbit as a "Visual file intelligence IDE" or "Graph-based workspace explorer" - positioned as a different category from traditional file managers.
