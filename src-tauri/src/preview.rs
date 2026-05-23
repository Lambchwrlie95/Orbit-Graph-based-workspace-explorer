use std::fs;
use std::path::Path;

use crate::models::{PreviewMetaItem, PreviewPayload};

const MAX_TEXT_PREVIEW_BYTES: usize = 32_000;

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

    if let Some(ext) = target.extension().and_then(|ext| ext.to_str()) {
        meta.push(PreviewMetaItem {
            key: "Extension".into(),
            value: ext.to_ascii_lowercase(),
        });
    }

    if let Ok(created) = metadata.created() {
        if let Ok(epoch) = created.duration_since(std::time::UNIX_EPOCH) {
            meta.push(PreviewMetaItem {
                key: "Created".into(),
                value: epoch.as_secs().to_string(),
            });
        }
    }

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

    if let Some(mime) = video_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "video".into(),
            title,
            path: path.into(),
            summary: "Video preview".into(),
            // Content stays empty — the frontend uses Tauri's asset protocol
            // (convertFileSrc) to stream large media without base64ing them.
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = pdf_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "pdf".into(),
            title,
            path: path.into(),
            summary: "PDF document".into(),
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = font_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "font".into(),
            title,
            path: path.into(),
            summary: "Font preview".into(),
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = archive_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "archive".into(),
            title,
            path: path.into(),
            summary: "Archive (listing not yet supported)".into(),
            content: None,
            metadata: meta,
        });
    }

    if let Some(mime) = image_mime(target) {
        meta.push(PreviewMetaItem {
            key: "MIME".into(),
            value: mime.into(),
        });
        return Ok(PreviewPayload {
            kind: "image".into(),
            title,
            path: path.into(),
            // The frontend streams the image via Tauri's asset protocol
            // (`convertFileSrc`) instead of base64-inlining it here. Inlining
            // multi-megabyte wallpapers was making the Inspector allocate huge
            // strings and could crash/reset the React tree while clicking
            // through image folders.
            summary: "Image preview".into(),
            content: None,
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
        // Codec parameters help WebKitGTK/GStreamer pick the right decoder.
        // Without them the browser often falls back to "unknown" and gives up.
        "ogg" | "oga" => Some("audio/ogg; codecs=vorbis"),
        "opus" => Some("audio/ogg; codecs=opus"),
        "flac" => Some("audio/flac"),
        "aac" => Some("audio/aac"),
        "m4a" => Some("audio/mp4"),
        "weba" => Some("audio/webm; codecs=opus"),
        "aiff" | "aif" | "aifc" => Some("audio/aiff"),
        "au" => Some("audio/basic"),
        _ => None,
    }
}

fn video_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "m4v" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "ogv" => Some("video/ogg"),
        "mov" => Some("video/quicktime"),
        "mkv" => Some("video/x-matroska"),
        "avi" => Some("video/x-msvideo"),
        _ => None,
    }
}

fn pdf_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn font_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "ttf" => Some("font/ttf"),
        "otf" => Some("font/otf"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        _ => None,
    }
}

fn archive_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "zip" => Some("application/zip"),
        "tar" => Some("application/x-tar"),
        "gz" | "tgz" => Some("application/gzip"),
        "bz2" => Some("application/x-bzip2"),
        "xz" => Some("application/x-xz"),
        "7z" => Some("application/x-7z-compressed"),
        "rar" => Some("application/vnd.rar"),
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
