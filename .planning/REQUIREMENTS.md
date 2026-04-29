# Requirements: Orbit

**Defined:** 2026-04-29
**Core Value:** Orbit must make local files understandable and actionable by showing the relationships that matter without overwhelming the user or their machine.

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

- [ ] **EXPL-01**: User can browse the active workspace in a tree view.
- [ ] **EXPL-02**: User can browse the active workspace in a list view.
- [ ] **EXPL-03**: User can select a file or folder from explorer views.
- [ ] **EXPL-04**: User can open a selected file externally.

### Inspector

- [ ] **INSP-01**: User can see selected item path, type, size, and modified date.
- [ ] **INSP-02**: User can see available actions for the selected item.
- [ ] **INSP-03**: User can see a basic preview for supported text/image file types.

### Search

- [ ] **SRCH-01**: User can search indexed files by filename.
- [ ] **SRCH-02**: User can select a search result and inspect or open it.

### Graph

- [ ] **GRPH-01**: User can view a simple scoped graph for the active workspace or selected folder.
- [ ] **GRPH-02**: Orbit renders folder/file containment relationships as graph edges.
- [ ] **GRPH-03**: User can click a graph node to update the inspector.
- [ ] **GRPH-04**: User can double-click a graph node to open the file or focus the folder.
- [ ] **GRPH-05**: Orbit enforces a normal graph node cap and clusters or summarizes oversized folders.

### Performance

- [x] **PERF-01**: Orbit lazy-loads graph data, explorer rows, and previews instead of loading the whole workspace into the UI at once.
- [x] **PERF-02**: Orbit remains responsive while scans run in background Rust tasks.
- [x] **PERF-03**: Orbit caches metadata in SQLite and reuses it across app launches.

## v2 Requirements

### Code Mode

- **CODE-01**: User can open files in Monaco tabs.
- **CODE-02**: User can edit and save text files.
- **CODE-03**: User can preview Markdown.
- **CODE-04**: Orbit can extract imports and exported symbols for common code file types.

### Asset Mode

- **ASET-01**: User can browse images in a thumbnail grid.
- **ASET-02**: Orbit can extract image dimensions and dominant colors.
- **ASET-03**: Orbit can detect duplicate images.
- **ASET-04**: User can copy asset paths and colors.

### Relationship Intelligence

- **RELA-01**: Orbit can detect markdown links and backlinks.
- **RELA-02**: Orbit can detect code import relationships.
- **RELA-03**: Orbit can detect duplicate files by hash.
- **RELA-04**: User can tag files and view same-tag relationships.

### Advanced Search

- **SADV-01**: Orbit supports SQLite FTS5 content search for indexed text files.
- **SADV-02**: Orbit evaluates Tantivy only after SQLite search limits are measured.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full IDE replacement | The first milestone should validate file intelligence, not recreate VS Code |
| Whole-disk graph rendering | Too slow and visually useless for large home directories |
| Tantivy in v1 | SQLite filename search and later FTS5 are simpler and enough for the foundation |
| Immediate full thumbnail generation | Expensive on large folders; thumbnails should be lazy and cached |
| Language server integration | Defer until Code Mode is useful and the core product is stable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-01 | Phase 1 | Complete |
| WORK-02 | Phase 1 | Complete |
| WORK-03 | Phase 1 | Complete |
| INDX-01 | Phase 1 | Complete |
| INDX-02 | Phase 1 | Complete |
| INDX-03 | Phase 1 | Complete |
| INDX-04 | Phase 1 | Complete |
| INDX-05 | Phase 1 | Complete |
| EXPL-01 | Phase 2 | Complete |
| EXPL-02 | Phase 2 | Complete |
| EXPL-03 | Phase 2 | Complete |
| EXPL-04 | Phase 2 | Complete |
| INSP-01 | Phase 2 | Complete |
| INSP-02 | Phase 2 | Complete |
| INSP-03 | Phase 2 | Complete |
| SRCH-01 | Phase 2 | Complete |
| SRCH-02 | Phase 2 | Complete |
| GRPH-01 | Phase 3 | Complete |
| GRPH-02 | Phase 3 | Complete |
| GRPH-03 | Phase 3 | Complete |
| GRPH-04 | Phase 3 | Complete |
| GRPH-05 | Phase 3 | Complete |
| PERF-01 | Phase 4 | Complete |
| PERF-02 | Phase 4 | Complete |
| PERF-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 25 total
- Implemented: 25
- Coverage: 100%

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-04-29*
*Last updated: 2026-04-29 after initialization*
