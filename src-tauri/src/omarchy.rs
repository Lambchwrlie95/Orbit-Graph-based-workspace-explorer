//! Reads `~/.config/omarchy/current/theme/colors.toml` and exposes the palette
//! as a Tauri command so the frontend can apply the active Omarchy theme colors
//! to graph nodes, the app background, and UI accents at runtime.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OmarchyColors {
    pub background: String,
    pub foreground: String,
    pub accent: String,
    pub cursor: String,
    pub active_border_color: String,
    pub selection_foreground: String,
    pub selection_background: String,
    /// ANSI palette color0..color15 (indices 0-15)
    pub palette: Vec<String>,
    /// Whether the colors.toml was actually found (false = Omarchy not present)
    pub available: bool,
}

fn colors_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".config/omarchy/current/theme/colors.toml")
}

pub fn read_omarchy_colors() -> OmarchyColors {
    let path = colors_path();
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => {
            return OmarchyColors {
                available: false,
                ..Default::default()
            }
        }
    };

    // Parse a flat key=value TOML file (all values are bare strings or quoted strings).
    let mut map: HashMap<String, String> = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim().to_string();
            let val = v.trim().trim_matches('"').to_string();
            map.insert(key, val);
        }
    }

    let get = |k: &str| map.get(k).cloned().unwrap_or_default();

    let mut palette = Vec::with_capacity(16);
    for i in 0..16u8 {
        palette.push(get(&format!("color{i}")));
    }

    OmarchyColors {
        background: get("background"),
        foreground: get("foreground"),
        accent: get("accent"),
        cursor: get("cursor"),
        active_border_color: get("active_border_color"),
        selection_foreground: get("selection_foreground"),
        selection_background: get("selection_background"),
        palette,
        available: true,
    }
}
