use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::db;

/// Cache status information for a workspace
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatus {
    pub root_path: String,
    pub file_count: i64,
    pub last_scan_time: Option<i64>,
    pub is_fresh: bool,
    pub is_stale: bool,
    pub stale_reason: Option<String>,
    pub sample_checked: i32,
    pub sample_changed: i32,
}

/// Performance metrics for operations
#[derive(Debug, serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMetrics {
    pub operation_count: i64,
    pub total_duration_ms: i64,
    pub slow_operations: Vec<SlowOperation>,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SlowOperation {
    pub name: String,
    pub duration_ms: i64,
    pub timestamp: i64,
}

/// Get cache status for a workspace root
pub fn check_cache_status(db_path: &Path, root_path: &str) -> Result<CacheStatus, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Get file count
    let file_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
            params![root_path, db::child_prefix(root_path)],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Get last scan session
    let last_scan: Option<(i64, String)> = conn
        .query_row(
            "SELECT finished_at, status FROM scan_sessions 
             WHERE root_path = ?1 AND status = 'success'
             ORDER BY finished_at DESC LIMIT 1",
            params![root_path],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (last_scan_time, _) = last_scan.unzip();

    // Check if cache is potentially stale by sampling files
    let (sample_checked, sample_changed) = if file_count > 0 {
        check_sample_for_changes(&conn, root_path, 50)?
    } else {
        (0, 0)
    };

    let is_stale = sample_changed > 0;
    let stale_reason = if is_stale {
        Some(format!("{} of {} sampled files changed since last scan", sample_changed, sample_checked))
    } else {
        None
    };

    // Cache is fresh if we have data, it's not stale, and scan completed recently (within 24 hours)
    let is_fresh = file_count > 0 
        && !is_stale 
        && last_scan_time.map(|t| {
            let age_hours = (chrono::Utc::now().timestamp() - t) / 3600;
            age_hours < 24
        }).unwrap_or(false);

    Ok(CacheStatus {
        root_path: root_path.to_string(),
        file_count,
        last_scan_time,
        is_fresh,
        is_stale,
        stale_reason,
        sample_checked,
        sample_changed,
    })
}

/// Sample files to check for changes
fn check_sample_for_changes(
    conn: &Connection,
    root_path: &str,
    sample_size: i64,
) -> Result<(i32, i32), String> {
    let prefix = db::child_prefix(root_path);
    
    // Get a sample of files with their stored metadata
    let mut stmt = conn
        .prepare(
            r#"
            SELECT path, modified_at, size_bytes 
            FROM files 
            WHERE (path = ?1 OR path LIKE ?2 ESCAPE '\') AND is_dir = 0
            ORDER BY RANDOM()
            LIMIT ?3
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![root_path, prefix, sample_size], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut checked = 0;
    let mut changed = 0;

    for row in rows {
        let (path, stored_mtime, stored_size) = row.map_err(|e| e.to_string())?;
        checked += 1;

        // Check if file has changed
        if let Ok(metadata) = std::fs::metadata(&path) {
            let current_mtime = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            let current_size = metadata.len() as i64;

            if current_mtime != stored_mtime || current_size != stored_size {
                changed += 1;
            }
        } else {
            // File no longer exists or can't be accessed
            changed += 1;
        }
    }

    Ok((checked, changed))
}

/// Get the last successful scan session for a root path
pub fn get_last_scan_session(db_path: &Path, root_path: &str) -> Result<Option<(i64, i64, i64)>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    conn.query_row(
        "SELECT id, finished_at, scanned_count FROM scan_sessions 
         WHERE root_path = ?1 AND status = 'success'
         ORDER BY finished_at DESC LIMIT 1",
        params![root_path],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Get total file count for a root path
pub fn get_file_count(db_path: &Path, root_path: &str) -> Result<i64, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    conn.query_row(
        "SELECT COUNT(*) FROM files WHERE path = ?1 OR path LIKE ?2 ESCAPE '\\'",
        params![root_path, db::child_prefix(root_path)],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Performance metrics storage (in-memory for session)
use std::sync::Mutex;
use once_cell::sync::Lazy;

static METRICS: Lazy<Mutex<PerformanceMetrics>> = 
    Lazy::new(|| Mutex::new(PerformanceMetrics::default()));

/// Record an operation timing
pub fn record_operation(name: &str, duration_ms: i64) {
    if let Ok(mut metrics) = METRICS.lock() {
        metrics.operation_count += 1;
        metrics.total_duration_ms += duration_ms;
        
        // Track slow operations (>100ms)
        if duration_ms > 100 {
            metrics.slow_operations.push(SlowOperation {
                name: name.to_string(),
                duration_ms,
                timestamp: chrono::Utc::now().timestamp(),
            });
            
            // Keep only last 50 slow operations
            if metrics.slow_operations.len() > 50 {
                metrics.slow_operations.remove(0);
            }
        }
    }
}

/// Get current performance metrics
pub fn get_performance_metrics() -> PerformanceMetrics {
    METRICS
        .lock()
        .map(|m| m.clone())
        .unwrap_or_default()
}

/// Reset performance metrics
pub fn reset_performance_metrics() {
    if let Ok(mut metrics) = METRICS.lock() {
        *metrics = PerformanceMetrics::default();
    }
}

/// Get operation statistics
pub fn get_operation_stats() -> HashMap<String, (i64, i64, i64)> {
    // Returns: operation_name -> (count, total_ms, avg_ms)
    let mut stats: HashMap<String, (i64, i64, i64)> = HashMap::new();
    
    if let Ok(metrics) = METRICS.lock() {
        for op in &metrics.slow_operations {
            let entry = stats.entry(op.name.clone()).or_insert((0, 0, 0));
            entry.0 += 1;
            entry.1 += op.duration_ms;
        }
        
        // Calculate averages
        for (_, (count, total, avg)) in stats.iter_mut() {
            if *count > 0 {
                *avg = *total / *count;
            }
        }
    }
    
    stats
}
