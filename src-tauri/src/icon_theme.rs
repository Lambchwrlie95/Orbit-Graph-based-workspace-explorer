//! Yazi-inspired icon theme system.
//!
//! Themes live as TOML files in `~/.config/orbit/icon-themes/<id>.toml`. Two
//! defaults are bundled and written on first run: `orbit-default.toml` (the
//! Unicode-shape glyphs that ship with the app) and `nerd-font.toml` (Yazi-
//! compatible private-use-area glyphs that need a Nerd Font installed).
//!
//! Match priority for a given path mirrors Yazi's pipeline so users coming
//! from Yazi find this familiar:
//!
//!   1. globs       — glob patterns against the absolute path (slowest)
//!   2. dirs        — exact directory-name match
//!   3. files       — exact full filename match (e.g. `Cargo.toml`)
//!   4. exts        — file extension (lowercased, no leading dot)
//!   5. defaults    — `default_dir` for folders, `default_file` for files

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use globset::{Glob, GlobMatcher};
use serde::{Deserialize, Serialize};

const ORBIT_DEFAULT_TOML: &str = include_str!("../themes/orbit-default.toml");
const NERD_FONT_TOML: &str = include_str!("../themes/nerd-font.toml");
const MATERIAL_TOML: &str = include_str!("../themes/material.toml");
const MINIMAL_MONO_TOML: &str = include_str!("../themes/minimal-mono.toml");
const VIVID_TOML: &str = include_str!("../themes/vivid.toml");

/// All themes that ship with the binary. The id (first field) doubles as the
/// filename stem written into `~/.config/orbit/icon-themes/`. Adding a new
/// bundled theme means: drop a TOML in src-tauri/themes/, add an
/// include_str! constant, and append a row here. No other code needs to change.
const BUILTIN_THEMES: &[(&str, &str)] = &[
    ("orbit-default", ORBIT_DEFAULT_TOML),
    ("nerd-font", NERD_FONT_TOML),
    ("material", MATERIAL_TOML),
    ("minimal-mono", MINIMAL_MONO_TOML),
    ("vivid", VIVID_TOML),
];

fn is_builtin(id: &str) -> bool {
    BUILTIN_THEMES.iter().any(|(name, _)| *name == id)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IconRule {
    /// Display glyph (single char or short string).
    pub text: String,
    /// Hex color string (e.g. `#dea584`). Optional — falls back to inheriting.
    pub fg: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct NamedRule {
    name: String,
    text: String,
    fg: Option<String>,
}

/// Same shape as NamedRule but `name` is optional — used for the per-section
/// default_file / default_dir / default_cluster entries which have no key.
#[derive(Debug, Clone, Deserialize, Default)]
struct DefaultRule {
    text: String,
    fg: Option<String>,
}

impl From<&DefaultRule> for IconRule {
    fn from(r: &DefaultRule) -> Self {
        IconRule {
            text: r.text.clone(),
            fg: r.fg.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
struct GlobRule {
    url: String,
    text: String,
    fg: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct IconSection {
    #[serde(default)]
    exts: Vec<NamedRule>,
    #[serde(default)]
    files: Vec<NamedRule>,
    #[serde(default)]
    dirs: Vec<NamedRule>,
    #[serde(default)]
    globs: Vec<GlobRule>,
    #[serde(default)]
    default_dir: Option<DefaultRule>,
    #[serde(default)]
    default_file: Option<DefaultRule>,
    #[serde(default)]
    default_cluster: Option<DefaultRule>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ThemeFile {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    icon: IconSection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconThemeMeta {
    /// Stable filename-derived id used to switch active theme.
    pub id: String,
    /// Human display name from the TOML's `name` field, falling back to id.
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub path: String,
    pub builtin: bool,
}

#[derive(Clone)]
#[allow(dead_code)] // `resolve()` and `globs` are exercised in tests and kept for parity
                     // with the frontend resolver; the frontend does the live lookups.
pub struct IconTheme {
    pub meta: IconThemeMeta,
    by_ext: HashMap<String, IconRule>,
    by_filename: HashMap<String, IconRule>,
    by_dirname: HashMap<String, IconRule>,
    globs: Vec<(GlobMatcher, IconRule)>,
    default_file: IconRule,
    default_dir: IconRule,
    default_cluster: IconRule,
}

impl IconTheme {
    fn from_file(path: &Path, builtin: bool) -> Result<Self, String> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| format!("read {}: {e}", path.display()))?;
        let id = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".into());
        Self::from_toml(&raw, &id, path, builtin)
    }

    fn from_toml(raw: &str, id: &str, path: &Path, builtin: bool) -> Result<Self, String> {
        let parsed: ThemeFile = toml::from_str(raw).map_err(|e| {
            format!("parse {}: {e}", path.display())
        })?;
        let meta = IconThemeMeta {
            id: id.to_string(),
            name: parsed.name.clone().unwrap_or_else(|| id.to_string()),
            author: parsed.author,
            version: parsed.version,
            path: path.to_string_lossy().to_string(),
            builtin,
        };

        let to_rule = |r: &NamedRule| IconRule {
            text: r.text.clone(),
            fg: r.fg.clone(),
        };

        let mut by_ext = HashMap::new();
        for r in &parsed.icon.exts {
            // Normalize: lowercase, strip leading dot
            let key = r.name.trim_start_matches('.').to_lowercase();
            by_ext.insert(key, to_rule(r));
        }
        let mut by_filename = HashMap::new();
        for r in &parsed.icon.files {
            by_filename.insert(r.name.clone(), to_rule(r));
        }
        let mut by_dirname = HashMap::new();
        for r in &parsed.icon.dirs {
            by_dirname.insert(r.name.clone(), to_rule(r));
        }
        let mut globs = Vec::new();
        for r in &parsed.icon.globs {
            match Glob::new(&r.url) {
                Ok(g) => globs.push((
                    g.compile_matcher(),
                    IconRule {
                        text: r.text.clone(),
                        fg: r.fg.clone(),
                    },
                )),
                Err(e) => {
                    eprintln!("orbit: bad glob '{}' in theme '{}': {e}", r.url, meta.name);
                }
            }
        }

        let default_file = parsed
            .icon
            .default_file
            .as_ref()
            .map(IconRule::from)
            .unwrap_or_else(|| IconRule {
                text: "·".into(),
                fg: Some("#a8bbc8".into()),
            });
        let default_dir = parsed
            .icon
            .default_dir
            .as_ref()
            .map(IconRule::from)
            .unwrap_or_else(|| IconRule {
                text: "▢".into(),
                fg: Some("#73c991".into()),
            });
        let default_cluster = parsed
            .icon
            .default_cluster
            .as_ref()
            .map(IconRule::from)
            .unwrap_or_else(|| IconRule {
                text: "◉".into(),
                fg: Some("#f59e0b".into()),
            });

        Ok(Self {
            meta,
            by_ext,
            by_filename,
            by_dirname,
            globs,
            default_file,
            default_dir,
            default_cluster,
        })
    }

    /// Resolve an icon for the given path. Match order matches Yazi's:
    /// globs → dirs/files → exts → defaults.
    #[allow(dead_code)]
    pub fn resolve(&self, path: &str, is_dir: bool, is_cluster: bool) -> IconRule {
        if is_cluster {
            return self.default_cluster.clone();
        }
        // 1. globs (slowest, highest priority)
        for (m, rule) in &self.globs {
            if m.is_match(path) {
                return rule.clone();
            }
        }
        let p = Path::new(path);
        let basename = p
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        if is_dir {
            // 2. exact dir name
            if let Some(r) = self.by_dirname.get(&basename) {
                return r.clone();
            }
            return self.default_dir.clone();
        }
        // 3. exact file name (Cargo.toml, README.md, ...)
        if let Some(r) = self.by_filename.get(&basename) {
            return r.clone();
        }
        // 4. extension / compound suffix. Longest suffix wins so rules like
        // `blade.php` can beat the generic `php` icon.
        let lowered = basename.to_lowercase();
        let parts: Vec<&str> = lowered.split('.').collect();
        if parts.len() > 1 {
            for index in 1..parts.len() {
                let suffix = parts[index..].join(".");
                if let Some(r) = self.by_ext.get(&suffix) {
                    return r.clone();
                }
            }
        } else if let Some(r) = self.by_ext.get(&lowered) {
            return r.clone();
        }
        self.default_file.clone()
    }
}

fn config_root() -> Result<PathBuf, String> {
    dirs::config_dir()
        .map(|p| p.join("orbit"))
        .ok_or_else(|| "no config dir".into())
}

pub fn themes_dir() -> Result<PathBuf, String> {
    Ok(config_root()?.join("icon-themes"))
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(config_root()?.join("settings.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default)]
    active_icon_theme: Option<String>,
}

fn read_settings() -> Settings {
    match settings_path().and_then(|p| std::fs::read_to_string(p).map_err(|e| e.to_string())) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

fn write_settings(s: &Settings) -> Result<(), String> {
    let p = settings_path()?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(&p, raw).map_err(|e| e.to_string())
}

/// Make sure the user's `~/.config/orbit/icon-themes/` exists and that the two
/// bundled themes are present. Bundled files are overwritten on every launch
/// so an app upgrade picks up upstream tweaks; user-authored themes (any other
/// file) are left untouched.
pub fn ensure_bundled_themes() -> Result<(), String> {
    let dir = themes_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (id, body) in BUILTIN_THEMES {
        std::fs::write(dir.join(format!("{id}.toml")), body).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_themes() -> Result<Vec<IconThemeMeta>, String> {
    ensure_bundled_themes()?;
    let dir = themes_dir()?;
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("toml") {
            continue;
        }
        let id = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let builtin = is_builtin(id.as_str());
        match IconTheme::from_file(&path, builtin) {
            Ok(t) => out.push(t.meta),
            Err(e) => eprintln!("orbit: skip theme {}: {e}", path.display()),
        }
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    Ok(out)
}

pub fn load_theme(id: &str) -> Result<IconTheme, String> {
    ensure_bundled_themes()?;
    let dir = themes_dir()?;
    let path = dir.join(format!("{id}.toml"));
    let builtin = is_builtin(id);
    IconTheme::from_file(&path, builtin)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePayload {
    pub meta: IconThemeMeta,
    /// Flattened rules — the frontend uses the same priority order as Rust's
    /// resolve(), so we just send the maps over and let it decide.
    pub by_ext: HashMap<String, IconRule>,
    pub by_filename: HashMap<String, IconRule>,
    pub by_dirname: HashMap<String, IconRule>,
    pub globs: Vec<GlobPayload>,
    pub default_file: IconRule,
    pub default_dir: IconRule,
    pub default_cluster: IconRule,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobPayload {
    pub pattern: String,
    pub rule: IconRule,
}

impl IconTheme {
    pub fn to_payload(&self, original_globs: Vec<(String, IconRule)>) -> ThemePayload {
        ThemePayload {
            meta: self.meta.clone(),
            by_ext: self.by_ext.clone(),
            by_filename: self.by_filename.clone(),
            by_dirname: self.by_dirname.clone(),
            globs: original_globs
                .into_iter()
                .map(|(pattern, rule)| GlobPayload { pattern, rule })
                .collect(),
            default_file: self.default_file.clone(),
            default_dir: self.default_dir.clone(),
            default_cluster: self.default_cluster.clone(),
        }
    }
}

// Public Tauri-facing API ---------------------------------------------------

pub fn cmd_list_themes() -> Result<Vec<IconThemeMeta>, String> {
    list_themes()
}

pub fn cmd_get_active_theme() -> Result<ThemePayload, String> {
    ensure_bundled_themes()?;
    let settings = read_settings();
    let id = settings
        .active_icon_theme
        .unwrap_or_else(|| "nerd-font".to_string());
    // Re-parse to recover original glob patterns (matchers are opaque).
    let dir = themes_dir()?;
    let path = dir.join(format!("{id}.toml"));
    let raw = std::fs::read_to_string(&path).map_err(|e| {
        format!("Active theme '{}' not found: {e}", id)
    })?;
    let parsed: ThemeFile = toml::from_str(&raw)
        .map_err(|e| format!("parse {}: {e}", path.display()))?;
    let theme = IconTheme::from_file(&path, is_builtin(id.as_str()))?;
    let original_globs: Vec<(String, IconRule)> = parsed
        .icon
        .globs
        .iter()
        .map(|g| {
            (
                g.url.clone(),
                IconRule {
                    text: g.text.clone(),
                    fg: g.fg.clone(),
                },
            )
        })
        .collect();
    Ok(theme.to_payload(original_globs))
}

pub fn cmd_set_active_theme(id: String) -> Result<(), String> {
    // Validate the theme exists & parses
    let _ = load_theme(&id)?;
    let mut s = read_settings();
    s.active_icon_theme = Some(id);
    write_settings(&s)
}

/// Write a user-authored theme TOML to ~/.config/orbit/icon-themes/<id>.toml.
/// Refuses to overwrite a builtin theme (those are restored from include_str!
/// on every launch anyway). Validates the TOML parses before writing.
pub fn save_user_theme(id: &str, toml_content: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("theme id must not be empty".into());
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("theme id contains invalid characters".into());
    }
    if is_builtin(id) {
        return Err(format!("'{id}' is a builtin theme and cannot be overwritten"));
    }
    // Parse-validate before touching disk so a bad TOML doesn't half-corrupt
    // the user's settings.
    let _: ThemeFile =
        toml::from_str(toml_content).map_err(|e| format!("invalid theme TOML: {e}"))?;
    let dir = themes_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{id}.toml")), toml_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a user-authored theme. Builtin themes can't be deleted (they'd be
/// rewritten on next launch anyway).
pub fn delete_user_theme(id: &str) -> Result<(), String> {
    if is_builtin(id) {
        return Err(format!("'{id}' is a builtin theme and cannot be deleted"));
    }
    let dir = themes_dir()?;
    let path = dir.join(format!("{id}.toml"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // If the deleted theme was active, fall back to nerd-font.
    let mut s = read_settings();
    if s.active_icon_theme.as_deref() == Some(id) {
        s.active_icon_theme = Some("nerd-font".to_string());
        write_settings(&s)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn bundled_default_parses() {
        let theme = IconTheme::from_toml(
            ORBIT_DEFAULT_TOML,
            "orbit-default",
            &PathBuf::from("orbit-default.toml"),
            true,
        )
        .expect("bundled default theme parses");
        let icon = theme.resolve("/tmp/foo.rs", false, false);
        assert!(!icon.text.is_empty());
    }

    #[test]
    fn bundled_nerd_parses() {
        let theme = IconTheme::from_toml(
            NERD_FONT_TOML,
            "nerd-font",
            &PathBuf::from("nerd-font.toml"),
            true,
        )
        .expect("bundled nerd-font theme parses");
        let icon = theme.resolve("/tmp/foo.rs", false, false);
        assert!(!icon.text.is_empty());
    }

    #[test]
    fn priority_glob_beats_ext() {
        let toml = r#"
            name = "test"
            [icon]
            exts = [{ name = "zip", text = "Z" }]
            globs = [{ url = "**/Downloads/*.zip", text = "G" }]
        "#;
        let theme = IconTheme::from_toml(
            toml,
            "test",
            &PathBuf::from("test.toml"),
            false,
        )
        .unwrap();
        assert_eq!(theme.resolve("/home/u/Downloads/x.zip", false, false).text, "G");
        assert_eq!(theme.resolve("/home/u/x.zip", false, false).text, "Z");
    }

    #[test]
    fn priority_filename_beats_ext() {
        let toml = r#"
            name = "test"
            [icon]
            exts = [{ name = "toml", text = "T" }]
            files = [{ name = "Cargo.toml", text = "C" }]
        "#;
        let theme = IconTheme::from_toml(
            toml,
            "test",
            &PathBuf::from("test.toml"),
            false,
        )
        .unwrap();
        assert_eq!(theme.resolve("/p/Cargo.toml", false, false).text, "C");
        assert_eq!(theme.resolve("/p/foo.toml", false, false).text, "T");
    }

    #[test]
    fn compound_extension_beats_generic_extension() {
        let toml = r#"
            name = "test"
            [icon]
            exts = [
                { name = "php", text = "P" },
                { name = "blade.php", text = "B" },
            ]
        "#;
        let theme = IconTheme::from_toml(
            toml,
            "test",
            &PathBuf::from("test.toml"),
            false,
        )
        .unwrap();
        assert_eq!(theme.resolve("/p/index.blade.php", false, false).text, "B");
        assert_eq!(theme.resolve("/p/index.php", false, false).text, "P");
    }

    #[test]
    fn dir_uses_dirname_match() {
        let toml = r#"
            name = "test"
            [icon]
            dirs = [{ name = "node_modules", text = "N" }]
        "#;
        let theme = IconTheme::from_toml(
            toml,
            "test",
            &PathBuf::from("test.toml"),
            false,
        )
        .unwrap();
        assert_eq!(theme.resolve("/p/node_modules", true, false).text, "N");
        assert_eq!(theme.resolve("/p/src", true, false).text, "▢"); // default_dir
    }
}
