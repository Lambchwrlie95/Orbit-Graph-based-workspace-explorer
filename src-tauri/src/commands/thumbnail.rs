use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;
use crate::thumbnail_generator::{ThumbnailGenerator, get_supported_sizes};

#[derive(Debug, Serialize, Deserialize)]
pub struct ThumbnailInfo {
    pub file_id: i64,
    pub size: u32,
    pub path: String,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnsureThumbnailRequest {
    pub file_id: i64,
    pub file_path: String,
    pub file_modified_at: i64,
    pub size: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThumbnailResponse {
    pub path: Option<String>,
    pub status: String, // "ready", "generating", "error"
    pub error: Option<String>,
}

#[tauri::command]
pub fn ensure_thumbnail(
    request: EnsureThumbnailRequest,
    generator: State<'_, ThumbnailGenerator>,
    state: State<'_, AppState>,
) -> Result<ThumbnailResponse, String> {
    match generator.ensure_thumbnail(
        &state.db_path,
        request.file_id,
        &request.file_path,
        request.file_modified_at,
        request.size,
    ) {
        Ok(Some(path)) => Ok(ThumbnailResponse {
            path: Some(path.to_string_lossy().to_string()),
            status: "ready".to_string(),
            error: None,
        }),
        Ok(None) => Ok(ThumbnailResponse {
            path: None,
            status: "generating".to_string(),
            error: None,
        }),
        Err(e) => Ok(ThumbnailResponse {
            path: None,
            status: "error".to_string(),
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub fn get_thumbnail_info(
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ThumbnailInfo>, String> {
    let thumbs = crate::db::get_thumbnails_for_file(&state.db_path, file_id)?;
    
    Ok(thumbs.into_iter().map(|t| ThumbnailInfo {
        file_id: t.file_id,
        size: t.size as u32,
        path: t.path,
        width: t.width.unwrap_or(0),
        height: t.height.unwrap_or(0),
    }).collect())
}

#[tauri::command]
pub fn delete_thumbnails(
    file_id: i64,
    generator: State<'_, ThumbnailGenerator>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    generator.delete_thumbnails_for_file(&state.db_path, file_id)
}

#[tauri::command]
pub fn get_supported_thumbnail_sizes() -> Vec<u32> {
    get_supported_sizes()
}

#[tauri::command]
pub fn get_thumbnail_base_path(generator: State<'_, ThumbnailGenerator>) -> Result<String, String> {
    Ok(generator.get_base_path().to_string_lossy().to_string())
}
