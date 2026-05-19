# Orbit Project

## One-line Definition

Orbit is a **graph-native local workspace explorer**: it maps files, folders, notes, code references, assets, and relationships into a readable constellation with an Inspector for context.

## Product Direction

Orbit should feel like a clean local knowledge map, not a full IDE. The graph is the primary navigation surface; the Inspector is the primary details surface.

Current product goals:

- make large local folders understandable without overwhelming the user or machine
- show parent/child structure and semantic relationships clearly
- preserve full visibility for normal focused subtrees
- use overview/LOD behavior for huge roots
- support read-only previews and external opening/editing
- grow into a wiki-like layer with per-node notes, wikilinks, backlinks, and relationship edges

Out of scope for the current direction:

- in-app code editing
- Monaco/Code Mode
- replacing VS Code/Neovim
- true force-directed default graph layouts
- global polar ring/donut layouts
- broad colored background halo washes

## Current Stack

- Desktop shell: Tauri 2
- Backend: Rust
- Frontend: React + TypeScript + Vite
- Index/cache: SQLite
- Graph: Graphology + Sigma.js
- Native integration: external open/editor actions via OS tools

## Core Surfaces

1. **Graph**
   - constellation layout by default
   - folder hubs and branching rays
   - edge-category filtering
   - scoped drilldown/focus

2. **Explorer**
   - list/grid/columns style file browsing
   - cached metadata with live filesystem overlay where needed

3. **Inspector**
   - metadata
   - read-only previews
   - About panel
   - future notes/backlinks/related sections

## Current Phase

v2.0 is in stabilization after the pivot from a graph-first IDE to a graph/wiki workspace explorer.

Next major feature: **Node Notes + Wikilinks + Backlinks**.
