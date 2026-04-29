# Requirements: Orbit

**Defined:** 2026-04-29
**Core Value:** Orbit must make local files understandable and actionable by showing the relationships that matter without overwhelming the user or their machine.

## v1 Requirements

### Workspace

- [ ] **WORK-01**: User can open a folder as the active Orbit workspace.
- [ ] **WORK-02**: User can see which folder is currently active.
- [ ] **WORK-03**: User can trigger an initial scan of the active workspace.

### Indexing

- [ ] **INDX-01**: Orbit stores scanned file and folder metadata in SQLite.
- [ ] **INDX-02**: Orbit records path, name, parent path, extension, MIME type when known, size, modified time, created time when available, hash when available, and directory flag.
- [ ] **INDX-03**: Orbit avoids rescanning unchanged files when metadata shows they have not changed.
- [ ] **INDX-04**: Orbit exposes scan progress, completion, and errors in the UI.
- [ ] **INDX-05**: Orbit writes durable app logs for scan, SQLite, watcher, and graph-scope diagnostics.

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

- [ ] **PERF-01**: Orbit lazy-loads graph data, explorer rows, and previews instead of loading the whole workspace into the UI at once.
- [ ] **PERF-02**: Orbit remains responsive while scans run in background Rust tasks.
- [ ] **PERF-03**: Orbit caches metadata in SQLite and reuses it across app launches.

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
| WORK-01 | Phase 1 | Pending |
| WORK-02 | Phase 1 | Pending |
| WORK-03 | Phase 1 | Pending |
| INDX-01 | Phase 1 | Pending |
| INDX-02 | Phase 1 | Pending |
| INDX-03 | Phase 1 | Pending |
| INDX-04 | Phase 1 | Pending |
| INDX-05 | Phase 1 | Pending |
| EXPL-01 | Phase 2 | Pending |
| EXPL-02 | Phase 2 | Pending |
| EXPL-03 | Phase 2 | Pending |
| EXPL-04 | Phase 2 | Pending |
| INSP-01 | Phase 2 | Pending |
| INSP-02 | Phase 2 | Pending |
| INSP-03 | Phase 2 | Pending |
| SRCH-01 | Phase 2 | Pending |
| SRCH-02 | Phase 2 | Pending |
| GRPH-01 | Phase 3 | Pending |
| GRPH-02 | Phase 3 | Pending |
| GRPH-03 | Phase 3 | Pending |
| GRPH-04 | Phase 3 | Pending |
| GRPH-05 | Phase 3 | Pending |
| PERF-01 | Phase 4 | Pending |
| PERF-02 | Phase 4 | Pending |
| PERF-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-04-29*
*Last updated: 2026-04-29 after initialization*
