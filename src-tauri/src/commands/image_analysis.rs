use tauri::State;
use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::AppState;
use crate::image_analyzer::{analyze_image, ImageAnalysis};
use crate::color_extractor::{extract_dominant_colors, Color};
use crate::image_hash::{compute_dhash, hamming_distance};

#[derive(Debug, Serialize, Deserialize)]
pub struct ColorExtractionResult {
    pub file_id: i64,
    pub colors: Vec<Color>,
    pub cached: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageMetadataResult {
    pub file_id: i64,
    pub analysis: ImageAnalysis,
    pub cached: bool,
}

#[tauri::command]
pub fn analyze_image_file(
    file_id: i64,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<ImageMetadataResult, String> {
    // Check cache first - stored in file metadata JSON
    if let Ok(Some(file)) = crate::db::get_file(&state.db_path, &file_path) {
        if let Some(ref metadata_json) = file.metadata {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(metadata_json) {
                if let Some(analysis) = metadata.get("image_analysis") {
                    if let Ok(analysis) = serde_json::from_value::<ImageAnalysis>(analysis.clone()) {
                        return Ok(ImageMetadataResult {
                            file_id,
                            analysis,
                            cached: true,
                        });
                    }
                }
            }
        }
    }
    
    // Analyze image
    let path = Path::new(&file_path);
    let analysis = analyze_image(path)?;
    
    // Cache result
    let analysis_json = serde_json::to_string(&analysis).unwrap_or_default();
    let _ = crate::db::update_file_metadata(&state.db_path, file_id, "image_analysis", &analysis_json);
    
    Ok(ImageMetadataResult {
        file_id,
        analysis,
        cached: false,
    })
}

#[tauri::command]
pub fn extract_colors(
    file_id: i64,
    file_path: String,
    color_count: u8,
    state: State<'_, AppState>,
) -> Result<ColorExtractionResult, String> {
    let color_count = color_count.clamp(1, 10);
    
    // Check cache first
    if let Ok(Some(file)) = crate::db::get_file(&state.db_path, &file_path) {
        if let Some(ref metadata_json) = file.metadata {
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(metadata_json) {
                if let Some(colors) = metadata.get("extracted_colors") {
                    if let Ok(colors) = serde_json::from_value::<Vec<Color>>(colors.clone()) {
                        return Ok(ColorExtractionResult {
                            file_id,
                            colors,
                            cached: true,
                        });
                    }
                }
            }
        }
    }
    
    // Extract colors
    let path = Path::new(&file_path);
    let colors = extract_dominant_colors(path, color_count)?;
    
    // Cache result
    let colors_json = serde_json::to_string(&colors).unwrap_or_default();
    let _ = crate::db::update_file_metadata(&state.db_path, file_id, "extracted_colors", &colors_json);
    
    Ok(ColorExtractionResult {
        file_id,
        colors,
        cached: false,
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarImage {
    pub file_id: i64,
    pub path: String,
    pub distance: u32,
}

/// Compute a perceptual hash for a single image, caching the result.
#[tauri::command]
pub async fn compute_image_phash(
    file_id: i64,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    if let Some(existing) = crate::db::get_phash(&state.db_path, file_id)? {
        return Ok(existing);
    }
    let hash = compute_dhash(Path::new(&file_path))?;
    crate::db::store_phash(&state.db_path, file_id, &hash)?;
    Ok(hash.to_vec())
}

/// Find images visually similar to the given image within `root_path`.
/// Distance is Hamming distance over 64 bits; returns matches with distance ≤ `max_distance`.
#[tauri::command]
pub async fn find_similar_images(
    file_id: i64,
    file_path: String,
    root_path: String,
    max_distance: u32,
    state: State<'_, AppState>,
) -> Result<Vec<SimilarImage>, String> {
    let max = max_distance.min(20);
    let target_hash = match crate::db::get_phash(&state.db_path, file_id)? {
        Some(h) => h,
        None => {
            let computed = compute_dhash(Path::new(&file_path))?;
            crate::db::store_phash(&state.db_path, file_id, &computed)?;
            computed.to_vec()
        }
    };

    let candidates = crate::db::list_phashes_for_root(&state.db_path, &root_path)?;
    let mut matches: Vec<SimilarImage> = candidates
        .into_iter()
        .filter(|(id, _, _)| *id != file_id)
        .filter_map(|(id, path, hash)| {
            let distance = hamming_distance(&target_hash, &hash);
            if distance <= max {
                Some(SimilarImage { file_id: id, path, distance })
            } else {
                None
            }
        })
        .collect();
    matches.sort_by_key(|m| m.distance);
    matches.truncate(40);
    Ok(matches)
}

/// Compute perceptual hashes for all images under `root_path` that don't already have one.
/// Returns the number of hashes computed.
#[tauri::command]
pub async fn compute_workspace_phashes(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pending = crate::db::file_ids_missing_phash(&state.db_path, &root_path)?;
    let mut computed = 0usize;
    for (file_id, path) in pending {
        match compute_dhash(Path::new(&path)) {
            Ok(hash) => {
                if crate::db::store_phash(&state.db_path, file_id, &hash).is_ok() {
                    computed += 1;
                }
            }
            Err(_) => {
                // Skip unreadable images silently — continue with the rest.
                continue;
            }
        }
    }
    Ok(computed)
}
