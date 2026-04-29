use tauri::State;
use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::AppState;
use crate::image_analyzer::{analyze_image, ImageAnalysis};
use crate::color_extractor::{extract_dominant_colors, Color};

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
