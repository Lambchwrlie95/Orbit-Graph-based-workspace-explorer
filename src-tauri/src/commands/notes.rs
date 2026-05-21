use crate::models::{NodeNote, NoteLink, ScannedEntry};
use crate::AppState;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::State;

#[tauri::command]
pub async fn get_node_note(path: String, state: State<'_, AppState>) -> Result<NodeNote, String> {
    let (body, updated_at) = crate::db::get_note_body(&state.db_path, &path)?;
    let links = crate::db::note_links_for_source(&state.db_path, &path)?;
    let backlinks = crate::db::note_backlinks_for_target(&state.db_path, &path)?;
    Ok(NodeNote {
        path,
        body,
        links,
        backlinks,
        updated_at,
    })
}

#[tauri::command]
pub async fn save_node_note(
    path: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<NodeNote, String> {
    let links = extract_wiki_links(&body)?;
    let updated_at = {
        let _guard = state.db_write_lock.lock().map_err(|e| e.to_string())?;
        let updated_at = crate::db::save_node_note(&state.db_path, &path, &body, &links)?;
        if let Some(source) = crate::db::get_file(&state.db_path, &path)? {
            let resolved = crate::db::resolve_note_link_targets(&state.db_path, &path, &links)?;
            crate::db::store_markdown_links(&state.db_path, source.id, &resolved)?;
        }
        updated_at
    };
    let backlinks = crate::db::note_backlinks_for_target(&state.db_path, &path)?;
    Ok(NodeNote {
        path,
        body,
        links,
        backlinks,
        updated_at: Some(updated_at),
    })
}

#[tauri::command]
pub async fn create_note_from_wikilink(
    root_path: String,
    target: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = Path::new(&root_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Workspace root is not a directory".to_string());
    }

    let title = normalize_note_title(&target)?;
    let file_name = note_file_name(&title)?;
    let note_path = root.join(file_name);
    if note_path.exists() && note_path.is_dir() {
        return Err("A folder already exists with that note name".to_string());
    }
    if !note_path.exists() {
        fs::write(&note_path, format!("# {title}\n\n")).map_err(|e| e.to_string())?;
    }

    let canonical = note_path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Created note escaped the workspace root".to_string());
    }

    let row = scanned_entry_for_note(&canonical, &root)?;
    {
        let _guard = state.db_write_lock.lock().map_err(|e| e.to_string())?;
        crate::db::index_rows(&state.db_path, &root.to_string_lossy(), &[row])?;
    }
    Ok(canonical.to_string_lossy().to_string())
}

fn normalize_note_title(target: &str) -> Result<String, String> {
    let mut title = target
        .split('|')
        .next()
        .unwrap_or(target)
        .split('#')
        .next()
        .unwrap_or(target)
        .trim()
        .to_string();
    title = title.replace(['/', '\\'], " ");
    title = title
        .chars()
        .map(|ch| match ch {
            ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            _ => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if title.is_empty() {
        return Err("Wikilink target is empty".to_string());
    }
    Ok(title)
}

fn note_file_name(title: &str) -> Result<String, String> {
    let path = Path::new(title);
    if path.components().count() != 1 {
        return Err("Note names cannot contain path separators".to_string());
    }
    let has_markdown_extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "mdx" | "markdown"))
        .unwrap_or(false);
    Ok(if has_markdown_extension {
        title.to_string()
    } else {
        format!("{title}.md")
    })
}

fn scanned_entry_for_note(path: &Path, root: &Path) -> Result<ScannedEntry, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let parent = path.parent().unwrap_or(root);
    Ok(ScannedEntry {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        parent_path: Some(parent.to_string_lossy().to_string()),
        extension: path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase()),
        mime_type: Some("text/markdown".to_string()),
        size_bytes: metadata.len() as i64,
        modified_at: metadata.modified().ok().and_then(time_to_epoch),
        created_at: metadata.created().ok().and_then(time_to_epoch),
        is_dir: false,
        is_symlink: false,
        target_path: None,
    })
}

fn time_to_epoch(time: std::time::SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs() as i64)
}

fn extract_wiki_links(body: &str) -> Result<Vec<NoteLink>, String> {
    let re =
        Regex::new(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]").map_err(|e| e.to_string())?;
    let mut seen = HashSet::new();
    let mut links = Vec::new();
    for capture in re.captures_iter(body) {
        let target = capture
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if target.is_empty() {
            continue;
        }
        let label = capture
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| target.clone());
        let key = format!("{target}\0{label}");
        if seen.insert(key) {
            links.push(NoteLink { target, label });
        }
    }
    Ok(links)
}

#[cfg(test)]
mod tests {
    use super::extract_wiki_links;

    #[test]
    fn extracts_deduped_wiki_links() {
        let links = extract_wiki_links("See [[Alpha]] and [[Beta|custom]] and [[Alpha]].").unwrap();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "Alpha");
        assert_eq!(links[0].label, "Alpha");
        assert_eq!(links[1].target, "Beta");
        assert_eq!(links[1].label, "custom");
    }
}
