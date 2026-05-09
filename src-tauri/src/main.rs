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
        "graph load: root={}, scope={:?}, mode={:?}, expanded={:?}",
        request.root_path, request.scope_path, request.mode,
        request.expanded_folders.as_ref().map(|v| v.len())
    ));
    let start = std::time::Instant::now();
    let result = graph::load_graph(
        &state.db_path,
        &request.root_path,
        request.scope_path.as_deref(),
        request.mode.as_deref().unwrap_or("workspace"),
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

/// Open a file in the user's preferred terminal + editor combo.
///
/// Resolution order (no hardcoded tools):
///   1. Explicit template passed in (e.g. "kitty -e nvim {file}")
///   2. $ORBIT_TERMINAL_EDITOR (Orbit-specific override)
///   3. $TERMINAL env var + $VISUAL/$EDITOR (POSIX defaults)
///   4. `xdg-terminal-exec` (modern XDG, respects user's default terminal)
///   5. $VISUAL / $EDITOR alone (works for GUI editors like `code -w`)
///
/// If none resolve, returns an error explaining how to set $EDITOR.
#[tauri::command]
fn open_in_terminal_editor(path: String, editor_command: Option<String>) -> Result<(), String> {
    use std::process::Command;

    fn on_path(name: &str) -> bool {
        std::env::var_os("PATH")
            .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join(name).is_file()))
            .unwrap_or(false)
    }

    // Quote the path safely for inclusion into a shell-style template.
    let quoted = format!("'{}'", path.replace('\'', r"'\''"));

    // 1. Explicit template wins.
    let template = editor_command
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("ORBIT_TERMINAL_EDITOR").ok().filter(|s| !s.trim().is_empty()));

    let template = match template {
        Some(t) => Some(t),
        None => {
            // 2. $TERMINAL + $VISUAL/$EDITOR. Most Linux distros set neither
            //    out of the box, but ricer / dotfile setups almost always do.
            let terminal = std::env::var("TERMINAL").ok().filter(|s| !s.trim().is_empty());
            let editor = std::env::var("VISUAL")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .or_else(|| std::env::var("EDITOR").ok().filter(|s| !s.trim().is_empty()));
            match (terminal, editor) {
                (Some(t), Some(e)) => Some(format!("{t} -e {e} {{file}}")),
                (Some(t), None) => Some(format!("{t} -e {{file}}")),
                (None, _) => None,
            }
        }
    };

    if let Some(template) = template {
        let cmdline = template.replace("{file}", &quoted);
        let parts: Vec<&str> = cmdline.split_whitespace().collect();
        if parts.is_empty() {
            return Err("editor_command resolved to empty string".into());
        }
        return Command::new(parts[0])
            .args(&parts[1..])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("spawn `{}`: {e}", parts[0]));
    }

    // 3. xdg-terminal-exec respects the user's default terminal via XDG.
    if on_path("xdg-terminal-exec") {
        let editor = std::env::var("VISUAL")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| std::env::var("EDITOR").ok().filter(|s| !s.trim().is_empty()));
        if let Some(ed) = editor {
            return Command::new("xdg-terminal-exec")
                .arg(ed)
                .arg(&path)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("spawn xdg-terminal-exec: {e}"));
        }
    }

    // 4. Last resort: bare $VISUAL/$EDITOR (works for GUI editors).
    if let Some(editor) = std::env::var("VISUAL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("EDITOR").ok().filter(|s| !s.trim().is_empty()))
    {
        let parts: Vec<&str> = editor.split_whitespace().collect();
        if !parts.is_empty() {
            return Command::new(parts[0])
                .args(&parts[1..])
                .arg(&path)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("spawn `{}`: {e}", parts[0]));
        }
    }

    Err("No editor configured. Set $VISUAL or $EDITOR (e.g. `export VISUAL=nvim`) and optionally $TERMINAL (e.g. `export TERMINAL=kitty`).".into())
}

// File operations -----------------------------------------------------------

fn validate_filename(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("name must not be empty".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("name must not contain path separators".into());
    }
    if name == "." || name == ".." {
        return Err("invalid name".into());
    }
    Ok(())
}

#[tauri::command]
fn create_file(parent_dir: String, name: String) -> Result<String, String> {
    validate_filename(&name)?;
    let parent = std::path::Path::new(&parent_dir);
    if !parent.is_dir() {
        return Err(format!("not a directory: {parent_dir}"));
    }
    let target = parent.join(&name);
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    std::fs::File::create(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn create_folder(parent_dir: String, name: String) -> Result<String, String> {
    validate_filename(&name)?;
    let parent = std::path::Path::new(&parent_dir);
    if !parent.is_dir() {
        return Err(format!("not a directory: {parent_dir}"));
    }
    let target = parent.join(&name);
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    std::fs::create_dir(&target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn rename(path: String, new_name: String) -> Result<String, String> {
    validate_filename(&new_name)?;
    let src = std::path::Path::new(&path);
    if !src.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    let parent = src
        .parent()
        .ok_or_else(|| format!("cannot rename root: {path}"))?;
    let target = parent.join(&new_name);
    if target.exists() {
        return Err(format!("target already exists: {}", target.display()));
    }
    std::fs::rename(src, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
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

#[cfg(test)]
mod file_operation_tests {
    use super::*;

    #[test]
    fn create_file_creates_file_in_existing_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let created = create_file(
            dir.path().to_string_lossy().to_string(),
            "note.md".to_string(),
        )
        .expect("create file");

        let path = std::path::Path::new(&created);
        assert!(path.is_file());
        assert_eq!(path.parent(), Some(dir.path()));
    }

    #[test]
    fn create_folder_creates_child_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let created = create_folder(
            dir.path().to_string_lossy().to_string(),
            "assets".to_string(),
        )
        .expect("create folder");

        let path = std::path::Path::new(&created);
        assert!(path.is_dir());
        assert_eq!(path.parent(), Some(dir.path()));
    }

    #[test]
    fn rename_moves_file_within_same_parent() {
        let dir = tempfile::tempdir().expect("tempdir");
        let original = dir.path().join("draft.txt");
        std::fs::write(&original, "orbit").expect("seed file");

        let renamed = rename(
            original.to_string_lossy().to_string(),
            "final.txt".to_string(),
        )
        .expect("rename");

        assert!(!original.exists());
        assert_eq!(std::fs::read_to_string(&renamed).expect("renamed content"), "orbit");
        assert_eq!(std::path::Path::new(&renamed).parent(), Some(dir.path()));
    }

    #[test]
    fn file_operations_reject_path_separator_names() {
        let dir = tempfile::tempdir().expect("tempdir");
        let err = create_file(
            dir.path().to_string_lossy().to_string(),
            "nested/file.txt".to_string(),
        )
        .expect_err("separator rejected");

        assert!(err.contains("path separators"));
    }

    #[test]
    fn open_in_terminal_editor_accepts_explicit_command_template() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("open-me.txt");
        std::fs::write(&file, "orbit").expect("seed file");

        open_in_terminal_editor(
            file.to_string_lossy().to_string(),
            Some("true {file}".to_string()),
        )
        .expect("spawn no-op editor command");
    }
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
fn save_user_icon_theme(id: String, toml_content: String) -> Result<(), String> {
    icon_theme::save_user_theme(&id, &toml_content)
}

#[tauri::command]
fn delete_user_icon_theme(id: String) -> Result<(), String> {
    icon_theme::delete_user_theme(&id)
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
            save_user_icon_theme,
            delete_user_icon_theme,
            open_in_terminal_editor,
            create_file,
            create_folder,
            rename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
