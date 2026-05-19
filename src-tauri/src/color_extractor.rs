use image::{GenericImageView, Rgba};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub percentage: f32,
}

// Simple k-means implementation for color extraction
pub fn extract_dominant_colors(path: &Path, color_count: u8) -> Result<Vec<Color>, String> {
    let img = image::open(path).map_err(|e| e.to_string())?;

    // Resize for faster processing
    let thumb = img.thumbnail(100, 100);

    // Sample pixels and quantize to reduce color space
    let mut color_counts: HashMap<(u8, u8, u8), usize> = HashMap::new();

    for (_, _, pixel) in thumb.pixels() {
        let Rgba([r, g, b, a]) = pixel;
        // Skip transparent pixels
        if a > 128 {
            // Quantize to 32 levels (reduce color space)
            let qr = (r / 32) * 32;
            let qg = (g / 32) * 32;
            let qb = (b / 32) * 32;
            *color_counts.entry((qr, qg, qb)).or_insert(0) += 1;
        }
    }

    if color_counts.is_empty() {
        return Ok(vec![]);
    }

    // Convert to colors and sort by frequency
    let total_pixels: usize = color_counts.values().sum();
    let mut colors: Vec<Color> = color_counts
        .into_iter()
        .map(|((r, g, b), count)| Color {
            r,
            g,
            b,
            percentage: (count as f32 / total_pixels as f32) * 100.0,
        })
        .collect();

    // Sort by percentage descending
    colors.sort_by(|a, b| {
        b.percentage
            .partial_cmp(&a.percentage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Merge similar colors (simple clustering)
    let mut merged_colors: Vec<Color> = Vec::new();
    for color in colors {
        let mut merged = false;
        for existing in &mut merged_colors {
            if color_distance(&color, existing) < 30.0 {
                // Merge by averaging
                let total = existing.percentage + color.percentage;
                existing.r = ((existing.r as f32 * existing.percentage
                    + color.r as f32 * color.percentage)
                    / total) as u8;
                existing.g = ((existing.g as f32 * existing.percentage
                    + color.g as f32 * color.percentage)
                    / total) as u8;
                existing.b = ((existing.b as f32 * existing.percentage
                    + color.b as f32 * color.percentage)
                    / total) as u8;
                existing.percentage = total;
                merged = true;
                break;
            }
        }
        if !merged {
            merged_colors.push(color);
        }
        if merged_colors.len() >= color_count as usize {
            break;
        }
    }

    // Re-normalize percentages
    let total_pct: f32 = merged_colors.iter().map(|c| c.percentage).sum();
    for color in &mut merged_colors {
        color.percentage = (color.percentage / total_pct) * 100.0;
    }

    Ok(merged_colors)
}

fn color_distance(a: &Color, b: &Color) -> f32 {
    let dr = a.r as f32 - b.r as f32;
    let dg = a.g as f32 - b.g as f32;
    let db = a.b as f32 - b.b as f32;
    (dr * dr + dg * dg + db * db).sqrt()
}
