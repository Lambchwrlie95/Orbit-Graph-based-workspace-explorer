# Requirements: Orbit

**Defined:** 2026-04-29
**Core Value:** Orbit must make local files understandable and actionable by showing the relationships that matter without overwhelming the user or their machine.

> Status note, 2026-05-01: completion markings below are implementation/planning status, not full UAT validation. Current verified baseline includes `npm run commands:check`, `npm run frontend:smoke`, `npm run frontend:build`, `cargo test` passing 12/12, and a 1440x900 Chromium smoke screenshot confirming the graph-only center with left/right side panels. Deeper smoke tests are still needed for scan, graph load with real data, thumbnail/image commands, bookmarks persistence, top-menu actions, and UI side-panel flows.

## v1 Requirements

### Workspace

- [x] **WORK-01**: User can open a folder as the active Orbit workspace.
- [x] **WORK-02**: User can see which folder is currently active.
- [x] **WORK-03**: User can trigger an initial scan of the active workspace.

### Indexing

- [x] **INDX-01**: Orbit stores scanned file and folder metadata in SQLite.
- [x] **INDX-02**: Orbit records path, name, parent path, extension, MIME type when known, size, modified time, created time when available, hash when available, and directory flag.
- [x] **INDX-03**: Orbit avoids rescanning unchanged files when metadata shows they have not changed.
- [x] **INDX-04**: Orbit exposes scan progress, completion, and errors in the UI.
- [x] **INDX-05**: Orbit writes durable app logs for scan, SQLite, watcher, and graph-scope diagnostics.

### Explorer

- [x] **EXPL-01**: User can browse the active workspace in a tree view.
- [x] **EXPL-02**: User can browse the active workspace in a list view.
- [x] **EXPL-03**: User can select a file or folder from explorer views.
- [x] **EXPL-04**: User can open a selected file externally.
- [x] **EXPL-05**: User can browse the active workspace in a grid view with thumbnails.
- [x] **EXPL-06**: User can browse the active workspace in a columns view (Miller columns).

### Inspector (v1.0 Complete)

- [x] **INSP-01**: User can see selected item path, type, size, and modified date.
- [x] **INSP-02**: User can see available actions for the selected item.
- [x] **INSP-03**: User can see a basic preview for supported text/image file types.

### Inspector Enhancements (v2.0)

- [x] **INSP-04**: Inspector shows code analysis (imports, exports, git status) for code files.
- [ ] **INSP-05**: Inspector shows image analysis (dimensions, dominant colors, similar images) for image files. **Partial 2026-05-01:** dimensions, aspect ratio, format, size, and dominant colors are surfaced in the right inspector; similar-image grouping still needs completion.
- [ ] **INSP-06**: Inspector shows markdown analysis (links, backlinks, headings) for markdown files.

### Search (v1.0 Complete)

- [x] **SRCH-01**: User can search indexed files by filename.
- [x] **SRCH-02**: User can select a search result and inspect or open it.

### Graph (v1.0 Complete)

- [x] **GRPH-01**: User can view a simple scoped graph for the active workspace or selected folder.
- [x] **GRPH-02**: Orbit renders folder/file containment relationships as graph edges.
- [x] **GRPH-03**: User can click a graph node to update the inspector.
- [x] **GRPH-04**: User can double-click a graph node to open the file or focus the folder.
- [x] **GRPH-05**: Orbit enforces a normal graph node cap and clusters or summarizes oversized folders.

### Performance

- [x] **PERF-01**: Orbit lazy-loads graph data, explorer rows, and previews instead of loading the whole workspace into the UI at once.
- [x] **PERF-02**: Orbit remains responsive while scans run in background Rust tasks.
- [x] **PERF-03**: Orbit caches metadata in SQLite and reuses it across app launches.

## v2.0 Requirements

### Packaging (PKG)

- [x] **PKG-01**: Orbit has desktop entry in application menu.
- [x] **PKG-02**: User can right-click folder to open in Orbit.
- [x] **PKG-03**: AppImage builds and runs correctly.
- [x] **PKG-04**: Orbit displays proper icon in desktop environment.

### Code Mode (CODE)

- [x] **CODE-01**: User can open files in Monaco tabs.
- [x] **CODE-02**: User can edit and save text files.
- [ ] **CODE-03**: User can preview Markdown.
- [x] **CODE-04**: Orbit extracts imports and exported symbols for common code file types.

### Asset Mode (ASET)

- [x] **ASET-01**: User can browse images in a thumbnail grid.
- [x] **ASET-02**: Orbit extracts image dimensions and dominant colors.
- [ ] **ASET-03**: Orbit detects duplicate images.
- [ ] **ASET-04**: User can copy asset paths and colors. **Partial 2026-05-01:** colors are copyable from the inspector image analysis panel; asset-mode path/color copy affordances still need completion.

### Relationship Intelligence (RELA)

- [ ] **RELA-01**: Orbit detects markdown links and backlinks.
- [ ] **RELA-02**: Orbit detects code import relationships.
- [ ] **RELA-03**: Orbit detects duplicate files by hash.
- [ ] **RELA-04**: User can tag files and view same-tag relationships.

### Advanced Search (Deferred to v2.1+)

- **SADV-01**: Orbit supports SQLite FTS5 content search for indexed text files. (v2.1+)
- **SADV-02**: Orbit evaluates Tantivy only after SQLite search limits are measured. (v2.1+)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full IDE replacement | The first milestone should validate file intelligence, not recreate VS Code |
| Whole-disk graph rendering | Too slow and visually useless for large home directories |
| Tantivy in v1 | SQLite filename search and later FTS5 are simpler and enough for the foundation |
| Immediate full thumbnail generation | Expensive on large folders; thumbnails should be lazy and cached |
| Language server integration | Defer until Code Mode is useful and the core product is stable |

## Traceability

### v1.0 Requirements (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-01 | Phase 1 | ✅ Complete |
| WORK-02 | Phase 1 | ✅ Complete |
| WORK-03 | Phase 1 | ✅ Complete |
| INDX-01 | Phase 1 | ✅ Complete |
| INDX-02 | Phase 1 | ✅ Complete |
| INDX-03 | Phase 1 | ✅ Complete |
| INDX-04 | Phase 1 | ✅ Complete |
| INDX-05 | Phase 1 | ✅ Complete |
| EXPL-01 | Phase 2 | ✅ Complete |
| EXPL-02 | Phase 2 | ✅ Complete |
| EXPL-03 | Phase 2 | ✅ Complete |
| EXPL-04 | Phase 2 | ✅ Complete |
| INSP-01 | Phase 2 | ✅ Complete |
| INSP-02 | Phase 2 | ✅ Complete |
| INSP-03 | Phase 2 | ✅ Complete |
| SRCH-01 | Phase 2 | ✅ Complete |
| SRCH-02 | Phase 2 | ✅ Complete |
| GRPH-01 | Phase 3 | ✅ Complete |
| GRPH-02 | Phase 3 | ✅ Complete |
| GRPH-03 | Phase 3 | ✅ Complete |
| GRPH-04 | Phase 3 | ✅ Complete |
| GRPH-05 | Phase 3 | ✅ Complete |
| PERF-01 | Phase 4 | ✅ Complete |
| PERF-02 | Phase 4 | ✅ Complete |
| PERF-03 | Phase 4 | ✅ Complete |

**v1.0 Coverage:** 25/25 requirements (100%)

### v2.0 Requirements (Planned)

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 5 | ✅ Complete |
| PKG-02 | Phase 5 | ✅ Complete |
| PKG-03 | Phase 5 | ✅ Complete |
| PKG-04 | Phase 5 | ✅ Complete |
| EXPL-05 | Phase 6 | ✅ Complete |
| EXPL-06 | Phase 6 | ✅ Complete |
| ASET-01 | Phase 7 | ✅ Implemented; UAT pending |
| ASET-02 | Phase 7 | ✅ Implemented; UAT pending |
| ASET-03 | Phase 7 | 📋 Planned |
| ASET-04 | Phase 7 | 🔨 Partial: inspector color copy done |
| CODE-01 | Phase 8 | ✅ Implemented; UAT pending |
| CODE-02 | Phase 8 | ✅ Implemented; UAT pending |
| CODE-03 | Phase 8 | 📋 Planned |
| CODE-04 | Phase 8 | ✅ Implemented; UAT pending |
| RELA-01 | Phase 8 | 📋 Planned |
| RELA-02 | Phase 8 | 🔨 Partial code-analysis groundwork |
| INSP-04 | Phase 8 | ✅ Implemented; UAT pending |
| INSP-05 | Phase 7/8 | 🔨 Partial: dimensions/colors done, similar images pending |
| INSP-06 | Phase 8 | 📋 Planned |

**v2.0 Coverage:** Mixed implementation status; planned items remain for duplicate/similar images, markdown analysis, and relationship graph integration.

### Coverage Summary

| Milestone | Total | Complete | Status |
|-----------|-------|----------|--------|
| v1.0 Foundation | 25 | 25 | ✅ 100% |
| v2.0 Desktop Experience | 19+ tracked items | 12 complete, 3 partial | 🔨 In progress |
| **Overall** | **44+ tracked items** | **37 complete, 3 partial** | **In progress** |

---
*Requirements defined: 2026-04-29*  
*v1.0 Complete: 2026-04-29*  
*v2.0 Updated: 2026-05-01*
