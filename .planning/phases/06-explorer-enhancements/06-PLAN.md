---
phase: 06-explorer-enhancements
plan: overview
type: overview
wave: 0
depends_on: [05-packaging-integration]
files_modified: []
autonomous: true
requirements: [EXPL-05, EXPL-06]
must_haves:
  truths:
    - "User can browse files in Grid view with icon sizes 48/64/96/128px"
    - "User can navigate via Miller columns with ← → keyboard shortcuts"
    - "Grid view shows thumbnails for images, icons for other files"
    - "View mode persists per folder across sessions"
    - "All 4 view modes (Tree, List, Grid, Columns) switch seamlessly"
  artifacts:
    - path: "frontend/src/components/ExplorerGrid.tsx"
      provides: "Grid view component with virtual scrolling"
      exports: ["ExplorerGrid"]
    - path: "frontend/src/components/ExplorerColumns.tsx"
      provides: "Columns view component (Miller columns)"
      exports: ["ExplorerColumns"]
    - path: "frontend/src/components/GridItem.tsx"
      provides: "Individual grid item with icon/thumbnail"
      exports: ["GridItem"]
    - path: "frontend/src/components/Column.tsx"
      provides: "Single column for columns view"
      exports: ["Column"]
    - path: "frontend/src/hooks/useViewPersistence.ts"
      provides: "Hook for per-folder view persistence"
      exports: ["useViewPersistence"]
    - path: "frontend/src/styles.css"
      provides: "Grid and columns view styling"
      contains: ".explorer-grid, .explorer-columns"
  key_links:
    - from: "main.tsx"
      to: "ExplorerGrid"
      via: "explorerViewMode state"
      pattern: "{gridViewMode === 'grid' && <ExplorerGrid ... />}"
    - from: "ExplorerGrid"
      to: "VirtualList"
      via: "virtual scrolling integration"
      pattern: "<VirtualList items={sortedItems} ... />"
    - from: "ExplorerColumns"
      to: "Column"
      via: "column array rendering"
      pattern: "columns.map(col => <Column ... />)"
    - from: "useViewPersistence"
      to: "localStorage"
      via: "persist view per folder path"
      pattern: "localStorage.setItem(`view:${path}`, viewMode)"
---

# Phase 6: Explorer Enhancements — Overview

## Objective

Complete the Explorer Mode by implementing Grid view (icon-based browsing) and Columns view (Miller columns / Finder-style navigation) alongside the existing Tree and List views. This transforms Orbit into a full-featured file manager adaptable to different workflows.

**Purpose**: Enable visual file browsing and rapid folder traversal to complement hierarchical and detailed list views.

**Output**: Two new view components (Grid, Columns) with view persistence and seamless view switching.

---

## Context

### Current State (v1.0)
- ✅ Tree view — Hierarchical folder navigation with expand/collapse
- ✅ List view — Detailed file listing with columns (name, size, modified)
- ✅ Virtual scrolling for large lists (threshold: 50 items)
- ✅ View switcher UI pattern established

### Existing Patterns
From `frontend/src/main.tsx`:
- View mode state: `const [explorerViewMode, setExplorerViewMode] = useState<ExplorerViewMode>("list")`
- View toggle UI: `<div className="view-toggle">` with buttons for "List" and "Tree"
- Explorer views receive: `items`, `selectedPath`, `onSelect`, `onNavigate` props

From `frontend/src/components/ExplorerList.tsx`:
- Virtual scrolling via `<VirtualList>` component for >50 items
- Sorting: directories first, then alphabetically by name
- File icons via CSS classes: `.file-icon.folder`, `.file-icon.image`, etc.
- Parent navigation row for going up

From `frontend/src/components/VirtualList.tsx`:
- Props: `items`, `renderItem`, `itemHeight`, `overscan`, `selectedIndex`, `onSelectIndex`
- Keyboard navigation: ArrowUp, ArrowDown, Home, End

---

## Plan Structure

### Plan 06-01: Grid View Implementation
**Wave**: 1  
**Objective**: Implement icon-based file browsing with CSS Grid layout and virtual scrolling  
**Key Deliverables**:
- `ExplorerGrid` component with CSS Grid container
- `GridItem` component with icon/thumbnail display
- Icon size selector (48/64/96/128px) with persistence
- Sort controls (name, size, modified)
- Virtual scrolling integration for large folders
- View persistence hook integration

**Files Created**:
- `frontend/src/components/ExplorerGrid.tsx`
- `frontend/src/components/GridItem.tsx`

**Files Modified**:
- `frontend/src/main.tsx` — Add grid view mode and view toggle
- `frontend/src/styles.css` — Grid view styles

---

### Plan 06-02: Columns View Implementation
**Wave**: 2 (depends on 06-01 for view persistence hook)  
**Objective**: Implement Miller columns / Finder-style navigation  
**Key Deliverables**:
- `ExplorerColumns` component with horizontal layout
- `Column` component with scrollable file list
- Selection cascade (selection flows to next column)
- Keyboard navigation (← → keys to move between columns)
- Column width persistence per session
- Integration with existing selection state

**Files Created**:
- `frontend/src/components/ExplorerColumns.tsx`
- `frontend/src/components/Column.tsx`

**Files Modified**:
- `frontend/src/main.tsx` — Add columns view mode
- `frontend/src/styles.css` — Columns view styles

---

## Dependencies

### Technical Dependencies
- **Virtual scrolling**: `VirtualList` component and `useVirtualScroll` hook (already implemented)
- **Selection state**: Managed in `main.tsx`, passed via props
- **File type icons**: CSS classes defined in `styles.css`
- **Tauri commands**: `list_children`, `get_file` (already implemented)

### Phase Dependencies
- **Phase 5 (Packaging)**: Must be complete for desktop integration features
- **Phase 7 (Asset Mode)**: Grid view thumbnails will be enhanced by Phase 7 thumbnail generation

---

## Success Criteria

1. **Grid View Works**: User can browse files in icon grid with smooth scrolling
2. **Icon Sizes**: User can choose 48/64/96/128px sizes; choice persists
3. **Thumbnails**: Images show previews (placeholder for Phase 7 integration), other files show type icons
4. **Columns View Works**: User can navigate folder hierarchy via Miller columns
5. **Keyboard Navigation**: ← → keys move focus between columns; ↑ ↓ navigate within columns
6. **View Persistence**: App remembers last used view per folder in localStorage
7. **View Switching**: Seamless switch between all 4 views without state loss

---

## Requirements Mapping

| Requirement | Plan Coverage |
|-------------|---------------|
| **EXPL-05** (Grid view) | Plan 06-01 |
| **EXPL-06** (Columns view) | Plan 06-02 |

---

## User Setup

None — all features use existing infrastructure.

---

## Threat Model

No new trust boundaries in Phase 6. Views consume data from existing SQLite database and Tauri commands.

---

## Verification

- Grid view renders 1000+ files with virtual scrolling
- Columns view handles deep folder hierarchies (10+ levels)
- View persistence survives app restart
- All 4 views share selection state correctly

---

## Next Steps

Execute plans in order:
1. `/gsd-execute-phase 06-01` — Grid View
2. `/gsd-execute-phase 06-02` — Columns View

<sub>Phase overview created: 2026-04-29</sub>
