---
phase: "1"
plan: "01-02"
name: "Workspace Open, Scan Job, Metadata Extraction, Database Schema"
status: complete
completed: "2026-04-29"
duration: "N/A (pre-existing)"
---

# Plan 01-02 Summary: Core Indexing

## One-Liner
Workspace folder selection, parallel filesystem scanning with jwalk, comprehensive metadata extraction, and SQLite persistence with optimized schema.

## What Was Built

### Workspace Open Command
- **`choose_folder`**: Uses rfd crate for native folder picker dialog
- **`default_root_path`**: Returns current working directory as default
- Frontend integration: "Open Folder" button in topbar
- State management: rootPath and currentPath tracked in React state

### Scan Job Implementation
- **`scan_workspace`**: Async Tauri command that orchestrates scanning
- **Parallel scanning**: Uses jwalk with Rayon thread pool for performance
- **Directory filtering**: Ignores .git, node_modules, target, dist, build, __pycache__, thumbnails, Trash, .cache, .local
- **Entry limit**: 120,000 max entries to prevent memory issues
- **Error handling**: Gracefully skips unreadable files

### Metadata Extraction
Each scanned file/folder extracts:
| Field | Source | Notes |
|-------|--------|-------|
| path | fs entry | Canonical absolute path |
| name | path.file_name() | Empty string fallback |
| parent_path | path.parent() | None for root |
| extension | path.extension() | Lowercase, None for dirs |
| mime_type | extension guess | inode/directory for folders |
| size_bytes | metadata.len() | 0 for directories |
| modified_at | metadata.modified() | Unix epoch seconds |
| created_at | metadata.created() | Unix epoch seconds |
| is_dir | metadata.is_dir() | Boolean |
| is_symlink | file_type().is_symlink() | Boolean |
| target_path | fs::read_link() | Resolved symlink target |

### Database Schema

**scan_sessions table:**
```sql
CREATE TABLE scan_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  skipped_unchanged INTEGER NOT NULL DEFAULT 0
);
```

**files table:**
```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_path TEXT,
  extension TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  modified_at INTEGER,
  created_at INTEGER,
  hash TEXT,
  is_dir INTEGER NOT NULL DEFAULT 0,
  is_symlink INTEGER NOT NULL DEFAULT 0,
  target_path TEXT,
  last_seen_scan_id INTEGER
);
```

**edges table:**
```sql
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  UNIQUE(source_id, target_id, edge_type)
);
```

**Indexes:**
- idx_files_path, idx_files_parent, idx_files_name, idx_files_dir
- idx_edges_source, idx_edges_target

### Data Flow
1. User clicks "Open Folder" → `choose_folder` → updates rootPath
2. User clicks "Scan" → `scan_workspace` invoked with rootPath
3. Scanner walks filesystem with jwalk (parallel)
4. Each entry converted to ScannedEntry with full metadata
5. Database transaction batches all inserts/updates
6. Containment edges rebuilt for parent-child relationships
7. Scan session recorded with counts and timing

## Key Decisions

1. **jwalk over walkdir**: 3-10x faster parallel directory walking
2. **Transaction batching**: All rows in single transaction for performance
3. **Canonical paths**: All paths resolved to absolute to avoid duplicates
4. **MIME guessing**: Extension-based rather than file content (faster)
5. **Parent_path stored**: Enables fast tree traversal queries

## Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/main.rs` | Added choose_folder, scan_workspace, list_children commands |
| `src-tauri/src/scanner.rs` | Full scanning implementation with jwalk |
| `src-tauri/src/db.rs` | Database schema, index_rows, upsert logic |
| `src-tauri/src/models.rs` | ScannedEntry, FileRecord structs |
| `frontend/src/main.tsx` | UI for folder picker, scan button, explorer view |

## Verification

```bash
# Test folder picker
# (Run app and click "Open Folder" - should show native dialog)

# Test scanning
cd /home/lamb/Projects/Orbit-Graph-based-workspace-explorer
npm run dev
# Click "Open Folder", select a directory, click "Scan"

# Verify database
sqlite3 ~/.local/share/orbit/orbit.db "SELECT COUNT(*) FROM files;"
sqlite3 ~/.local/share/orbit/orbit.db "SELECT * FROM scan_sessions ORDER BY id DESC LIMIT 1;"

# Check indexes
sqlite3 ~/.local/share/orbit/orbit.db ".indexes files"
```

## Deviations

None - implementation matches requirements exactly.

## Success Criteria

- [x] User can open a folder dialog and select a workspace
- [x] Selected workspace path is displayed in the UI
- [x] Scan job walks the filesystem and extracts metadata
- [x] Metadata includes all required fields
- [x] SQLite schema supports all metadata fields with indexes
- [x] Files are stored in the database after scanning

## Performance Notes

- jwalk uses all CPU cores via Rayon
- Single transaction for all database writes
- WAL mode for concurrent read/write
- Ignored directories prevent wasteful scanning
- 120K entry limit prevents memory exhaustion
