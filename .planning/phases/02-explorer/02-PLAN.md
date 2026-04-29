---
phase: 2
name: Explorer, Search, and Inspector
depends_on: [Phase 1]
requirements: [EXPL-01, EXPL-02, EXPL-03, EXPL-04, INSP-01, INSP-02, INSP-03, SRCH-01, SRCH-02]
type: implementation
---

# Phase 2 Plan: Explorer, Search, and Inspector

## Objective

Implement explorer views (tree and list), inspector panel with metadata/actions/preview, and filename search to make indexed files browsable and actionable.

## Success Criteria

1. ✅ User can browse the active workspace in tree and list views.
2. ✅ User can select any indexed item and see metadata plus available actions.
3. ✅ User can search by filename and select a result.
4. ✅ User can open a selected file externally.
5. ✅ Supported text/image files show a basic preview.

## Plans

### 02-01: Explorer Tree/List Views

**Requirements**: EXPL-01, EXPL-02

Create explorer components for browsing the active workspace.

**Deliverables**:
- ExplorerList component with list view, parent navigation, and item display
- ExplorerTree component with lazy-loaded hierarchical browsing
- View mode toggle between list and tree
- Proper styling for both views

### 02-02: Selection, Inspector, and Preview

**Requirements**: EXPL-03, EXPL-04, INSP-01, INSP-02, INSP-03

Implement shared selection state, inspector panel, and preview functionality.

**Deliverables**:
- Shared selection state across all views
- Inspector component showing:
  - File icon and name
  - Full path
  - Type (folder/mime/extension)
  - Size (human readable)
  - Created and modified dates
  - Extension
- Actions: Open externally, Copy path, Show in folder
- Preview for text files (first 32KB)
- Preview for image files (base64 encoded)

### 02-03: Filename Search

**Requirements**: SRCH-01, SRCH-02

Implement filename search with result selection and open flows.

**Deliverables**:
- SearchPanel component with results list
- Debounced search (300ms delay)
- Search results showing: icon, name, parent folder, size
- Click to select (updates inspector)
- Double-click to open
- Integration with mode switcher
- Clear search functionality

## Files Created/Modified

### Frontend
- `frontend/src/types/index.ts` - TypeScript type definitions
- `frontend/src/utils.ts` - Utility functions (formatBytes, formatDate, etc.)
- `frontend/src/hooks/useDebounce.ts` - Debounce hook
- `frontend/src/components/ExplorerList.tsx` - List view component
- `frontend/src/components/ExplorerTree.tsx` - Tree view component
- `frontend/src/components/Inspector.tsx` - Inspector panel
- `frontend/src/components/SearchPanel.tsx` - Search interface
- `frontend/src/components/GraphView.tsx` - Graph visualization
- `frontend/src/main.tsx` - Refactored app shell
- `frontend/src/styles.css` - Extended styles

### Backend
- `src-tauri/src/preview.rs` - Preview generation (already existed, verified)
- `src-tauri/src/db.rs` - Database queries (already existed)
- `src-tauri/src/main.rs` - Tauri commands (already existed)

## Technical Notes

### Explorer List View
- Shows current directory contents
- Parent navigation with ".." entry
- Single-click to select
- Double-click folders to navigate
- Keyboard navigation support

### Explorer Tree View
- Lazy-loads children on expand
- Maintains expansion state
- Shows folder/file icons
- Single-click to select
- Double-click to expand/collapse

### Inspector
- Updates immediately on selection
- Shows all metadata from FileRecord
- Open action uses Tauri shell API
- Copy path uses navigator.clipboard
- Preview shown for text and image files

### Search
- 300ms debounce to avoid excessive queries
- Results limited to 200 items
- Case-insensitive substring matching
- Folders sorted first in results

## Verification

To verify Phase 2 implementation:

1. Start the app and scan a workspace
2. Switch to Explorer mode
3. Verify list view shows current directory
4. Navigate through folders
5. Switch to tree view and expand folders
6. Select items and verify inspector updates
7. Click Open to verify external open works
8. Enter search query and verify results appear
9. Select search result and verify inspector updates
10. Double-click search result to open
11. Select text/image files and verify preview shows

## Dependencies

- Phase 1 complete (workspace scanning and indexing)
- React for UI components
- Tauri shell API for external open
- Base64 for image previews

## Commits

- `feat(phase2-02-01): explorer tree and list views`
