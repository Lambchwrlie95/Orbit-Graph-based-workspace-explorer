use crate::code_analyzer::{analyze_file, CodeAnalysis, Export, Import, ImportType, is_code_file};
use crate::git_status::{find_repo_root, get_diff_stats, get_file_status, FileGitStatus};
use crate::markdown_analyzer::{
    analyze as analyze_markdown, is_markdown_file, resolve_link_target, MarkdownAnalysis,
};
use crate::AppState;
use std::path::Path;
use tauri::State;

/// Resolve a local import path relative to the source file's directory.
/// Returns an absolute path without extension (e.g. `/home/user/src/utils`).
fn resolve_local_import(source_file: &str, import_path: &str) -> String {
    let source_dir = Path::new(source_file)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("");
    let mut parts: Vec<&str> = source_dir
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    for part in import_path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    format!("/{}", parts.join("/"))
}

/// Analyze a code file and return imports and exports
#[tauri::command]
pub async fn analyze_code_file(path: String, state: State<'_, AppState>) -> Result<Option<CodeAnalysis>, String> {
    let file_path = Path::new(&path);
    
    // Check if it's a code file first
    if !is_code_file(file_path) {
        return Ok(None);
    }

    let indexed_file = crate::db::get_file(&state.db_path, &path)?;
    if let Some(file) = &indexed_file {
        if let Some((imports_json, exports_json)) = crate::db::get_code_analysis(&state.db_path, file.id)? {
            if let (Ok(imports), Ok(exports)) = (
                serde_json::from_str::<Vec<Import>>(&imports_json),
                serde_json::from_str::<Vec<Export>>(&exports_json),
            ) {
                return Ok(Some(CodeAnalysis { imports, exports }));
            }
        }
    }
    
    // Read file content
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Analyze the file
    let analysis = analyze_file(file_path, &content);

    if let (Some(file), Some(analysis)) = (&indexed_file, &analysis) {
        let imports_val = serde_json::to_value(&analysis.imports).map_err(|e| e.to_string())?;
        let exports_val = serde_json::to_value(&analysis.exports).map_err(|e| e.to_string())?;
        crate::db::store_code_analysis(&state.db_path, file.id, &imports_val, &exports_val)?;

        // Resolve local imports to absolute paths and store relationships
        let resolved: Vec<String> = analysis
            .imports
            .iter()
            .filter(|i| matches!(i.import_type, ImportType::Local))
            .map(|i| resolve_local_import(&path, &i.path))
            .collect();
        crate::db::store_import_relationships(&state.db_path, file.id, &resolved)?;
    }

    Ok(analysis)
}

/// Analyze a markdown file: extract headings, links, and persist link relationships
/// so backlinks and graph edges can be computed cheaply.
#[tauri::command]
pub async fn analyze_markdown_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<Option<MarkdownAnalysis>, String> {
    let file_path = Path::new(&path);
    if !is_markdown_file(file_path) {
        return Ok(None);
    }

    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let analysis = analyze_markdown(&content);

    if let Some(file) = crate::db::get_file(&state.db_path, &path)? {
        let resolved: Vec<String> = analysis
            .links
            .iter()
            .filter_map(|link| resolve_link_target(&path, &link.target, &link.kind))
            .collect();
        crate::db::store_markdown_links(&state.db_path, file.id, &resolved)?;
    }

    Ok(Some(analysis))
}

/// Check if a file is a markdown file that can be analyzed.
#[tauri::command]
pub async fn is_analyzable_markdown_file(path: String) -> Result<bool, String> {
    Ok(is_markdown_file(Path::new(&path)))
}

/// Get git status for a file
#[tauri::command]
pub async fn get_file_git_status(path: String) -> Result<FileGitStatus, String> {
    let file_path = Path::new(&path);
    
    // Try to find repo root and get status
    match find_repo_root(file_path).and_then(|repo_root| {
        let mut status = get_file_status(&repo_root, file_path)?;
        if let Some((additions, deletions)) = get_diff_stats(&repo_root, file_path) {
            status.additions = Some(additions);
            status.deletions = Some(deletions);
        }
        Some(status)
    }) {
        Some(status) => Ok(status),
        None => {
            // File might not be in a git repo - return unknown status
            Ok(FileGitStatus {
                status: crate::git_status::GitStatus::Unknown,
                additions: None,
                deletions: None,
            })
        }
    }
}

/// Get files related to the current file: files it imports (forward) and files that import it (reverse).
#[tauri::command]
pub async fn get_related_files(path: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let mut related = std::collections::HashSet::new();

    // Reverse deps: files that import this file
    let importers = crate::db::get_files_importing(&state.db_path, &path)?;
    related.extend(importers);

    // Forward deps: files this file imports (resolved via DB)
    if let Some(file) = crate::db::get_file(&state.db_path, &path)? {
        let targets = crate::db::get_import_targets(&state.db_path, file.id)?;
        related.extend(targets);
    }

    related.remove(&path);
    let mut result: Vec<String> = related.into_iter().collect();
    result.sort();
    Ok(result)
}

/// Batch analyze multiple code files
/// Used during workspace scanning
#[tauri::command]
pub async fn batch_analyze_code_files(paths: Vec<String>, state: State<'_, AppState>) -> Result<Vec<(String, Option<CodeAnalysis>)>, String> {
    let mut results = Vec::new();

    for path in paths {
        let result = analyze_code_file(path.clone(), state.clone()).await?;
        results.push((path, result));
    }

    Ok(results)
}

/// Batch analyze multiple markdown files
#[tauri::command]
pub async fn batch_analyze_markdown_files(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<(String, Option<MarkdownAnalysis>)>, String> {
    let mut results = Vec::new();
    for path in paths {
        let result = analyze_markdown_file(path.clone(), state.clone()).await?;
        results.push((path, result));
    }
    Ok(results)
}

/// Walk the indexed file table and return paths matching the supported analyzable extensions.
/// Used by the frontend to schedule background analysis after a workspace scan.
#[tauri::command]
pub async fn list_analyzable_files(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<AnalyzableFiles, String> {
    let conn = rusqlite::Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let prefix = format!("{}/%", root_path.trim_end_matches('/'));
    let mut stmt = conn
        .prepare(
            r#"
            SELECT path, extension
            FROM files
            WHERE is_dir = 0
              AND (path = ?1 OR path LIKE ?2 ESCAPE '\')
              AND extension IS NOT NULL
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![root_path, prefix], |row| {
            let path: String = row.get(0)?;
            let ext: String = row.get(1)?;
            Ok((path, ext))
        })
        .map_err(|e| e.to_string())?;

    let mut code = Vec::new();
    let mut markdown = Vec::new();
    for row in rows {
        let (path, ext) = row.map_err(|e| e.to_string())?;
        let ext_lower = ext.to_lowercase();
        if matches!(
            ext_lower.as_str(),
            "js" | "jsx" | "ts" | "tsx" | "mjs" | "py" | "pyi" | "rs" | "java" | "go"
        ) {
            code.push(path);
        } else if matches!(ext_lower.as_str(), "md" | "mdx" | "markdown") {
            markdown.push(path);
        }
    }
    Ok(AnalyzableFiles { code, markdown })
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzableFiles {
    pub code: Vec<String>,
    pub markdown: Vec<String>,
}

/// Check if a file is a code file that can be analyzed
#[tauri::command]
pub async fn is_analyzable_code_file(path: String) -> Result<bool, String> {
    let file_path = Path::new(&path);
    Ok(is_code_file(file_path))
}

/// Get supported code file extensions
#[tauri::command]
pub async fn get_supported_code_extensions() -> Result<Vec<String>, String> {
    Ok(vec![
        "js".to_string(),
        "jsx".to_string(),
        "ts".to_string(),
        "tsx".to_string(),
        "mjs".to_string(),
        "py".to_string(),
        "pyi".to_string(),
        "rs".to_string(),
        "java".to_string(),
        "go".to_string(),
        "rb".to_string(),
        "php".to_string(),
        "c".to_string(),
        "cpp".to_string(),
        "h".to_string(),
        "hpp".to_string(),
    ])
}

/// Get git status for multiple files at once
#[tauri::command]
pub async fn get_files_git_status(paths: Vec<String>) -> Result<Vec<(String, FileGitStatus)>, String> {
    let mut results = Vec::new();
    
    for path in paths {
        let status = get_file_git_status(path.clone()).await?;
        results.push((path, status));
    }
    
    Ok(results)
}

/// Find the git repository root for a path
#[tauri::command]
pub async fn find_git_repo_root(path: String) -> Result<Option<String>, String> {
    let file_path = Path::new(&path);
    
    Ok(find_repo_root(file_path).map(|p| p.to_string_lossy().to_string()))
}

/// Check if a path is inside a git repository
#[tauri::command]
pub async fn is_in_git_repo(path: String) -> Result<bool, String> {
    let file_path = Path::new(&path);
    Ok(find_repo_root(file_path).is_some())
}
