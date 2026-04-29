---
phase: "1"
plan: "01-03"
name: "Scan Progress, Logging, Error Reporting, Unchanged-File Skip"
status: complete
completed: "2026-04-29"
duration: "N/A (pre-existing)"
---

# Plan 01-03 Summary: Observability & Efficiency

## One-Liner
Real-time scan progress reporting, durable file-based logging, error handling, and intelligent unchanged-file skipping for efficient re-scans.

## What Was Built

### Scan Progress Reporting

**Backend (`ScanProgress` struct):**
```rust
pub struct ScanProgress {
    pub root_path: String,
    pub scanned: usize,              // Total entries found
    pub inserted_or_updated: usize,  // New or changed files
    pub skipped_unchanged: usize,    // Unchanged files skipped
    pub duration_ms: u128,           // Scan time in milliseconds
    pub log_path: Option<String>,    // Path to log file
}
```

**Frontend (`StatusBlock` component):**
- Displays current status (scanning, loading, error states)
- Shows scan metrics in a definition list:
  - Scanned: Total entries processed
  - Changed: New or modified files indexed
  - Skipped: Unchanged files (efficiency metric)
- Displays log file path (truncated)
- Shows error messages when operations fail

### Durable Logging

**Implementation (`logger.rs`):**
```rust
const APP_DIR: &str = "orbit";
const LOG_FILE: &str = "app.log";

pub fn log_event(message: impl AsRef<str>) {
    // Writes to ~/.local/share/orbit/app.log
    // Format: [ISO8601] message
    // Creates directories if needed
    // Appends to existing log
}
```

**Log Events Captured:**
- App startup with database path
- Scan started with root path
- Scan completion with counts and duration
- Graph load requests with scope info
- Any errors during operations

**Log Location:**
- Linux: `~/.local/share/orbit/app.log`
- Windows: `%LOCALAPPDATA%\orbit\app.log`
- macOS: `~/Library/Application Support/orbit/app.log`

### Error Reporting

**Backend Error Handling:**
- All commands return `Result<T, String>` for consistent error propagation
- Errors include context (file path, operation type)
- Scanner gracefully skips unreadable files
- Database errors include SQL context

**Frontend Error Display:**
- `error` state tracks current error message
- Errors displayed in red below status block
- Cleared on new operations
- Example errors:
  - "Permission denied" for protected directories
  - "Path does not exist" for invalid paths
  - "Database locked" for concurrent access issues

### Unchanged-File Skip Behavior

**Algorithm (`upsert_row` in db.rs):**
```rust
// 1. Check for existing file by path
let existing = tx.query_row(
    "SELECT modified_at, size_bytes FROM files WHERE path = ?",
    params![row.path],
    |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, i64>(1)?))
).optional()?;

// 2. Determine if unchanged
let unchanged = existing
    .map(|(modified_at, size_bytes)| {
        modified_at == row.modified_at && size_bytes == row.size_bytes
    })
    .unwrap_or(false);

// 3. Always update database (for last_seen_scan_id)
// 4. Return whether file was unchanged (for counting)
```

**Why This Works:**
- File modification time + size is a reliable change indicator
- Faster than computing file hashes
- Handles content changes that don't affect size (rare but possible)
- last_seen_scan_id always updated to track session membership

**Metrics Tracked:**
- `inserted_or_updated`: Files that were new or had different metadata
- `skipped_unchanged`: Files with same modified_at + size_bytes

**Example Re-scan Performance:**
- First scan: 10,000 files → 10,000 inserted
- Second scan (no changes): 10,000 files → 0 updated, 10,000 skipped
- Second scan (10 changed): 10,000 files → 10 updated, 9,990 skipped

## Key Decisions

1. **modified_at + size check**: Fast and reliable, avoids hash computation
2. **Always update last_seen_scan_id**: Even unchanged files get scan session reference
3. **File-based logs over stdout**: Survives app restarts, easier to share for debugging
4. **ISO8601 timestamps**: Human-readable and sortable
5. **Result<String, String>**: Simple error propagation to TypeScript frontend

## Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/main.rs` | Progress tracking, error propagation, log integration |
| `src-tauri/src/db.rs` | `upsert_row` with unchanged detection, `index_rows` with counting |
| `src-tauri/src/logger.rs` | Full logging implementation |
| `src-tauri/src/models.rs` | `ScanProgress` struct |
| `frontend/src/main.tsx` | `StatusBlock` component, error display, status state |

## Verification

```bash
# Check log file
cat ~/.local/share/orbit/app.log
# Expected output:
# [2026-04-29T14:30:00Z] orbit started: db=/home/user/.local/share/orbit/orbit.db
# [2026-04-29T14:30:15Z] scan started: /home/user/projects
# [2026-04-29T14:30:20Z] scan complete: scanned=1000, changed=1000, skipped=0...

# Test unchanged-file skip
# 1. Scan a folder
# 2. Note the counts (e.g., 1000 inserted, 0 skipped)
# 3. Scan again immediately
# 4. Verify counts (e.g., 0 inserted, 1000 skipped)

# Test error handling
# 1. Try to scan a protected directory
# 2. Verify error appears in UI
# 3. Check log file contains error details

# Verify database state
sqlite3 ~/.local/share/orbit/orbit.db "SELECT scanned_count, skipped_unchanged FROM scan_sessions ORDER BY id DESC LIMIT 2;"
```

## Deviations

None - implementation matches requirements.

## Success Criteria

- [x] Scan progress shows all metrics (scanned, changed, skipped, duration)
- [x] Progress is visible in the UI during and after scan
- [x] App writes durable logs to a file for debugging
- [x] Scan errors are captured and displayed
- [x] Unchanged files are skipped on re-scan
- [x] Skipped count is reported in progress

## Example Log Output

```
[2026-04-29T14:18:22+00:00] orbit started: db=/home/lamb/.local/share/orbit/orbit.db
[2026-04-29T14:18:45+00:00] scan started: /home/lamb/Projects/Orbit-Graph-based-workspace-explorer
[2026-04-29T14:18:45+00:00] scan collected 45 entries for /home/lamb/Projects/Orbit-Graph-based-workspace-explorer
[2026-04-29T14:18:45+00:00] scan complete: scanned=45, changed=45, skipped=0, root=/home/lamb/Projects/Orbit-Graph-based-workspace-explorer, duration=120ms
[2026-04-29T14:20:10+00:00] graph load: root=/home/lamb/Projects/Orbit-Graph-based-workspace-explorer, scope=None, mode=Some("workspace"), limit=Some(1500)
```
