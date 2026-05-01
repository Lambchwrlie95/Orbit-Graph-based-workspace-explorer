# Roadmap: Orbit

## Overview

Orbit v1 builds the real foundation for a graph-first file intelligence IDE. The path starts with a reliable Tauri/Rust/SQLite scanner, then adds practical explorer/search/inspector workflows, then ships a scoped Sigma/Graphology graph, and finally hardens performance safeguards so large local folders do not break the experience.

**Developer handoff:** current implementation status, validation commands, dirty worktree notes, and next priorities are summarized in `.planning/HANDOFF.md`.

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
- Historical phase artifacts claim success criteria were verified. Current baseline was rechecked on 2026-04-30 with `npm run frontend:build` and `cargo test`; deeper UAT/smoke coverage is still pending.

### Next Steps
1. ~~Manual UAT (User Acceptance Testing)~~
2. ~~v1.0 packaging and distribution~~
3. ✅ **v2.0 Planning Complete** — See v2.0 Roadmap below

---

## v2.0 Roadmap — Desktop Experience

**Milestone Goal**: Transform Orbit from a foundation into a complete desktop application with packaging, enhanced file management, visual asset tools, and lightweight code editing.

**Philosophy**: Orbit v2.0 bridges the gap between a file intelligence tool and a lightweight workspace IDE. The graph remains primary, but users can now browse visually, manage assets intelligently, and edit code without leaving the app.

### v2.0 Phases

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| **5** | Packaging & Desktop Integration | Desktop entries, AppImage, Linux integration | ✅ Complete |
| **6** | Explorer Enhancements | Grid view, Columns view, view persistence | ✅ Complete |
| **7** | Asset Mode | Thumbnails, colors, duplicate detection | Implemented; UAT/Smoke Pending |
| **8** | Code Mode & Enhanced Inspector | Monaco editing, code analysis, markdown backlinks | Planning |

---

### Phase 5: Packaging & Desktop Integration

**Goal**: Orbit appears and behaves like a native Linux desktop application with proper packaging and desktop integration.

**Depends on**: Phase 4 (Complete)

**Requirements**: [PKG-01, PKG-02, PKG-03, PKG-04]

**Success Criteria**:
1. User can find Orbit in the application menu
2. User can right-click a folder and "Open in Orbit"
3. AppImage builds successfully via Tauri
4. Orbit has proper icon in taskbar and menus
5. Desktop entries follow FreeDesktop specifications

**Plans**: 2 plans

Plans:
- [x] 05-01: Icon assets and desktop entry files
- [x] 05-02: AppImage packaging configuration and build

**Status**: ✅ Complete

**Artifacts**:
- `.planning/phases/05-packaging-integration/05-CONTEXT.md`
- `.planning/phases/05-packaging-integration/05-PLAN.md`
- `.planning/phases/05-packaging-integration/05-01-PLAN.md`
- `.planning/phases/05-packaging-integration/05-02-PLAN.md`
- Desktop entry files (orbit.desktop, orbit-folder.desktop)
- Icon assets (32-512px PNGs)
- Updated tauri.conf.json
- Build scripts (scripts/build-appimage.sh, scripts/test-appimage.sh)
- Packaging documentation (docs/PACKAGING.md)

---

### Phase 6: Explorer Enhancements

**Goal**: Complete Explorer Mode with Grid and Columns views alongside existing Tree and List views.

**Depends on**: Phase 5

**Requirements**: [EXPL-05, EXPL-06]

**Success Criteria**:
1. User can browse files in icon grid with multiple size options
2. User can navigate via Miller columns (Finder-style)
3. Thumbnails appear for images in Grid view
4. App remembers view mode per folder
5. Seamless switching between all 4 view modes

**Plans**: 2 plans

Plans:
- [x] 06-01: Grid view with thumbnails and virtual scrolling
- [x] 06-02: Columns view with keyboard navigation

**Status**: ✅ Complete (2026-04-29)

**Artifacts**:
- `.planning/phases/06-explorer-enhancements/06-CONTEXT.md`
- `.planning/phases/06-explorer-enhancements/06-VERIFICATION.md`
- `frontend/src/components/ExplorerGrid.tsx` — Icon grid with 4 sizes, virtual scrolling
- `frontend/src/components/GridItem.tsx` — Grid cells with icons/thumbnails
- `frontend/src/components/ExplorerColumns.tsx` — Miller columns container
- `frontend/src/components/Column.tsx` — Individual column with resizing
- `frontend/src/hooks/useViewPersistence.ts` — Per-folder view persistence

---

### Phase 7: Asset Mode

**Goal**: Specialized visual asset management with thumbnails, color extraction, and duplicate detection.

**Depends on**: Phase 6

**Requirements**: [ASET-01, ASET-02, ASET-03, ASET-04]

**Success Criteria**:
1. User can browse 1000+ images in a smooth thumbnail grid
2. Image dimensions display on thumbnails
3. Dominant colors extracted and displayed
4. Duplicate/similar images detected and grouped
5. User can tag assets and filter by tags
6. User can copy colors as hex values

**Plans**: 3 plans

Plans:
- [ ] **07-01** — Thumbnail generation system (Rust backend)
  - ThumbnailGenerator service with 128/256/512px sizes
  - SQLite schema for thumbnail metadata
  - AssetMode shell component with mode switching
- [ ] **07-02** — Asset grid and image analysis
  - Virtual scrolling AssetGrid component
  - Image dimension extraction and display
  - Dominant color extraction with k-means
  - Tag system for asset organization
- [ ] **07-03** — Perceptual hash duplicate detection
  - pHash generation using DCT
  - Hamming distance similarity grouping
  - DuplicateManager UI with batch operations

**Artifacts**:
- `.planning/phases/07-asset-mode/07-CONTEXT.md`
- `.planning/phases/07-asset-mode/07-01-PLAN.md` — Thumbnail System
- `.planning/phases/07-asset-mode/07-02-PLAN.md` — Asset Grid and Image Analysis
- `.planning/phases/07-asset-mode/07-03-PLAN.md` — Duplicate Detection
- Thumbnail generation pipeline
- Perceptual hash implementation
- Asset database schema

---

### Phase 8: Code Mode & Enhanced Inspector

**Goal**: Lightweight code editing with Monaco and intelligent file analysis in the inspector.

**Depends on**: Phase 7

**Requirements**: [CODE-01, CODE-02, CODE-03, CODE-04, RELA-01, RELA-02]

**Success Criteria**:
1. User can edit files in Monaco Editor with tabs
2. Syntax highlighting for common languages
3. Markdown split view with live preview
4. Inspector shows imports/exports for code files
5. Inspector shows git status (modified/staged)
6. Inspector shows markdown links and backlinks
7. Inspector shows image dimensions and colors

**Plans**: 4 plans

Plans:
- [ ] **08-01** — Monaco Editor integration with tabs, file read/save commands, editor state management
- [ ] **08-02** — Code analysis (import/export detection) and git status integration
- [ ] **08-03** — Markdown analysis (links, backlinks, outline) and preview rendering
- [ ] **08-04** — Image analysis integration in inspector (dimensions, colors, similar images)

**Artifacts**:
- `.planning/phases/08-code-mode-enhanced-inspector/08-CONTEXT.md`
- `.planning/phases/08-code-mode-enhanced-inspector/08-01-PLAN.md` — Monaco Editor Integration
- `.planning/phases/08-code-mode-enhanced-inspector/08-02-PLAN.md` — Code Analysis and Git Status
- `.planning/phases/08-code-mode-enhanced-inspector/08-03-PLAN.md` — Markdown Analysis
- `.planning/phases/08-code-mode-enhanced-inspector/08-04-PLAN.md` — Image Analysis in Inspector
- Monaco Editor React component
- Code analysis engine with regex parsers
- Markdown link indexer and backlink database
- Git status integration with git2 crate

---

## v2.0 Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8

| Phase | Plans | Status | Est. Start |
|-------|-------|--------|------------|
| 5. Packaging & Desktop Integration | 2 | ✅ Complete | 2026-04-29 |
| 6. Explorer Enhancements | 2 | ✅ Complete | 2026-04-29 |
| 7. Asset Mode | 3 | Implemented; UAT/Smoke Pending | 2026-04-29 |
| 8. Code Mode & Enhanced Inspector | 4 | 📋 Planned | Ready |

**Total v2.0 Plans**: 11 plans
**Requirements**: 10 new requirements

---

## v2.0 Requirements Summary

### Packaging (PKG)
- **PKG-01**: Orbit has desktop entry in application menu
- **PKG-02**: User can right-click folder to open in Orbit
- **PKG-03**: AppImage builds and runs correctly
- **PKG-04**: Orbit displays proper icon in desktop environment

### Explorer Enhancements (EXPL)
- **EXPL-05**: User can browse in Grid view with thumbnails
- **EXPL-06**: User can browse in Columns view (Miller columns)

### Asset Mode (ASET)
- **ASET-01**: User can browse images in thumbnail grid
- **ASET-02**: Orbit extracts image dimensions and dominant colors
- **ASET-03**: Orbit detects duplicate images
- **ASET-04**: User can copy asset paths and colors

### Code Mode (CODE)
- **CODE-01**: User can open files in Monaco tabs
- **CODE-02**: User can edit and save text files
- **CODE-03**: User can preview Markdown
- **CODE-04**: Orbit extracts imports and exported symbols

### Relationship Intelligence (RELA)
- **RELA-01**: Orbit detects markdown links and backlinks
- **RELA-02**: Orbit detects code import relationships

---

## Phase vs Wave: v2.0 is a Milestone

**Why phases, not waves?**

v2.0 is structured as **4 sequential phases** rather than parallel waves because:

1. **User-Facing Completeness**: Each phase delivers a complete user-facing capability (packaging, explorer, assets, code editing)
2. **Natural Dependencies**: Later phases genuinely depend on earlier ones (Asset Mode needs thumbnails for Grid view)
3. **Integration Points**: Each phase integrates deeply with the existing v1.0 foundation
4. **Testing Boundaries**: Each phase is testable and shippable independently

**Alternative Considered**: We could split Phase 8 into waves (Monaco first, analysis later), but the 4-phase structure keeps each phase focused on a single major capability area.

---

## v2.0 Success Criteria (Overall)

1. **Desktop Integration**: Orbit installs and launches like a native Linux app
2. **Complete Explorer**: All 4 view modes (Tree, List, Grid, Columns) work seamlessly
3. **Asset Intelligence**: Users can manage visual assets with thumbnails, colors, and duplicates
4. **Code Editing**: Users can edit code without leaving Orbit
5. **Relationship Awareness**: Inspector shows connections between files (imports, links, references)
6. **Performance**: All new modes respect v1.0 performance guardrails

---

*Roadmap v2.0 created: 2026-04-29*  
*v1.0 Complete: 2026-04-29*  
*v2.0 Status: Planning Phase*
