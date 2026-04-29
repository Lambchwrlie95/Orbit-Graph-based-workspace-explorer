//! Thumbnail Generation Service
//! 
//! This service provides background thumbnail generation for image files.
//! It supports multiple sizes (128px, 256px, 512px) and caches thumbnails
//! in the user's data directory with database-backed metadata.

use image::{imageops::FilterType, DynamicImage, ImageFormat};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::collections::HashSet;
use sha2::{Sha256, Digest};

pub const THUMBNAIL_SIZES: [u32; 3] = [128, 256, 512];
const THUMBNAIL_DIR: &str = "thumbnails";
const MAX_CONCURRENT_PROCESSING: usize = 4;

/// Thumbnail generator service
pub struct ThumbnailGenerator {
    base_path: PathBuf,
    processing: Arc<Mutex<HashSet<String>>>, // Track files currently being processed
}

impl ThumbnailGenerator {
    /// Create a new thumbnail generator
    pub fn new(app_data_dir: &Path) -> Self {
        let base_path = app_data_dir.join(THUMBNAIL_DIR);
        // Create directory if it doesn't exist
        let _ = std::fs::create_dir_all(&base_path);
        
        Self {
            base_path,
            processing: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Ensure a thumbnail exists for the given file
    /// 
    /// Returns the path to the thumbnail if it exists or was successfully generated,
    /// None if generation is in progress,
    /// or an error if generation failed.
    pub fn ensure_thumbnail(
        &self,
        db_path: &Path,
        file_id: i64,
        file_path: &str,
        file_modified_at: i64,
        size: u32,
    ) -> Result<Option<PathBuf>, String> {
        // Validate size
        if !THUMBNAIL_SIZES.contains(&size) {
            return Err(format!(
                "Invalid thumbnail size: {}. Valid sizes: {:?}",
                size, THUMBNAIL_SIZES
            ));
        }

        // Check if thumbnail already exists and is valid
        if let Ok(Some(thumb)) = crate::db::get_thumbnail(db_path, file_id, size as i32) {
            let thumb_path = self.base_path.join(&thumb.path);
            if thumb_path.exists() {
                // Check if source file has been modified
                if thumb.file_modified_at == Some(file_modified_at) {
                    return Ok(Some(thumb_path));
                }
            }
        }

        // Check if already being processed
        let key = format!("{}_{}", file_id, size);
        {
            let processing = self.processing.lock().map_err(|e| e.to_string())?;
            if processing.contains(&key) {
                return Ok(None); // Already processing
            }
        }

        // Generate new thumbnail
        self.generate_thumbnail(db_path, file_id, file_path, file_modified_at, size)
    }

    /// Generate a thumbnail for the given file
    fn generate_thumbnail(
        &self,
        db_path: &Path,
        file_id: i64,
        file_path: &str,
        file_modified_at: i64,
        size: u32,
    ) -> Result<Option<PathBuf>, String> {
        let key = format!("{}_{}", file_id, size);
        
        // Mark as processing
        {
            let mut processing = self.processing.lock().map_err(|e| e.to_string())?;
            processing.insert(key.clone());
        }

        let result = self.do_generate(db_path, file_id, file_path, file_modified_at, size);

        // Unmark as processing
        {
            let mut processing = self.processing.lock().map_err(|e| e.to_string())?;
            processing.remove(&key);
        }

        result
    }

    /// Internal generation logic
    fn do_generate(
        &self,
        db_path: &Path,
        file_id: i64,
        file_path: &str,
        file_modified_at: i64,
        size: u32,
    ) -> Result<Option<PathBuf>, String> {
        let source_path = Path::new(file_path);
        
        // Check if file exists
        if !source_path.exists() {
            return Ok(None);
        }

        // Create thumbnail subdirectory based on file hash
        let file_hash = format!("{:x}", Sha256::digest(file_path.as_bytes()));
        let subdir = &file_hash[..2];
        let thumb_dir = self.base_path.join(subdir);
        
        std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
        
        let thumb_filename = format!("{}_{}.jpg", &file_hash[..16], size);
        let thumb_path = thumb_dir.join(&thumb_filename);
        
        // Load and resize image
        let img = image::open(source_path).map_err(|e| e.to_string())?;
        let (orig_width, orig_height) = (img.width(), img.height());
        
        // Resize maintaining aspect ratio, fitting within size x size
        let thumbnail = img.resize(size, size, FilterType::Lanczos3);
        let (thumb_width, thumb_height) = (thumbnail.width(), thumbnail.height());
        
        // Save thumbnail
        thumbnail.save_with_format(&thumb_path, ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        
        // Store in database
        let rel_path = Path::new(subdir).join(&thumb_filename);
        crate::db::upsert_thumbnail(
            db_path,
            file_id,
            size as i32,
            &rel_path.to_string_lossy(),
            file_modified_at,
            thumb_width as i32,
            thumb_height as i32,
        )?;
        
        Ok(Some(thumb_path))
    }

    /// Delete all thumbnails for a file
    pub fn delete_thumbnails_for_file(&self, db_path: &Path, file_id: i64) -> Result<(), String> {
        // Delete physical files
        if let Ok(thumbs) = crate::db::get_thumbnails_for_file(db_path, file_id) {
            for thumb in thumbs {
                let path = self.base_path.join(&thumb.path);
                let _ = std::fs::remove_file(path);
            }
        }
        
        // Delete database records
        crate::db::delete_thumbnails_for_file(db_path, file_id)?;
        
        Ok(())
    }

    /// Get the base path for thumbnails
    pub fn get_base_path(&self) -> &Path {
        &self.base_path
    }

    /// Get supported thumbnail sizes
    pub fn get_supported_sizes() -> Vec<u32> {
        THUMBNAIL_SIZES.to_vec()
    }
}

/// Get supported thumbnail sizes (convenience function)
pub fn get_supported_sizes() -> Vec<u32> {
    THUMBNAIL_SIZES.to_vec()
}
