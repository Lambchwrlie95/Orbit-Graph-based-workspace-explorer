use crate::models::{NodeNote, NoteLink};
use crate::AppState;
use regex::Regex;
use std::collections::HashSet;
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
        crate::db::save_node_note(&state.db_path, &path, &body, &links)?
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
