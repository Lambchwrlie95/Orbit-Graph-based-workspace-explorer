# Orbit Requirements

## Current Scope

Orbit is a graph-native local workspace explorer and wiki layer. Requirements below describe the current direction after the Code Mode pivot.

## Workspace / Indexing

- User can choose a workspace root.
- Orbit indexes files/folders into SQLite.
- Orbit preserves cached metadata for unchanged files.
- Scans must not make Explorer lie about direct children in broad roots.
- Huge roots must use safe caps/overview behavior instead of materializing every node at once.

## Explorer

- User can browse files in list/grid/columns views.
- User can select a file/folder and see details in the Inspector.
- User can open files/folders externally.
- Explorer should remain useful even when the cached index is partial/stale.

## Graph

- Graph is the primary spatial navigation surface.
- Default graph layout is Constellation.
- Normal focused subtrees should show all indexed descendants when safe.
- Huge scopes should render bounded overviews and allow drilldown.
- Folder hubs should read as parent-local branch arms, not global rings or force-physics hairballs.
- Edge categories should be visually distinct and filterable.

## Inspector

- Inspector shows file/folder metadata.
- Inspector shows read-only previews where safe.
- Inspector includes a Wikipedia-style About panel with manual query override.
- Inspector should become the home for notes, backlinks, related nodes, and relationship explanations.

## Wiki Layer — Next

- User can attach notes to files/folders/nodes.
- Notes support `[[wikilinks]]`.
- Orbit computes backlinks from notes and markdown relationships.
- Wiki/note relationships appear in the Inspector and graph.

## Explicit Non-goals

- No in-app code editor.
- No Monaco/Code Mode.
- No edit/save Tauri command path for arbitrary files.
- No default true force-directed graph layout.
- No muddy background halo overlay as the primary organization mechanism.
