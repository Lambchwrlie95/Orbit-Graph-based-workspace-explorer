use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use jwalk::WalkDir;

use crate::models::ScannedEntry;

const IGNORED_DIR_NAMES: &[&str] = &[
    ".cache",
    ".git",
    ".local",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "target",
    "thumbnails",
    "Trash",
];

pub fn scan_root(root: &Path, max_entries: usize) -> Result<Vec<ScannedEntry>, String> {
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut rows = Vec::with_capacity(max_entries.min(10_000));

    for entry in WalkDir::new(&canonical_root)
        .parallelism(jwalk::Parallelism::RayonNewPool(0))
        .skip_hidden(false)
        .follow_links(false)
    {
        if rows.len() >= max_entries {
            break;
        }
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        if should_ignore(&path) {
            continue;
        }
        if let Ok(row) = scanned_entry(&path) {
            rows.push(row);
        }
    }

    Ok(rows)
}

fn should_ignore(path: &Path) -> bool {
    path.components().any(|comp| {
        let seg = comp.as_os_str().to_string_lossy();
        IGNORED_DIR_NAMES.iter().any(|ignored| seg == *ignored)
    })
}

fn scanned_entry(path: &Path) -> Result<ScannedEntry, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    let is_symlink = metadata.file_type().is_symlink();
    let is_dir = metadata.is_dir();
    let target_path = if is_symlink {
        fs::read_link(path)
            .ok()
            .map(|target| absolutize_target(path, target))
            .map(|target| target.to_string_lossy().to_string())
    } else {
        None
    };

    Ok(ScannedEntry {
        path: path.to_string_lossy().to_string(),
        name: filename(path),
        parent_path: path
            .parent()
            .map(|parent| parent.to_string_lossy().to_string()),
        extension: if is_dir { None } else { extension(path) },
        mime_type: guess_mime(path, is_dir),
        size_bytes: if is_dir { 0 } else { metadata.len() as i64 },
        modified_at: to_epoch(metadata.modified()),
        created_at: to_epoch(metadata.created()),
        is_dir,
        is_symlink,
        target_path,
    })
}

fn filename(path: &Path) -> String {
    path.file_name()
        .unwrap_or_else(|| OsStr::new(""))
        .to_string_lossy()
        .to_string()
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
}

fn guess_mime(path: &Path, is_dir: bool) -> Option<String> {
    if is_dir {
        return Some("inode/directory".into());
    }
    let ext = extension(path)?;
    let mime = match ext.as_str() {
        "bmp" => "image/bmp",
        "css" => "text/css",
        "gif" => "image/gif",
        "html" | "htm" => "text/html",
        "ico" => "image/x-icon",
        "jpeg" | "jpg" => "image/jpeg",
        "js" | "mjs" | "cjs" => "text/javascript",
        "json" => "application/json",
        "md" | "markdown" => "text/markdown",
        "png" => "image/png",
        "rs" => "text/rust",
        "svg" => "image/svg+xml",
        "toml" => "application/toml",
        "ts" | "tsx" => "text/typescript",
        "txt" => "text/plain",
        "webp" => "image/webp",
        "yaml" | "yml" => "application/yaml",
        _ => return None,
    };
    Some(mime.into())
}

fn to_epoch(time: std::io::Result<SystemTime>) -> Option<i64> {
    time.ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
}

fn absolutize_target(source: &Path, target: PathBuf) -> PathBuf {
    if target.is_absolute() {
        return target;
    }
    source
        .parent()
        .unwrap_or_else(|| Path::new("/"))
        .join(target)
}
