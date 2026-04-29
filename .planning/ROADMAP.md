# Roadmap: Orbit

## Overview

Orbit v1 builds the real foundation for a graph-first file intelligence IDE. The path starts with a reliable Tauri/Rust/SQLite scanner, then adds practical explorer/search/inspector workflows, then ships a scoped Sigma/Graphology graph, and finally hardens performance safeguards so large local folders do not break the experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Workspace Index Foundation** - Open a workspace, scan files, and persist metadata in SQLite.
- [x] **Phase 2: Explorer, Search, and Inspector** - Make indexed files usable through normal browsing, filename search, selection, preview, and open actions.
- [x] **Phase 3: Scoped Graph Core** - Render the active scope as an interactive graph connected to selection and open/focus actions.
- [x] **Phase 4: Performance Guardrails** - Enforce lazy loading, background work, cache reuse, and graph caps for large folders.

## Phase Details

### Phase 1: Workspace Index Foundation
**Goal**: User can open a folder, scan it, and persist useful metadata in SQLite.
**Depends on**: Nothing (first phase)
**Requirements**: [WORK-01, WORK-02, WORK-03, INDX-01, INDX-02, INDX-03, INDX-04, INDX-05]
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. User can choose a folder and see it as the active workspace.
  2. User can start a scan and see scan progress, completion, and errors.
  3. SQLite contains file/folder metadata for the scanned workspace.
  4. Re-running a scan skips unchanged files where metadata allows it.
  5. Scan, SQLite, watcher, and graph-scope issues are written to durable app logs.
**Plans**: 3 plans

Plans:
- [x] 01-01: Tauri 2, React, TypeScript, Rust, and SQLite app shell
- [x] 01-02: Workspace open command, scan job, metadata extraction, and database schema
- [x] 01-03: Scan progress, durable logging, error reporting, and unchanged-file skip behavior

### Phase 2: Explorer, Search, and Inspector
**Goal**: User can browse, search, inspect, preview, and externally open indexed files.
**Depends on**: Phase 1
**Requirements**: [EXPL-01, EXPL-02, EXPL-03, EXPL-04, INSP-01, INSP-02, INSP-03, SRCH-01, SRCH-02]
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. User can browse the active workspace in tree and list views.
  2. User can select any indexed item and see metadata plus available actions.
  3. User can search by filename and select a result.
  4. User can open a selected file externally.
  5. Supported text/image files show a basic preview.
**Plans**: 3 plans

Plans:
- [x] 02-01: Explorer tree/list views backed by indexed data
- [x] 02-02: Shared selection state, inspector metadata, actions, and basic preview
- [x] 02-03: Filename search and search-result selection/open flows

### Phase 3: Scoped Graph Core
**Goal**: User can understand the active workspace or selected folder through a scoped interactive graph.
**Depends on**: Phase 2
**Requirements**: [GRPH-01, GRPH-02, GRPH-03, GRPH-04, GRPH-05]
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. User can switch to Graph Mode and see folders/files from the active scope.
  2. Containment relationships render as graph edges.
  3. Clicking a node updates the same inspector used by Explorer Mode.
  4. Double-clicking a node opens a file or focuses a folder.
  5. Oversized scopes are capped and represented with cluster/summary nodes.
  6. Graph requests stay explicitly scoped by active root path and graph mode.
**Plans**: 3 plans

Plans:
- [x] 03-01: Graph API, visible-scope query, and Graphology data loading
- [x] 03-02: Sigma.js rendering, styling, pan/zoom, and node interactions
- [x] 03-03: Node caps, folder clustering, and graph-to-inspector/open integration

### Phase 4: Performance Guardrails
**Goal**: Orbit stays responsive and reuses cached metadata when working with large local folders.
**Depends on**: Phase 3
**Requirements**: [PERF-01, PERF-02, PERF-03]
**UI hint**: yes
**Success Criteria** (what must be TRUE):
  1. Explorer, graph, and previews lazy-load rather than pushing entire workspaces into the UI.
  2. Scans run in background Rust tasks without freezing the React interface.
  3. Closing and reopening the app reuses SQLite metadata from prior scans.
  4. Large folders render as summaries or clusters instead of thousands of visible nodes.
**Plans**: 2 plans

Plans:
- [x] 04-01: Lazy loading, background scan behavior, and cache reuse validation
- [x] 04-02: Large-folder graph limits, cluster summaries, and responsiveness checks

**Artifacts:**
- `.planning/phases/04-performance-guardrails/04-CONTEXT.md`
- `.planning/phases/04-performance-guardrails/04-01-PLAN.md`
- `.planning/phases/04-performance-guardrails/04-02-PLAN.md`
- `.planning/phases/04-performance-guardrails/04-performance-guardrails-SUMMARY.md`
- `.planning/phases/04-performance-guardrails/VERIFICATION.md`

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Workspace Index Foundation | 3/3 | Complete | 2026-04-29 |
| 2. Explorer, Search, and Inspector | 3/3 | Complete | 2026-04-29 |
| 3. Scoped Graph Core | 3/3 | Complete | 2026-04-29 |
| 4. Performance Guardrails | 2/2 | Complete | 2026-04-29 |

## v1.0 Foundation Complete

All 4 phases of Orbit v1.0 Foundation have been completed:
- ✅ **25/25 requirements** implemented across all phases
- ✅ **11/11 plans** executed and committed
- ✅ All success criteria verified

### Next Steps
1. Manual UAT (User Acceptance Testing)
2. v1.0 packaging and distribution
3. Begin v2.0 planning (Code Mode, Asset Mode, Advanced Search)
