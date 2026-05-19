# Orbit Roadmap

## v1.0 — Foundation

Status: complete.

Delivered:

- workspace indexing
- Explorer/Search/Inspector foundation
- scoped graph core
- performance guardrails

## v2.0 — Desktop Graph/Wiki Experience

Status: partial implementation, stabilizing.

Delivered / in progress:

- Linux desktop/Tauri packaging work
- Explorer list/grid/columns improvements
- thumbnail and image metadata groundwork
- graph performance and constellation layout improvements
- Inspector About panel
- Code Mode removal and graph/wiki pivot cleanup

## Current Stabilization Pass

Before new features:

- keep frontend build passing
- keep Rust check passing
- run desktop smoke test
- remove stale Code Mode references from active source/docs
- checkpoint the pivot baseline

## Next Feature Wave: Node Notes + Wikilinks + Backlinks

Goal: make Orbit useful as a local knowledge graph, not just a file graph.

Planned pieces:

1. Local note storage per node/path
2. Inspector Notes section
3. `[[wikilink]]` parser
4. backlink computation
5. note/wiki edge category in graph
6. search/filter over notes and linked nodes

## Later Waves

- stronger markdown relationship extraction
- richer code reference edges
- asset duplicate/similar grouping
- saved graph views/bookmarks
- optional AI summaries after the graph/wiki layer is stable

## Historical Note

Earlier Phase 8 plans targeted Code Mode and Monaco editing. That direction is archived under `.planning/archive/` and is no longer the active roadmap.
