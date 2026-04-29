use crate::code_analyzer::{analyze_file, CodeAnalysis, is_code_file};
use crate::git_status::{get_file_status, find_repo_root, FileGitStatus, get_git_status_auto};
use std::path::Path;

/// Analyze a code file and return imports and exports
#[tauri::command]
pub async fn analyze_code_file(path: String) -> Result<Option<CodeAnalysis>, String> {
    let file_path = Path::new(&path);
    
    // Check if it's a code file first
    if !is_code_file(file_path) {
        return Ok(None);
    }
    
    // Read file content
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Analyze the file
    let analysis = analyze_file(file_path, &content);
    
    Ok(analysis)
}

/// Get git status for a file
#[tauri::command]
pub async fn get_file_git_status(path: String) -> Result<FileGitStatus, String> {
    let file_path = Path::new(&path);
    
    // Try to find repo root and get status
    match get_git_status_auto(file_path) {
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

/// Get files related to the current file (imports and importers)
#[tauri::command]
pub async fn get_related_files(path: String) -> Result<Vec<String>, String> {
    // This would query the database for files that import this file
    // and files this file imports. For now, return empty as the
    // database schema is in place but full implementation would
    // require the import_relationships table to be populated
    
    // TODO: Implement after code analysis is integrated into scan pipeline
    Ok(vec![])
}

/// Batch analyze multiple code files
/// Used during workspace scanning
#[tauri::command]
pub async fn batch_analyze_code_files(paths: Vec<String>) -> Result<Vec<(String, Option<CodeAnalysis>)>, String> {
    let mut results = Vec::new();
    
    for path in paths {
        let result = analyze_code_file(path.clone()).await?;
        results.push((path, result));
    }
    
    Ok(results)
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
