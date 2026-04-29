# Phase 2 Context: Explorer, Search, and Inspector

## Phase Boundary

Build the practical file workflows on top of the SQLite index: tree/list-style browsing, filename search, shared selection, inspector metadata, basic preview, and external open.

## Decisions

- Keep browsing backed by indexed SQLite records rather than raw filesystem reads.
- Use one shared selected record for explorer, search, graph, preview, and actions.
- Support basic text/image/directory previews only in v1.
