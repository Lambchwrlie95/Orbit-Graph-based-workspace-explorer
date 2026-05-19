use std::fs;
use std::path::Path;

use base64::{engine::general_purpose, Engine as _};

use crate::models::{PreviewMetaItem, PreviewPayload};

const MAX_TEXT_PREVIEW_BYTES: usize = 32_000;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;

pub fn build_preview(path: &str) -> Result<PreviewPayload, String> {
    let target = Path::new(path);
    let metadata = fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();
    let title = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    let mut meta = vec![
        PreviewMetaItem {
            key: "Type".into(),
            value: if is_dir {
                "Directory".into()
            } else {
                "File".into()
            },
        },
        PreviewMetaItem {
            key: "Size".into(),
            value: if is_dir {
                "-".into()
            } else {
                format!("{} bytes", metadata.len())
            },
        },
    ];

    if let Ok(modified) = metadata.modified() {
        if let Ok(epoch) = modified.duration_since(std::time::UNIX_EPOCH) {
            meta.push(PreviewMetaItem {
                key: "Modified".into(),
                value: epoch.as_secs().to_string(),
            });
        }
    }

    if is_dir {
        let (folders, files) = count_dir(target);
        return Ok(PreviewPayload {
            kind: "directory".into(),
            title,
            path: path.into(),
            summary: format!("{folders} folders, {files} files"),
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = audio_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "audio".into(),
            title,
            path: path.into(),
            summary: "Audio preview".into(),
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = image_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
            return Ok(PreviewPayload {
                kind: "binary".into(),
                title,
                path: path.into(),
                summary: format!(
                    "Image preview skipped because the file is larger than {} MB.",
                    MAX_IMAGE_PREVIEW_BYTES / 1024 / 1024
                ),
                content: None,
                metadata: meta,
            });
        }
        let data = fs::read(target).map_err(|e| e.to_string())?;
        return Ok(PreviewPayload {
            kind: "image".into(),
            title,
            path: path.into(),
            summary: "Image preview".into(),
            content: Some(format!(
                "data:{mime};base64,{}",
                general_purpose::STANDARD.encode(data)
            )),
            metadata: meta,
        });
    }

    let data = fs::read(target).map_err(|e| e.to_string())?;
    let truncated = if data.len() > MAX_TEXT_PREVIEW_BYTES {
        &data[..MAX_TEXT_PREVIEW_BYTES]
    } else {
        &data
    };
    match std::str::from_utf8(truncated) {
        Ok(text) => Ok(PreviewPayload {
            kind: "text".into(),
            title,
            path: path.into(),
            summary: if data.len() > MAX_TEXT_PREVIEW_BYTES {
                "Text preview (truncated)".into()
            } else {
                "Text preview".into()
            },
            content: Some(text.into()),
            metadata: meta,
        }),
        Err(_) => Ok(PreviewPayload {
            kind: "binary".into(),
            title,
            path: path.into(),
            summary: "Binary preview is not rendered yet.".into(),
            content: None,
            metadata: meta,
        }),
    }
}

fn audio_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "ogg" => Some("audio/ogg"),
        "opus" => Some("audio/opus"),
        "flac" => Some("audio/flac"),
        "aac" => Some("audio/aac"),
        "m4a" => Some("audio/mp4"),
        "weba" | "webm" => Some("audio/webm"),
        _ => None,
    }
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        "ico" => Some("image/x-icon"),
        "jpeg" | "jpg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn count_dir(path: &Path) -> (usize, usize) {
    let mut folders = 0usize;
    let mut files = 0usize;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                folders += 1;
            } else {
                files += 1;
            }
        }
    }
    (folders, files)
}
