//! Reads the active Omarchy theme palette and exposes it as a Tauri command
//! so the frontend can apply the active colors to graph nodes, edges, the app
//! background, and UI accents at runtime.
//!
//! Two sources, in order of preference:
//!   1. `~/.config/omarchy/current/theme/orbit.toml` — rendered from Orbit's
//!      template at `src-tauri/themes/orbit.toml.tpl` after the user runs
//!      `scripts/install-omarchy-theme.sh`. Carries explicit graph-edge
//!      mappings on top of the standard palette.
//!   2. `~/.config/omarchy/current/theme/colors.toml` — the canonical flat
//!      key=value file that ships with every Omarchy theme. Always present
//!      when Omarchy is installed.

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
    /// Optional graph-edge category overrides sourced from `orbit.toml`'s
    /// `[graph]` section. Empty when only `colors.toml` is available — the
    /// frontend falls back to ANSI-palette-driven defaults from CSS.
    #[serde(default)]
    pub graph: GraphPalette,
    /// Whether the colors.toml was actually found (false = Omarchy not present)
    pub available: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphPalette {
    pub edge_hierarchy: String,
    pub edge_code: String,
    pub edge_docs: String,
    pub edge_symlink: String,
    pub edge_semantic: String,
    pub edge_tags: String,
    pub edge_other: String,
    pub canvas: String,
    pub node_default: String,
}

pub fn colors_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".config/omarchy/current/theme/colors.toml")
}

/// Path Orbit's omarchy template renders to. Optional — only present after
/// `scripts/install-omarchy-theme.sh` has been run by the user.
pub fn orbit_theme_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".config/omarchy/current/theme/orbit.toml")
}

pub fn read_omarchy_colors() -> OmarchyColors {
    let Some(map) = read_palette_map() else {
        return OmarchyColors {
            available: false,
            ..Default::default()
        };
    };

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
        graph: read_graph_section().unwrap_or_default(),
        available: true,
    }
}

/// Parse a flat `key = "value"` TOML body, ignoring section headers. Both
/// `colors.toml` and the `[palette]` block of `orbit.toml` live in the same
/// shape, so one parser handles both. Returns None when no source exists.
fn read_palette_map() -> Option<HashMap<String, String>> {
    let candidates = [orbit_theme_path(), colors_path()];
    for path in candidates.iter() {
        if let Ok(content) = std::fs::read_to_string(path) {
            return Some(parse_flat_toml(&content));
        }
    }
    None
}

fn parse_flat_toml(content: &str) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() || line.starts_with('[') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim().to_string();
            let val = v.trim().trim_matches('"').to_string();
            map.insert(key, val);
        }
    }
    map
}

/// Pull the `[graph]` section out of `orbit.toml` if it exists. Returns None
/// when only `colors.toml` is available — the frontend then uses its
/// ANSI-palette-driven defaults from CSS.
fn read_graph_section() -> Option<GraphPalette> {
    let content = std::fs::read_to_string(orbit_theme_path()).ok()?;
    let mut in_graph = false;
    let mut graph_map: HashMap<String, String> = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            in_graph = line.eq_ignore_ascii_case("[graph]");
            continue;
        }
        if !in_graph {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            graph_map.insert(k.trim().to_string(), v.trim().trim_matches('"').to_string());
        }
    }
    if graph_map.is_empty() {
        return None;
    }
    let g = |k: &str| graph_map.get(k).cloned().unwrap_or_default();
    Some(GraphPalette {
        edge_hierarchy: g("edge_hierarchy"),
        edge_code: g("edge_code"),
        edge_docs: g("edge_docs"),
        edge_symlink: g("edge_symlink"),
        edge_semantic: g("edge_semantic"),
        edge_tags: g("edge_tags"),
        edge_other: g("edge_other"),
        canvas: g("canvas"),
        node_default: g("node_default"),
    })
}
