use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownAnalysis {
    pub headings: Vec<MarkdownHeading>,
    pub links: Vec<MarkdownLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownHeading {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLink {
    pub label: String,
    pub target: String,
    pub kind: LinkKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    Local,
    External,
    Wikilink,
}

pub fn is_markdown_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md" | "mdx" | "markdown")
    )
}

pub fn analyze(content: &str) -> MarkdownAnalysis {
    let stripped = strip_code_fences(content);
    MarkdownAnalysis {
        headings: extract_headings(&stripped),
        links: extract_links(&stripped),
    }
}

fn strip_code_fences(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut in_fence = false;
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            out.push('\n');
            continue;
        }
        if in_fence {
            out.push('\n');
        } else {
            out.push_str(line);
        }
    }
    out
}

fn extract_headings(content: &str) -> Vec<MarkdownHeading> {
    let re = Regex::new(r"(?m)^(#{1,6})\s+(.+?)\s*#*\s*$").unwrap();
    let mut headings = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        if let Some(caps) = re.captures(line) {
            let level = caps[1].len() as u8;
            let text = caps[2].trim().to_string();
            if !text.is_empty() {
                headings.push(MarkdownHeading {
                    level,
                    text,
                    line: line_idx + 1,
                });
            }
        }
    }
    headings
}

fn extract_links(content: &str) -> Vec<MarkdownLink> {
    let mut links = Vec::new();

    // Standard [label](target) — non-greedy on label, balance parens conservatively.
    // Optional title in quotes is allowed and ignored.
    let md_link = Regex::new(r#"\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#).unwrap();
    for cap in md_link.captures_iter(content) {
        let label = cap[1].trim().to_string();
        let target = cap[2].trim().to_string();
        if target.is_empty() || target.starts_with('#') {
            continue;
        }
        let kind = classify_target(&target);
        links.push(MarkdownLink { label, target, kind });
    }

    // [[wikilink]] or [[wikilink|label]]
    let wikilink = Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    for cap in wikilink.captures_iter(content) {
        let target = cap[1].trim().to_string();
        let label = cap
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_else(|| target.clone());
        if !target.is_empty() {
            links.push(MarkdownLink {
                label,
                target,
                kind: LinkKind::Wikilink,
            });
        }
    }

    links
}

fn classify_target(target: &str) -> LinkKind {
    if target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with("ftp://")
        || target.starts_with("//")
    {
        return LinkKind::External;
    }
    LinkKind::Local
}

/// Resolve a markdown link target to an absolute path, given the source file path.
/// Wikilinks and bare paths fall back to a same-folder lookup.
pub fn resolve_link_target(source_file: &str, target: &str, kind: &LinkKind) -> Option<String> {
    if matches!(kind, LinkKind::External) {
        return None;
    }
    let source_dir = Path::new(source_file).parent()?.to_string_lossy().to_string();

    // Strip anchor and query suffixes
    let clean_target = target.split(['#', '?']).next().unwrap_or(target);
    if clean_target.is_empty() {
        return None;
    }

    if clean_target.starts_with('/') {
        return Some(clean_target.to_string());
    }

    let mut parts: Vec<&str> = source_dir
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    for part in clean_target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    Some(format!("/{}", parts.join("/")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_atx_headings() {
        let md = "# Top\n\n## Sub\n\nbody\n\n### Deeper #";
        let a = analyze(md);
        assert_eq!(a.headings.len(), 3);
        assert_eq!(a.headings[0].level, 1);
        assert_eq!(a.headings[0].text, "Top");
        assert_eq!(a.headings[2].level, 3);
        assert_eq!(a.headings[2].text, "Deeper");
    }

    #[test]
    fn extracts_links_and_skips_anchors() {
        let md = "see [doc](./readme.md) and [home](https://x.test) and [#anchor](#section)";
        let a = analyze(md);
        assert_eq!(a.links.len(), 2);
        assert_eq!(a.links[0].kind, LinkKind::Local);
        assert_eq!(a.links[1].kind, LinkKind::External);
    }

    #[test]
    fn extracts_wikilinks() {
        let md = "[[Note A]] and [[note-b|Display]]";
        let a = analyze(md);
        assert_eq!(a.links.len(), 2);
        assert!(a.links.iter().all(|l| matches!(l.kind, LinkKind::Wikilink)));
        assert_eq!(a.links[1].label, "Display");
    }

    #[test]
    fn skips_fenced_code_blocks() {
        let md = "# Real\n\n```\n# Not a heading\n[fake](./not.md)\n```\n\n## Real Sub";
        let a = analyze(md);
        assert_eq!(a.headings.len(), 2);
        assert_eq!(a.links.len(), 0);
    }

    #[test]
    fn resolves_relative_links() {
        let r = resolve_link_target("/a/b/c.md", "../d/e.md", &LinkKind::Local);
        assert_eq!(r.as_deref(), Some("/a/d/e.md"));
    }
}
