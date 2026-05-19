# v2 Graph Overhaul — Milestone Tracker

**Started:** 2026-05-18
**Direction:** Universe View — graph-native wiki for the filesystem with virtualized "fake-full-load" experience.
**Plan source:** [`~/.claude/plans/proud-toasting-sparkle.md`](file:///home/lamb/.claude/plans/proud-toasting-sparkle.md) (Claude planning file, kept outside repo)

---

## Core v2 Invariants (DO NOT REGRESS)

These behaviors are **non-negotiable requirements** for v2. Every phase must preserve them; any change that violates one is a bug, not a tradeoff.

1. **Universe View** — the graph always presents itself as if the entire filesystem is mapped. Unscanned regions appear as first-class proxy nodes, not as missing data.
2. **Instant shallow load** — first paint of any scope (including `~` or `/`) completes in <500ms. No eager full-tree scan may block first paint.
3. **Proxy summary nodes** — every unloaded or partially-loaded folder renders as a proxy node carrying `summary_stats` (entry count, total size, ext breakdown, indexing status). Proxy nodes are clickable, hoverable, expandable, and selectable.
4. **Adaptive metadata** — proxy nodes start with cheap stats; richer detail (mime pie, top extensions, sample thumbnails) is computed on hover/zoom only. Never compute rich stats eagerly for every proxy.
5. **Background progressive fill** — a dedicated worker deepens visible-and-nearby folders during idle time. Indexing is interruptible, cancellable, and never blocks the UI thread.
6. **No eager full-system scan** — Orbit must never recursively walk an entire root at startup or on workspace switch. Scanning is always demand-driven.
7. **Edge layer toggles** — every relationship type (containment, imports, markdown links, wikilinks, semantic, tags, symlinks) is independently toggleable in the legend.
8. **Bounded visible-node count** — the renderer never exceeds the configured cap (default 800, hard ceiling 5000), regardless of navigation. Proxy/cluster collapsing absorbs overflow.

---

## Phase Status

- [x] **Phase 0** — `.planning/` housekeeping
  - [x] Archive Code-Mode-era artifacts to `.planning/archive/` (preserving subpaths)
  - [x] Extract surviving knowledge to `.planning/intel/architecture-notes.md`
  - [x] Trim `intel/files.json`, `research/PITFALLS.md` in place
  - [x] Create this tracker

- [x] **Phase 1** — Immediate graph readability fix
  - [x] Phase 1a — Removed `if (iconsMode) targetSize = 1` and adjusted `makeNodeLabelRenderer` to drop the now-redundant `glyphBase` multiplier so icon visual scale is preserved (`frontend/src/components/GraphView.tsx`)
  - [x] Phase 1b — Added `max_cross_edges_per_node` field on `GraphRequest` (default 8, ceiling 64); per-source cap applied in `visible_relationship_edges`; SQL re-ordered by `weight DESC, id DESC` so the strongest edges survive the cap
  - [x] Phase 1c — Verified: `npm run commands:check` ✅, `cargo build` ✅, `cargo clippy -D warnings` ✅, `npm run frontend:build` ✅. Pre-existing graph test failure (`load_graph_caps_large_scope_with_cluster_node`, expected 32 children, got 58) is unrelated to Phase 1 — assertion is stale vs the current `DEFAULT_FOLDER_CHILD_LIMIT = 22`. Documented for separate fix.

- [ ] **Phase 2** — Virtualized "fake-full-load" graph (backbone)
  - [ ] Schema: `files.index_status`, `summary_stats`, `embedding`, `indexed_at`
  - [ ] New `src-tauri/src/indexer.rs` — background progressive indexer (Tokio task + priority queue)
  - [ ] `graph.rs` becomes LOD-aware; proxy nodes are first-class
  - [ ] `GraphView.tsx` hover→index, zoom→deepen, legend toggle for proxy layer
  - [ ] `Inspector.tsx` proxy-node summary view + "Index now" CTA

- [ ] **Phase 3** — Hierarchical edge bundling + ELK layout
  - [ ] `frontend/src/lib/edgeBundling.ts` — Holten HEB via d3-shape
  - [ ] Sigma `EdgeCurveProgram` wired for non-containment edges
  - [ ] `frontend/src/lib/layouts/elkLayout.ts` — ELK.js Web Worker, third layout mode "flow"

- [ ] **Phase 4** — Knowledge-graph parity
  - [ ] `wikilink_analyzer.rs` — parse `[[note]]` / `[[note#heading]]` / `[[note|alias]]`
  - [ ] `tag_analyzer.rs` — `#tag` + YAML frontmatter, `tags` + `file_tags` tables
  - [ ] `BacklinksPanel.tsx` — linked-from / mentioned-in / shared-tags
  - [ ] Legend toggles for wikilinks + tags

- [ ] **Phase 5** — Semantic edges (fastembed-rs)
  - [ ] Cargo dep `fastembed = "4"`
  - [ ] `embedder.rs` singleton, BGE-small lazy init
  - [ ] `similarity.rs` brute-force cosine top-K
  - [ ] Legend "Similar" toggle + threshold slider

- [ ] **Phase 6** — Optional LLM via Ollama
  - [ ] `ollama_client.rs` runtime detection
  - [ ] `summarize_file`, `suggest_tags_for_file`, `ask_workspace` commands
  - [ ] `AIPanel.tsx` gated on `ollama_available`

---

## Out of Scope (this milestone)

- Migration to CozoDB / DuckDB / Kuzu (SQLite + new columns sufficient under 50k files)
- Cosmograph "whole-vault" GPU view
- MCP server (defer to v2.5+)
- 3D graph mode
- Code editing (permanently out of scope per 2026-05-18 pivot)
