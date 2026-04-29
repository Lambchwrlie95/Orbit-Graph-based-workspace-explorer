---
phase: 2
name: Explorer, Search, and Inspector
status: active
---

# Phase 2: Explorer, Search, and Inspector

## Goal

Make indexed files usable through normal browsing, filename search, selection, preview, and open actions.

## Context

Phase 1 established the foundation:
- Tauri 2 + React + Rust + SQLite app shell
- Database schema for file metadata
- Scanner that walks directories and extracts metadata
- Durable logging infrastructure
- Progress reporting during scans

Now we need to expose this data through practical UI surfaces:
- Explorer views (tree and list) for browsing
- Inspector panel for metadata and actions
- Search for finding files by name
- Preview for supported file types
- External open for launching files

## Requirements Mapping

| Requirement | Description | Plan |
|-------------|-------------|------|
| EXPL-01 | User can browse the active workspace in a tree view | 02-01 |
| EXPL-02 | User can browse the active workspace in a list view | 02-01 |
| EXPL-03 | User can select a file or folder from explorer views | 02-02 |
| EXPL-04 | User can open a selected file externally | 02-02 |
| INSP-01 | User can see selected item path, type, size, and modified date | 02-02 |
| INSP-02 | User can see available actions for the selected item | 02-02 |
| INSP-03 | User can see a basic preview for supported text/image file types | 02-02 |
| SRCH-01 | User can search indexed files by filename | 02-03 |
| SRCH-02 | User can select a search result and inspect or open it | 02-03 |

## Success Criteria

1. User can browse the active workspace in tree and list views.
2. User can select any indexed item and see metadata plus available actions.
3. User can search by filename and select a result.
4. User can open a selected file externally.
5. Supported text/image files show a basic preview.

## Technical Approach

### Explorer Views (02-01)
- Tree view: hierarchical folder browser with expand/collapse
- List view: flat file/folder display for current directory
- Both backed by SQLite `list_children` query
- Navigation state managed in React

### Selection & Inspector (02-02)
- Shared selection state at App level
- Inspector panel shows metadata from FileRecord
- Actions: Open externally, Copy path
- Preview: text files show first N lines, images show thumbnail

### Search (02-03)
- SQLite FTS5 filename search (fallback to LIKE query if FTS not ready)
- Search results displayed in Explorer view
- Selection/open flows identical to explorer

## Key Files

Backend:
- `src-tauri/src/main.rs` - Tauri commands
- `src-tauri/src/db.rs` - Database queries
- `src-tauri/src/preview.rs` - Preview generation

Frontend:
- `frontend/src/main.tsx` - App shell and state
- `frontend/src/components/ExplorerTree.tsx` - Tree view
- `frontend/src/components/ExplorerList.tsx` - List view
- `frontend/src/components/Inspector.tsx` - Inspector panel
- `frontend/src/components/Preview.tsx` - File preview

## Dependencies

- Phase 1: Workspace Index Foundation (complete)
- SQLite with FTS5 extension enabled
- React for UI state management
- Tauri shell API for external open

## Notes

- Tree view should lazy-load children on expand
- List view should show parent navigation ("..")
- Preview size limits: 50KB for text, reasonable dimensions for images
- External open uses OS default application
