use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::models::{FileRecord, ScannedEntry};

pub fn init_database(db_path: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE IF NOT EXISTS scan_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          root_path TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          status TEXT NOT NULL,
          scanned_count INTEGER NOT NULL DEFAULT 0,
          skipped_unchanged INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS files (
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

        CREATE TABLE IF NOT EXISTS edges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id INTEGER NOT NULL,
          target_id INTEGER NOT NULL,
          edge_type TEXT NOT NULL,
          weight REAL NOT NULL DEFAULT 1.0,
          UNIQUE(source_id, target_id, edge_type)
        );

        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS file_tags (
          file_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY(file_id, tag_id)
        );

        CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
        CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_path);
        CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
        CREATE INDEX IF NOT EXISTS idx_files_dir ON files(is_dir);
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
        "#,
    )
    .map_err(|e| e.to_string())
}

pub fn index_rows(
    db_path: &Path,
    root_path: &str,
    rows: &[ScannedEntry],
) -> Result<(usize, usize), String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();
    tx.execute(
        "INSERT INTO scan_sessions(root_path, started_at, status) VALUES (?1, ?2, 'running')",
        params![root_path, now],
    )
    .map_err(|e| e.to_string())?;
    let scan_id = tx.last_insert_rowid();

    let mut changed = 0usize;
    let mut skipped = 0usize;
    for row in rows {
        if upsert_row(&tx, row, scan_id)? {
            changed += 1;
        } else {
            skipped += 1;
        }
    }
    rebuild_contains_edges(&tx, root_path)?;
    tx.execute(
        "UPDATE scan_sessions SET finished_at = ?1, status = 'success', scanned_count = ?2, skipped_unchanged = ?3 WHERE id = ?4",
        params![chrono::Utc::now().timestamp(), rows.len() as i64, skipped as i64, scan_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok((changed, skipped))
}

fn upsert_row(tx: &Transaction<'_>, row: &ScannedEntry, scan_id: i64) -> Result<bool, String> {
    let existing: Option<(i64, Option<i64>, i64)> = tx
        .query_row(
            "SELECT id, modified_at, size_bytes FROM files WHERE path = ?1",
            params![row.path],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let unchanged = existing
        .map(|(_, modified_at, size_bytes)| {
            modified_at == row.modified_at && size_bytes == row.size_bytes
        })
        .unwrap_or(false);

    tx.execute(
        r#"
        INSERT INTO files(path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir, is_symlink, target_path, last_seen_scan_id)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          parent_path = excluded.parent_path,
          extension = excluded.extension,
          mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes,
          modified_at = excluded.modified_at,
          created_at = excluded.created_at,
          is_dir = excluded.is_dir,
          is_symlink = excluded.is_symlink,
          target_path = excluded.target_path,
          last_seen_scan_id = excluded.last_seen_scan_id
        "#,
        params![
            row.path,
            row.name,
            row.parent_path,
            row.extension,
            row.mime_type,
            row.size_bytes,
            row.modified_at,
            row.created_at,
            bool_to_int(row.is_dir),
            bool_to_int(row.is_symlink),
            row.target_path,
            scan_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(!unchanged)
}

fn rebuild_contains_edges(tx: &Transaction<'_>, root_path: &str) -> Result<(), String> {
    let root_prefix = child_prefix(root_path);
    tx.execute(
        "DELETE FROM edges WHERE edge_type = 'contains' AND (source_id IN (SELECT id FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\') OR target_id IN (SELECT id FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'))",
        params![root_path, root_prefix],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        r#"
        INSERT OR IGNORE INTO edges(source_id, target_id, edge_type, weight)
        SELECT parent.id, child.id, 'contains', 1.0
        FROM files child
        JOIN files parent ON parent.path = child.parent_path
        WHERE child.path = ?1 OR child.path LIKE ?2 ESCAPE '\'
        "#,
        params![root_path, child_prefix(root_path)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn children(db_path: &Path, parent_path: &str, limit: i64) -> Result<Vec<FileRecord>, String> {
    children_paginated(db_path, parent_path, 0, limit)
}

pub fn children_paginated(
    db_path: &Path,
    parent_path: &str,
    offset: i64,
    limit: i64,
) -> Result<Vec<FileRecord>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir
            FROM files
            WHERE parent_path = ?1
            ORDER BY is_dir DESC, name COLLATE NOCASE ASC
            LIMIT ?2 OFFSET ?3
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![parent_path, limit, offset], file_from_row)
        .map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for row in rows {
        files.push(row.map_err(|e| e.to_string())?);
    }
    Ok(files)
}

pub fn get_children_count(db_path: &Path, parent_path: &str) -> Result<i64, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COUNT(*) FROM files WHERE parent_path = ?1",
        params![parent_path],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn search_files(
    db_path: &Path,
    root_path: &str,
    query: &str,
    limit: i64,
) -> Result<Vec<FileRecord>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query.trim());
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir
            FROM files
            WHERE (path = ?1 OR path LIKE ?2 ESCAPE '\') AND name LIKE ?3
            ORDER BY is_dir DESC, name COLLATE NOCASE ASC
            LIMIT ?4
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(
            params![root_path, child_prefix(root_path), pattern, limit],
            file_from_row,
        )
        .map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for row in rows {
        files.push(row.map_err(|e| e.to_string())?);
    }
    Ok(files)
}

pub fn get_file(db_path: &Path, path: &str) -> Result<Option<FileRecord>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        r#"
        SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir
        FROM files
        WHERE path = ?1
        "#,
        params![path],
        file_from_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn file_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRecord> {
    Ok(FileRecord {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        parent_path: row.get(3)?,
        extension: row.get(4)?,
        mime_type: row.get(5)?,
        size_bytes: row.get(6)?,
        modified_at: row.get(7)?,
        created_at: row.get(8)?,
        is_dir: row.get::<_, i64>(9)? == 1,
    })
}

pub fn child_prefix(root_path: &str) -> String {
    let mut prefix = root_path
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    if !prefix.ends_with(std::path::MAIN_SEPARATOR) {
        prefix.push(std::path::MAIN_SEPARATOR);
    }
    prefix.push('%');
    prefix
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}
