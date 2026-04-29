use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;

mod db;
mod graph;
mod logger;
mod models;
mod preview;
mod scanner;

use models::{FileRecord, GraphPayload, GraphRequest, PreviewPayload, ScanProgress};

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
    Ok(progress)
}

#[tauri::command]
fn list_children(
    parent_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    db::children(&state.db_path, &parent_path, 1_000)
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
        "graph load: root={}, scope={:?}, mode={:?}, limit={:?}",
        request.root_path, request.scope_path, request.mode, request.limit
    ));
    graph::load_graph(
        &state.db_path,
        &request.root_path,
        request.scope_path.as_deref(),
        request.mode.as_deref().unwrap_or("workspace"),
        request.limit,
    )
}

#[tauri::command]
fn get_preview(path: String) -> Result<PreviewPayload, String> {
    preview::build_preview(&path)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_log_path() -> Option<String> {
    logger::log_path().map(|path| path.to_string_lossy().to_string())
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

    tauri::Builder::default()
        .manage(AppState {
            db_path,
            db_write_lock: Arc::new(Mutex::new(())),
        })
        .invoke_handler(tauri::generate_handler![
            choose_folder,
            default_root_path,
            scan_workspace,
            list_children,
            search_files,
            get_file,
            load_graph,
            get_preview,
            open_path,
            get_log_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
