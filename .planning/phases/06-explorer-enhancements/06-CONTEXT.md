# Phase 6: Explorer Enhancements

**Phase**: 6  
**Milestone**: v2.0 — Desktop Experience  
**Status**: ✅ Planning Complete  
**Dependencies**: Phase 5

---

## Purpose

Phase 6 completes the Explorer Mode by adding Grid view and Columns view alongside the existing Tree and List views. This makes Orbit a full-featured file manager that can adapt to different workflows—from hierarchical navigation (Tree), to detailed listings (List), to visual browsing (Grid), to rapid folder traversal (Columns).

---

## Current State (v1.0)

**Implemented**:
- ✅ Tree view — Hierarchical folder navigation with expand/collapse
- ✅ List view — Detailed file listing with columns (name, size, modified)

**Missing**:
- ❌ Grid view — Icon-based browsing with thumbnails
- ❌ Columns view — Miller columns / Finder-style navigation

---

## Scope

### In Scope

1. **Grid View Implementation**:
   - Icon-based file display (48px, 64px, 96px, 128px sizes)
   - Thumbnail support for images
   - Generic icons by file type
   - Multi-select support
   - Context menu integration
   - Sort options (name, size, modified)

2. **Columns View Implementation**:
   - Miller columns (multiple panes showing folder hierarchy)
   - Each column shows one folder's contents
   - Selection cascades to next column
   - Keyboard navigation (← → to move between columns)
   - Column width persistence
   - Smooth scrolling

3. **View Mode Persistence**:
   - Remember last used view per folder
   - Global default view setting
   - View switcher in toolbar

### Out of Scope (Deferred)

- Cover flow view (macOS style)
- Custom view layouts
- Icon positioning (free-form desktop-style)

---

## User Experience

### Grid View

```
┌─────────────────────────────────────┐
│ [Tree] [List] [Grid*] [Columns]     │
├─────────────────────────────────────┤
│ ┌────┐  ┌────┐  ┌────┐  ┌────┐     │
│ │📄  │  │📁  │  │🖼️  │  │📄  │     │
│ │file│  │docs│  │img │  │note│     │
│ └────┘  └────┘  └────┘  └────┘     │
│ ┌────┐  ┌────┐  ┌────┐             │
│ │📄  │  │📄  │  │🖼️  │             │
│ │src │  │test│  │bg  │             │
│ └────┘  └────┘  └────┘             │
│                                     │
│ [48px ▼]  Sort: [Name ▼]            │
└─────────────────────────────────────┘
```

### Columns View

```
┌────────┬────────┬────────┬─────────────────┐
│Home    │Projects│Orbit   │   Empty space   │
├────────┼────────┼────────┤   or preview    │
│📁 Docs │📁 src  │📄 main│                 │
│📁 Proj→│📁 lib  │📄 lib │                 │
│📁 Down │📁 test→│📄 test│                 │
│📄 todo │📄 read→│📄 conf│                 │
│        │        │       │                 │
└────────┴────────┴────────┴─────────────────┘
      ↑
  Selection flows right
```

---

## Technical Design

### Grid View

**Component Structure**:
```
GridView
├── GridToolbar (size selector, sort)
├── GridContainer (CSS Grid)
│   └── GridItem (file/folder)
│       ├── Thumbnail/Icon
│       └── Label
└── ContextMenu (shared with other views)
```

**Performance Considerations**:
- Virtual scrolling for large folders (reuse v1.0 pattern)
- Lazy thumbnail loading
- Icon size options (affects grid density)

**API Requirements**:
- Same as List view (get folder contents)
- Thumbnail generation (see Phase 7)

### Columns View

**Component Structure**:
```
ColumnsView
├── ColumnsContainer (horizontal flex)
│   └── Column (reusable component)
│       ├── ColumnHeader (breadcrumb)
│       └── ColumnList (scrollable)
│           └── ColumnItem
└── KeyboardHandler (← → navigation)
```

**State Management**:
- Track selected path per column
- Cascade selection to next column
- Column scroll positions

**Performance Considerations**:
- Load columns on demand (don't preload deep hierarchies)
- Animate column transitions
- Limit column width minimum

---

## User Decisions Required

| Decision | Options | Default | Impact |
|----------|---------|---------|--------|
| Default view mode | Tree / List / Grid / Columns | List | Affects all folders initially |
| Grid icon size | 48 / 64 / 96 / 128 px | 64px | Affects grid density |
| Folder view memory | Yes / No | Yes | Persist view per folder |

---

## Dependencies

- **Phase 1-4**: Core file system, database, selection state
- **Phase 5**: Desktop integration (optional but recommended)
- **Phase 7**: Thumbnail generation (for Grid view image previews)

---

## Success Criteria

1. **Grid View Works**: User can browse files in icon grid
2. **Icon Sizes**: User can choose 48/64/96/128px sizes
3. **Thumbnails**: Images show previews, other files show type icons
4. **Columns View Works**: User can navigate via Miller columns
5. **Keyboard Navigation**: ← → keys move between columns
6. **View Persistence**: App remembers view mode per folder
7. **View Switching**: Seamless switch between all 4 views

---

## Requirements Mapping

| Requirement | Phase 6 Coverage |
|-------------|------------------|
| EXPL-01 (Tree view) | ✅ Already complete |
| EXPL-02 (List view) | ✅ Already complete |
| EXPL-03 (Select items) | ✅ Shared across views |
| EXPL-04 (Open externally) | ✅ Shared across views |
| **EXPL-05 (Grid view)** | **🆕 Phase 6** |
| **EXPL-06 (Columns view)** | **🆕 Phase 6** |

---

## Phase 6 Plan Structure

### Plan 06-01: Grid View Implementation
- Grid layout component with CSS Grid
- Grid item component with icon/thumbnail
- Icon size selector
- Sort controls
- Virtual scrolling integration
- View persistence

### Plan 06-02: Columns View Implementation
- Column container with horizontal scroll
- Column component with selection state
- Keyboard navigation (← →)
- Selection cascade logic
- Column width persistence
- Integration with selection state

---

*Phase 6 Context created: 2026-04-29*  
*Milestone: v2.0 — Desktop Experience*
