---
updated_at: "2026-05-01T08:25:37Z"
---

## Architecture Overview

Orbit is a graph-first file intelligence IDE built with **Tauri 2** (Rust backend + React frontend). The architecture follows a layered pattern with clear separation between filesystem operations, data persistence, and UI rendering.

**Core Pattern:** Command-based IPC with SQLite persistence and graph-based visualization

## Key Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| Main Entry | `src-tauri/src/main.rs` | Tauri app setup, command registration, state management |
| Models | `src-tauri/src/models.rs` | Core data structures (FileRecord, GraphNode, etc.) |
| Scanner | `src-tauri/src/scanner.rs` | Parallel filesystem scanning with jwalk |
| Database | `src-tauri/src/db.rs` | SQLite persistence with rusqlite |
| Graph Engine | `src-tauri/src/graph.rs` | Graph construction with clustering |
| Commands | `src-tauri/src/commands/` | Tauri command handlers organized by domain |
| Code Analysis | `src-tauri/src/code_analyzer.rs` | Import/export extraction using regex |
| Git Integration | `src-tauri/src/git_status.rs` | Git status via git2 crate |
| Image Analysis | `src-tauri/src/image_analyzer.rs` | Image metadata extraction |
| Frontend Entry | `frontend/src/main.tsx` | React app root with mode switching |
| Tauri Bridge | `frontend/src/lib/tauriCommands.ts` | Type-safe command invocations |
| Graph View | `frontend/src/components/GraphView.tsx` | Sigma.js graph rendering |
| Editor Store | `frontend/src/stores/editorStore.ts` | Zustand state management |

## Data Flow

1. **Scan Phase:** `scanner.rs` → `jwalk` parallel walk → `db.rs` SQLite indexing
2. **Graph Load:** Frontend `GraphRequest` → `graph.rs` → SQL query → `GraphPayload` → Sigma.js render
3. **File Operations:** Frontend → Tauri command → filesystem/SQLite → JSON response
4. **Code Analysis:** File read → regex parsing → SQLite cache → TypeScript types

## Conventions

### Naming
- Rust: `snake_case` for functions/variables, `PascalCase` for types
- TypeScript: `camelCase` for functions/variables, `PascalCase` for types/components
- Files: Rust modules in `snake_case.rs`, React components in `PascalCase.tsx`

### File Organization
- `src-tauri/src/` - Rust backend organized by concern
- `src-tauri/src/commands/` - Tauri command handlers (file, analysis, image, thumbnail)
- `frontend/src/components/` - React components organized by feature
- `frontend/src/hooks/` - Custom React hooks
- `frontend/src/stores/` - Zustand state stores
- `frontend/src/types/` - TypeScript type definitions

### Import Patterns
- Rust: explicit module imports with `use crate::`
- TypeScript: absolute imports from `../types`, `../utils`, `../lib/`

### Performance Constraints
- Max scan entries: 120,000 (`MAX_SCAN_ENTRIES` in main.rs)
- Default graph node limit: 200 (`DEFAULT_NODE_LIMIT` in graph.rs)
- Folder cluster threshold: 50 children (`FOLDER_CLUSTER_THRESHOLD`)
- Virtual scrolling for large lists
- React.memo for component optimization

### Key Design Decisions
1. **SQLite as primary store:** Filesystem metadata cached in SQLite for fast queries
2. **Graph clustering:** Folders with >50 children auto-cluster to limit node count
3. **Scoped graph views:** Graph requests carry root_path and scope_path for performance
4. **Lazy code analysis:** Code analysis computed on-demand and cached in SQLite
5. **Thumbnail caching:** Generated thumbnails stored in app data directory
