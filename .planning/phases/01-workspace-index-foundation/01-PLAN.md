---
phase: 1
name: Workspace Index Foundation
created: 2026-04-29
---

# Phase 1 Plan Document

## Objective
Enable users to open a folder as a workspace, scan it for files, and persist useful metadata in SQLite.

## Plans Overview

### Plan 01-01: Tauri 2 + React + TypeScript + Rust + SQLite App Shell
**Status:** Complete ✓

Set up the foundational application architecture with all required technologies.

**Requirements:** None (first plan)
**Success Criteria:**
- [x] Tauri 2 project structure initialized
- [x] React + TypeScript frontend configured with Vite
- [x] Rust backend with Cargo.toml dependencies
- [x] SQLite integration via rusqlite
- [x] Build scripts functional (npm run dev, npm run tauri:dev)

**Key Implementation:**
- `src-tauri/` - Tauri project with Cargo.toml, tauri.conf.json
- `frontend/` - React app with TypeScript, Vite config
- Dependencies: tauri, rusqlite, jwalk, chrono, serde, rfd, open

---

### Plan 01-02: Workspace Open, Scan Job, Metadata Extraction, Database Schema
**Status:** Complete ✓
**Depends on:** 01-01

Implement the core workspace indexing functionality.

**Requirements:** WORK-01, WORK-02, WORK-03, INDX-01, INDX-02
**Success Criteria:**
- [x] User can open a folder dialog and select a workspace
- [x] Selected workspace path is displayed in the UI
- [x] Scan job walks the filesystem and extracts metadata
- [x] Metadata includes: path, name, parent_path, extension, mime_type, size, modified_at, created_at, is_dir, is_symlink
- [x] SQLite schema supports all metadata fields with appropriate indexes
- [x] Files are stored in the database after scanning

**Key Implementation:**
- `choose_folder` command (rfd file dialog)
- `scan_workspace` async command
- `scanner.rs` - jwalk-based parallel scanning
- `db.rs` - Database schema and indexing operations
- `models.rs` - ScannedEntry, FileRecord structs

**Files Created/Modified:**
- `src-tauri/src/main.rs` - Commands
- `src-tauri/src/scanner.rs` - Scanning logic
- `src-tauri/src/db.rs` - Database operations
- `src-tauri/src/models.rs` - Data structures

---

### Plan 01-03: Scan Progress, Logging, Error Reporting, Unchanged-File Skip
**Status:** Complete ✓
**Depends on:** 01-02

Add observability and efficiency features to the scanning system.

**Requirements:** INDX-03, INDX-04, INDX-05
**Success Criteria:**
- [x] Scan progress shows: scanned count, inserted/updated count, skipped count, duration
- [x] Progress is visible in the UI during and after scan
- [x] App writes durable logs to a file for debugging
- [x] Scan errors are captured and displayed
- [x] Unchanged files (same modified_at + size) are skipped on re-scan
- [x] Skipped count is reported in progress

**Key Implementation:**
- `ScanProgress` struct with full metrics
- `logger.rs` - File-based logging to ~/.local/share/orbit/app.log
- `upsert_row` with modified_at + size_bytes comparison
- Frontend StatusBlock component for progress display
- Error state handling in UI

**Files Created/Modified:**
- `src-tauri/src/logger.rs` - Logging module
- `src-tauri/src/db.rs` - Upsert with skip logic
- `src-tauri/src/main.rs` - Progress tracking
- `frontend/src/main.tsx` - Status UI

---

## Execution Order

1. **01-01** → Foundation (already complete)
2. **01-02** → Core indexing (already complete)
3. **01-03** → Observability & efficiency (already complete)

## Deliverables Summary

| Deliverable | Status | Location |
|-------------|--------|----------|
| Tauri 2 app shell | ✓ | src-tauri/, frontend/ |
| Workspace open command | ✓ | src-tauri/src/main.rs |
| Scan job implementation | ✓ | src-tauri/src/scanner.rs |
| Database schema | ✓ | src-tauri/src/db.rs |
| Metadata extraction | ✓ | src-tauri/src/scanner.rs |
| Progress reporting | ✓ | ScanProgress struct + UI |
| Durable logging | ✓ | src-tauri/src/logger.rs |
| Unchanged-file skip | ✓ | db.rs upsert_row() |
| React UI | ✓ | frontend/src/main.tsx |

## Verification Commands

```bash
# Build and run
cd /home/lamb/Projects/Orbit-Graph-based-workspace-explorer
npm run dev

# Check database schema
sqlite3 ~/.local/share/orbit/orbit.db ".schema"

# View logs
cat ~/.local/share/orbit/app.log

# Test scan
cargo test --manifest-path src-tauri/Cargo.toml 2>/dev/null || echo "Tests not yet implemented"
```

## Success Criteria Check

All Phase 1 success criteria are met:
- ✓ User can choose a folder and see it as the active workspace
- ✓ User can start a scan and see scan progress, completion, and errors
- ✓ SQLite contains file/folder metadata for the scanned workspace
- ✓ Re-running a scan skips unchanged files where metadata allows it
- ✓ Scan, SQLite, watcher, and graph-scope issues are written to durable app logs
