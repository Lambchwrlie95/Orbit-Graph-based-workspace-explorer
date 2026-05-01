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

        -- Code analysis table for storing import/export data
        CREATE TABLE IF NOT EXISTS code_analysis (
            file_id INTEGER PRIMARY KEY,
            imports JSON DEFAULT '[]',
            exports JSON DEFAULT '[]',
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_code_analysis_file ON code_analysis(file_id);

        -- Import relationships table for tracking file dependencies
        CREATE TABLE IF NOT EXISTS import_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file_id INTEGER NOT NULL,
            target_path TEXT NOT NULL,
            import_type TEXT NOT NULL,
            FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_imports_source ON import_relationships(source_file_id);
        CREATE INDEX IF NOT EXISTS idx_imports_target ON import_relationships(target_path);

        -- Thumbnail metadata storage
        CREATE TABLE IF NOT EXISTS thumbnails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            size INTEGER NOT NULL,
            path TEXT NOT NULL,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_modified_at TIMESTAMP,
            width INTEGER,
            height INTEGER,
            UNIQUE(file_id, size)
        );

        CREATE INDEX IF NOT EXISTS idx_thumbnails_file_id ON thumbnails(file_id);
        CREATE INDEX IF NOT EXISTS idx_thumbnails_size ON thumbnails(size);

        -- Perceptual hash table (for duplicate detection)
        CREATE TABLE IF NOT EXISTS perceptual_hashes (
            file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
            phash BLOB NOT NULL,
            algorithm TEXT DEFAULT 'phash',
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Asset tags tables
        CREATE TABLE IF NOT EXISTS asset_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#6366F1',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS file_asset_tags (
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES asset_tags(id) ON DELETE CASCADE,
            PRIMARY KEY (file_id, tag_id)
        );

        CREATE INDEX IF NOT EXISTS idx_file_asset_tags_tag_id ON file_asset_tags(tag_id);

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
          last_seen_scan_id INTEGER,
          metadata TEXT
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
            SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir, metadata
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
            SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir, metadata
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
        SELECT id, path, name, parent_path, extension, mime_type, size_bytes, modified_at, created_at, is_dir, metadata
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
        metadata: row.get(10).ok(),
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

// Code analysis storage
pub fn store_code_analysis(
    db_path: &Path,
    file_id: i64,
    imports: &serde_json::Value,
    exports: &serde_json::Value,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        INSERT INTO code_analysis (file_id, imports, exports, analyzed_at)
        VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
        ON CONFLICT(file_id) DO UPDATE SET
            imports = excluded.imports,
            exports = excluded.exports,
            analyzed_at = excluded.analyzed_at
        "#,
        params![file_id, imports.to_string(), exports.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_code_analysis(db_path: &Path, file_id: i64) -> Result<Option<(String, String)>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let result: Option<(String, String)> = conn
        .query_row(
            "SELECT imports, exports FROM code_analysis WHERE file_id = ?1",
            params![file_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn clear_code_analysis_for_root(db_path: &Path, root_path: &str) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        DELETE FROM code_analysis
        WHERE file_id IN (
            SELECT id FROM files
            WHERE path = ?1 OR path LIKE ?2 ESCAPE '\'
        )
        "#,
        params![root_path, super::db::child_prefix(root_path)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Thumbnail operations
pub struct ThumbnailRecord {
    pub id: i64,
    pub file_id: i64,
    pub size: i32,
    pub path: String,
    pub generated_at: i64,
    pub file_modified_at: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

pub fn get_thumbnail(db_path: &Path, file_id: i64, size: i32) -> Result<Option<ThumbnailRecord>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        r#"
        SELECT id, file_id, size, path,
               CAST(strftime('%s', generated_at) AS INTEGER),
               file_modified_at, width, height
        FROM thumbnails WHERE file_id = ?1 AND size = ?2
        "#,
        params![file_id, size],
        |row| {
            Ok(ThumbnailRecord {
                id: row.get(0)?,
                file_id: row.get(1)?,
                size: row.get(2)?,
                path: row.get(3)?,
                generated_at: row.get(4)?,
                file_modified_at: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn upsert_thumbnail(
    db_path: &Path,
    file_id: i64,
    size: i32,
    path: &str,
    file_modified_at: i64,
    width: i32,
    height: i32,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        INSERT INTO thumbnails (file_id, size, path, file_modified_at, width, height)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(file_id, size) DO UPDATE SET
            path = excluded.path,
            generated_at = CURRENT_TIMESTAMP,
            file_modified_at = excluded.file_modified_at,
            width = excluded.width,
            height = excluded.height
        "#,
        params![file_id, size, path, file_modified_at, width, height],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_thumbnails_for_file(db_path: &Path, file_id: i64) -> Result<Vec<ThumbnailRecord>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, file_id, size, path,
                   CAST(strftime('%s', generated_at) AS INTEGER),
                   file_modified_at, width, height
            FROM thumbnails WHERE file_id = ?1
            ORDER BY size
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![file_id], |row| {
            Ok(ThumbnailRecord {
                id: row.get(0)?,
                file_id: row.get(1)?,
                size: row.get(2)?,
                path: row.get(3)?,
                generated_at: row.get(4)?,
                file_modified_at: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut thumbs = Vec::new();
    for row in rows {
        thumbs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(thumbs)
}

pub fn delete_thumbnails_for_file(db_path: &Path, file_id: i64) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM thumbnails WHERE file_id = ?1",
        params![file_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_file_metadata(
    db_path: &Path,
    file_id: i64,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Get existing metadata
    let existing: Option<String> = conn
        .query_row(
            "SELECT metadata FROM files WHERE id = ?1",
            params![file_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    // Parse existing or create new
    let mut metadata: serde_json::Value = existing
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    // Update the key
    metadata[key] = serde_json::Value::String(value.to_string());

    // Save back
    let metadata_str = serde_json::to_string(&metadata).unwrap_or_default();
    conn.execute(
        "UPDATE files SET metadata = ?1 WHERE id = ?2",
        params![metadata_str, file_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
