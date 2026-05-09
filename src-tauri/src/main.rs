use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;

mod code_analyzer;
mod color_extractor;
mod commands;
mod db;
mod git_status;
mod graph;
mod icon_theme;
mod image_analyzer;
mod image_hash;
mod logger;
mod markdown_analyzer;
mod models;
mod performance;
mod preview;
mod scanner;

// Keep backward compatibility with existing thumbnail_generator at root
mod thumbnail_generator;

use models::{FileRecord, GraphPayload, GraphRequest, PreviewPayload, ScanProgress};
use performance::{CacheStatus, PerformanceMetrics};
use thumbnail_generator::ThumbnailGenerator;

const DB_FILE: &str = "orbit.db";
const MAX_SCAN_ENTRIES: usize = 120_000;

struct AppState {
    db_path: PathBuf,
    db_write_lock: Arc<Mutex<()>>,
}

#[tauri::command]
fn choose_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn default_root_path() -> Result<String, String> {
    std::env::current_dir()
        .map_err(|e| e.to_string())
        .and_then(|path| path.canonicalize().map_err(|e| e.to_string()))
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
async fn scan_workspace(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<ScanProgress, String> {
    let started = Instant::now();
    let root = Path::new(&root_path)
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    logger::log_event(format!("scan started: {root}"));

    let rows = scanner::scan_root(Path::new(&root), MAX_SCAN_ENTRIES)?;
    logger::log_event(format!("scan collected {} entries for {root}", rows.len()));

    let (inserted_or_updated, skipped_unchanged) = {
        let _guard = state.db_write_lock.lock().map_err(|e| e.to_string())?;
        db::clear_code_analysis_for_root(&state.db_path, &root)?;
        db::index_rows(&state.db_path, &root, &rows)?
    };

    let progress = ScanProgress {
        root_path: root.clone(),
        scanned: rows.len(),
        inserted_or_updated,
        skipped_unchanged,
        duration_ms: started.elapsed().as_millis(),
        log_path: logger::log_path().map(|path| path.to_string_lossy().to_string()),
    };
    logger::log_event(format!(
        "scan complete: scanned={}, changed={}, skipped={}, root={}, duration={}ms",
        progress.scanned,
        progress.inserted_or_updated,
        progress.skipped_unchanged,
        root,
        progress.duration_ms
    ));
    
    // Record performance metric
    performance::record_operation("scan_workspace", progress.duration_ms as i64);
    
    Ok(progress)
}

#[tauri::command]
fn list_children(
    parent_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    let start = std::time::Instant::now();
    let result = db::children(&state.db_path, &parent_path, 1_000);
    performance::record_operation("list_children", start.elapsed().as_millis() as i64);
    result
}

#[tauri::command]
fn list_children_paginated(
    parent_path: String,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    db::children_paginated(&state.db_path, &parent_path, offset, limit)
}

#[tauri::command]
fn get_children_count(
    parent_path: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    db::get_children_count(&state.db_path, &parent_path)
}

#[tauri::command]
fn search_files(
    root_path: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    db::search_files(&state.db_path, &root_path, &query, 200)
}

#[tauri::command]
fn get_file(path: String, state: State<'_, AppState>) -> Result<Option<FileRecord>, String> {
    db::get_file(&state.db_path, &path)
}

#[tauri::command]
fn load_graph(request: GraphRequest, state: State<'_, AppState>) -> Result<GraphPayload, String> {
    logger::log_event(format!(
        "graph load: root={}, scope={:?}, mode={:?}, limit={:?}, expanded={:?}",
        request.root_path, request.scope_path, request.mode, request.limit, 
        request.expanded_folders.as_ref().map(|v| v.len())
    ));
    let start = std::time::Instant::now();
    let result = graph::load_graph(
        &state.db_path,
        &request.root_path,
        request.scope_path.as_deref(),
        request.mode.as_deref().unwrap_or("workspace"),
        request.limit,
        request.expanded_folders.as_deref(),
    );
    performance::record_operation("load_graph", start.elapsed().as_millis() as i64);
    result
}

#[tauri::command]
fn get_preview(path: String) -> Result<PreviewPayload, String> {
    preview::build_preview(&path)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    // On Linux a bare `open::that` defers to `xdg-open`, which uses
    // `~/.config/mimeapps.list` to pick the application for each MIME type.
    // If that mapping is wrong the file lands in the user's web browser. We
    // can't rewrite that file from here, but we at least prefer `xdg-open`
    // explicitly and surface a useful error on failure so the user knows to
    // run `xdg-mime default <app>.desktop <mime>` if the wrong app launches.
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        if let Ok(status) = Command::new("xdg-open").arg(&path).status() {
            if status.success() {
                return Ok(());
            }
        }
    }
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_log_path() -> Option<String> {
    logger::log_path().map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn check_cache_status(root_path: String, state: State<'_, AppState>) -> Result<CacheStatus, String> {
    let start = std::time::Instant::now();
    let result = performance::check_cache_status(&state.db_path, &root_path);
    performance::record_operation("check_cache_status", start.elapsed().as_millis() as i64);
    result
}

#[tauri::command]
fn get_performance_metrics() -> PerformanceMetrics {
    performance::get_performance_metrics()
}

#[tauri::command]
fn list_icon_themes() -> Result<Vec<icon_theme::IconThemeMeta>, String> {
    icon_theme::cmd_list_themes()
}

#[tauri::command]
fn get_active_icon_theme() -> Result<icon_theme::ThemePayload, String> {
    icon_theme::cmd_get_active_theme()
}

#[tauri::command]
fn set_active_icon_theme(id: String) -> Result<(), String> {
    icon_theme::cmd_set_active_theme(id)
}

#[tauri::command]
fn open_icon_themes_dir() -> Result<String, String> {
    let dir = icon_theme::themes_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.to_string_lossy().to_string();
    let _ = open::that(&path);
    Ok(path)
}

#[tauri::command]
fn reset_performance_metrics() {
    performance::reset_performance_metrics();
}

fn app_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|dir| dir.join("orbit"))
        .ok_or_else(|| "Could not resolve local data directory".to_string())
}

fn main() {
    let app_dir = app_data_dir().expect("app data directory");
    std::fs::create_dir_all(&app_dir).expect("app data directory exists");
    let db_path = app_dir.join(DB_FILE);
    db::init_database(&db_path).expect("database initialized");
    logger::log_event(format!("orbit started: db={}", db_path.to_string_lossy()));

    // Initialize thumbnail generator
    let thumbnail_generator = ThumbnailGenerator::new(&app_dir);

    tauri::Builder::default()
        .manage(AppState {
            db_path,
            db_write_lock: Arc::new(Mutex::new(())),
        })
        .manage(thumbnail_generator)
        .invoke_handler(tauri::generate_handler![
            choose_folder,
            default_root_path,
            scan_workspace,
            list_children,
            list_children_paginated,
            get_children_count,
            search_files,
            get_file,
            load_graph,
            get_preview,
            open_path,
            get_log_path,
            check_cache_status,
            get_performance_metrics,
            performance::get_operation_stats,
            reset_performance_metrics,
            commands::file::read_file_for_edit,
            commands::file::save_file,
            commands::analysis::analyze_code_file,
            commands::analysis::analyze_markdown_file,
            commands::analysis::batch_analyze_code_files,
            commands::analysis::batch_analyze_markdown_files,
            commands::analysis::list_analyzable_files,
            commands::analysis::get_file_git_status,
            commands::analysis::get_files_git_status,
            commands::analysis::get_related_files,
            commands::analysis::is_analyzable_code_file,
            commands::analysis::is_analyzable_markdown_file,
            commands::analysis::get_supported_code_extensions,
            commands::analysis::find_git_repo_root,
            commands::analysis::is_in_git_repo,
            commands::image_analysis::analyze_image_file,
            commands::image_analysis::extract_colors,
            commands::image_analysis::compute_image_phash,
            commands::image_analysis::find_similar_images,
            commands::image_analysis::compute_workspace_phashes,
            commands::thumbnail::ensure_thumbnail,
            commands::thumbnail::get_thumbnail_info,
            commands::thumbnail::delete_thumbnails,
            commands::thumbnail::get_supported_thumbnail_sizes,
            commands::thumbnail::get_thumbnail_base_path,
            list_icon_themes,
            get_active_icon_theme,
            set_active_icon_theme,
            open_icon_themes_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
