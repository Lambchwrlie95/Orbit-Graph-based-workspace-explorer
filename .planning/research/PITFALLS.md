# Pitfalls Research: Orbit

## Whole-Disk Graph Collapse

**Risk:** Showing the entire disk creates slow rendering and useless visual noise.

**Warning signs:** Graph view loads thousands of unrelated nodes, pan/zoom drops frames, or users cannot tell what matters.

**Prevention:** Scope every graph request by current project, folder, selected node neighborhood, recent cluster, asset cluster, or code dependency cluster. Enforce normal visible-node caps around 500-2,000 nodes.

## Scanner Overreach

**Risk:** Repeated full scans of home directories make the app feel heavy.

**Warning signs:** Startup rescans everything, CPU spikes for long periods, watcher events trigger broad re-indexing.

**Prevention:** Store metadata in SQLite, index incrementally, debounce watcher events, and make scan scope explicit.

## UI Becomes Decorative Instead Of Useful

**Risk:** A dark glassy graph can look good but fail as a working tool.

**Warning signs:** Graph is pretty but users still need a normal file manager for basic tasks.

**Prevention:** Ship explorer, search, inspector, and external-open flows alongside graph basics.

## Premature IDE Scope

**Risk:** Monaco and code features can expand into a full IDE clone before Orbit's core value is proven.

**Warning signs:** Language server, debugging, and workspace extension work starts before scanning, graph, and inspector are reliable.

**Prevention:** Treat Code Mode as lightweight edit/preview later. Keep v1 focused on file intelligence.

## Search Complexity Too Early

**Risk:** Introducing Tantivy early increases implementation surface without clear benefit.

**Warning signs:** Search infrastructure dominates the roadmap before filename/FTS search has shipped.

**Prevention:** Use SQLite filename search and FTS5 first. Add Tantivy only when specific search limits are measured.

## Root-Scoped Graph Drift

**Risk:** Graph data can accidentally mix roots or show stale data if the selected root path or graph mode is not propagated through every backend/frontend layer.

**Warning signs:** Opening a small project shows unrelated home-directory nodes, graph mode changes do not affect results, or watcher updates bring old/global graph data back.

**Prevention:** Make root path and graph mode explicit inputs to graph queries and incremental refreshes. Verify the path through the frontend invoke call, Tauri command, graph builder, and watcher update path before changing renderer logic.

## Missing Durable Diagnostics

**Risk:** Scanner, watcher, and graph bugs are hard to root-cause if errors only appear in transient UI state.

**Warning signs:** Users report behavior "reverting" or scans failing but no durable evidence exists after restart.

**Prevention:** Add file-backed app logs in Phase 1 and surface log locations in diagnostics. Use these logs when investigating scan, SQLite, watcher, permission, and graph-scope issues.
