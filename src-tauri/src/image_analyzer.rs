use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAnalysis {
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
    pub aspect_ratio: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Gif,
    Webp,
    Bmp,
    Svg,
    Other(String),
}

impl From<&str> for ImageFormat {
    fn from(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "jpg" | "jpeg" => ImageFormat::Jpeg,
            "png" => ImageFormat::Png,
            "gif" => ImageFormat::Gif,
            "webp" => ImageFormat::Webp,
            "bmp" => ImageFormat::Bmp,
            "svg" => ImageFormat::Svg,
            other => ImageFormat::Other(other.to_string()),
        }
    }
}

pub fn analyze_image(path: &Path) -> Result<ImageAnalysis, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // For SVG, we need special handling
    if ext.eq_ignore_ascii_case("svg") {
        // Try to extract viewBox or width/height attributes
        // For now, return placeholder dimensions
        return Ok(ImageAnalysis {
            width: 512,
            height: 512,
            format: ImageFormat::Svg,
            aspect_ratio: 1.0,
        });
    }

    let img = image::open(path).map_err(|e| e.to_string())?;
    let (width, height) = (img.width(), img.height());

    Ok(ImageAnalysis {
        width,
        height,
        format: ImageFormat::from(ext),
        aspect_ratio: width as f32 / height as f32,
    })
}
