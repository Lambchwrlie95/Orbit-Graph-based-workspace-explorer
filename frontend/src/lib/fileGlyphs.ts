/** Unicode glyph + semantic color per file extension. */
/** Shared by the graph, file views, and Inspector. */

import type { IconRule, IconThemePayload } from "../types";

export interface FileGlyphInfo {
  glyph: string;
  color: string;
  label: string;
}

export function glyphForExtension(ext?: string | null): string {
  const e = (ext ?? "").toLowerCase().replace(/^\./, "");
  if (["ts", "tsx"].includes(e)) return "⬡";
  if (["js", "jsx", "mjs", "cjs"].includes(e)) return "◈";
  if (["rs"].includes(e)) return "⬖";
  if (["py", "pyi", "pyw"].includes(e)) return "◇";
  if (["go"].includes(e)) return "⬢";
  if (["java", "kt", "kts", "scala", "groovy", "gradle"].includes(e)) return "◉";
  if (["c", "cpp", "cc", "cxx", "h", "hh", "hpp", "hxx"].includes(e)) return "◑";
  if (["cs", "vb"].includes(e)) return "◎";
  if (["rb"].includes(e)) return "◆";
  if (["php", "phtml"].includes(e)) return "◈";
  if (["swift"].includes(e)) return "◐";
  if (["sh", "bash", "zsh", "fish", "ksh", "ps1", "psm1", "bat", "cmd"].includes(e)) return "▸";
  if (["md", "mdx", "markdown", "rst", "adoc", "asciidoc", "tex"].includes(e)) return "≡";
  if (["html", "htm", "vue", "svelte", "astro", "ejs", "pug", "hbs", "handlebars", "twig", "njk"].includes(e)) return "◫";
  if (["css", "scss", "sass", "less", "styl"].includes(e)) return "◌";
  if (["json", "json5", "jsonc"].includes(e)) return "⊞";
  if (["toml", "yaml", "yml", "xml", "ini", "conf", "cfg", "config", "env", "properties"].includes(e)) return "⊟";
  if (["sql", "psql"].includes(e)) return "⊠";
  if (["graphql", "gql"].includes(e)) return "⊕";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff"].includes(e)) return "▣";
  if (["svg"].includes(e)) return "◈";
  if (["pdf"].includes(e)) return "▤";
  if (["doc", "docx", "odt"].includes(e)) return "▦";
  if (["xls", "xlsx", "csv", "tsv"].includes(e)) return "▧";
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar"].includes(e)) return "▩";
  if (["mp3", "wav", "flac", "ogg", "m4a"].includes(e)) return "♪";
  if (["mp4", "mkv", "mov", "avi", "webm"].includes(e)) return "▶";
  if (["lock"].includes(e)) return "⚿";
  if (["log", "diff", "patch"].includes(e)) return "≣";
  if (["txt", "rtf"].includes(e)) return "≡";
  return "·";
}

export function colorForExtension(ext?: string | null): string {
  const e = (ext ?? "").toLowerCase().replace(/^\./, "");
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(e)) return "#7dd3fc";
  if (["py", "pyw", "pyi"].includes(e)) return "#fde047";
  if (["rs"].includes(e)) return "#fca5a5";
  if (["go"].includes(e)) return "#7ee8ba";
  if (["java", "kt", "kts", "scala", "groovy", "gradle"].includes(e)) return "#fdba74";
  if (["c", "cpp", "cc", "cxx", "h", "hh", "hpp", "hxx"].includes(e)) return "#93c5fd";
  if (["cs", "vb"].includes(e)) return "#c4b5fd";
  if (["rb"].includes(e)) return "#fca5a5";
  if (["php", "phtml"].includes(e)) return "#a5b4fc";
  if (["swift"].includes(e)) return "#fb923c";
  if (["sh", "bash", "zsh", "fish", "ksh", "ps1", "psm1", "bat", "cmd"].includes(e)) return "#86efac";
  if (["md", "mdx", "markdown", "rst", "adoc", "tex"].includes(e)) return "#c4b5fd";
  if (["html", "htm", "vue", "svelte", "astro"].includes(e)) return "#f472b6";
  if (["css", "scss", "sass", "less", "styl"].includes(e)) return "#fdba74";
  if (["json", "json5", "jsonc", "yaml", "yml", "toml", "xml", "ini", "conf", "env"].includes(e)) return "#86efac";
  if (["sql", "psql", "csv", "tsv"].includes(e)) return "#fca5a5";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(e)) return "#38bdf8";
  if (["pdf", "doc", "docx", "odt"].includes(e)) return "#fb923c";
  if (["zip", "tar", "gz", "7z", "rar"].includes(e)) return "#fbbf24";
  if (["mp3", "wav", "flac", "ogg"].includes(e)) return "#a78bfa";
  if (["mp4", "mkv", "mov", "webm"].includes(e)) return "#f472b6";
  return "#a8bbc8";
}

export function glyphForPath(path: string, isDir: boolean, isCluster?: boolean): string {
  if (isCluster) return "◉";
  if (isDir) return "▢";
  const ext = path.split(".").pop();
  return glyphForExtension(ext);
}

export function colorForPath(path: string, isDir: boolean, isCluster?: boolean): string {
  if (isCluster) return "#f59e0b";
  if (isDir) return "#73c991";
  const ext = path.split(".").pop();
  return colorForExtension(ext);
}

// Maps the "theme:<token>" sentinel (stored in TOML fg fields) to CSS vars so
// folder/file colors can follow the active Omarchy/flavor palette at runtime.
const THEME_TOKEN_CSS: Record<string, string> = {
  accent:  "--omarchy-accent",
  cursor:  "--omarchy-cursor",
  fg:      "--omarchy-fg",
  color0:  "--omarchy-color0",
  color1:  "--omarchy-color1",
  color2:  "--omarchy-color2",
  color3:  "--omarchy-color3",
  color4:  "--omarchy-color4",
  color5:  "--omarchy-color5",
  color6:  "--omarchy-color6",
  color7:  "--omarchy-color7",
  color8:  "--omarchy-color8",
  color9:  "--omarchy-color9",
  color10: "--omarchy-color10",
  color11: "--omarchy-color11",
  color12: "--omarchy-color12",
  color13: "--omarchy-color13",
  color14: "--omarchy-color14",
  color15: "--omarchy-color15",
};

export const THEME_TOKENS = Object.entries(THEME_TOKEN_CSS).map(([token, cssVar]) => ({
  token,
  cssVar,
  sentinel: `theme:${token}`,
}));

export function resolveIconFg(fg: string): string {
  if (!fg.startsWith("theme:")) return fg;
  const cssVar = THEME_TOKEN_CSS[fg.slice(6)];
  if (!cssVar) return fg;
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fg;
}

export function iconRuleForPath(
  path: string,
  isDir: boolean,
  isCluster: boolean | undefined,
  theme?: IconThemePayload | null,
): IconRule {
  if (!theme) {
    return {
      text: glyphForPath(path, isDir, isCluster),
      fg: colorForPath(path, isDir, isCluster),
    };
  }

  const normalize = (rule: IconRule): IconRule => ({
    ...rule,
    text: rule.text || glyphForPath(path, isDir, isCluster),
    fg: resolveIconFg(rule.fg || colorForPath(path, isDir, isCluster)),
  });

  if (isCluster) return normalize(theme.defaultCluster);

  for (const glob of theme.globs) {
    if (globMatches(glob.pattern, path)) return normalize(glob.rule);
  }

  const basename = path.split("/").filter(Boolean).pop() ?? path;
  if (isDir) return normalize(theme.byDirname[basename] ?? theme.defaultDir);

  const filenameRule = theme.byFilename[basename];
  if (filenameRule) return normalize(filenameRule);

  const extRule = findExtensionRule(theme.byExt, basename);
  return normalize(extRule ?? theme.defaultFile);
}

function findExtensionRule(byExt: Record<string, IconRule>, basename: string): IconRule | undefined {
  const lowered = basename.toLowerCase();
  const parts = lowered.split(".");
  if (parts.length < 2) return byExt[lowered];

  for (let index = 1; index < parts.length; index += 1) {
    const suffix = parts.slice(index).join(".");
    const rule = byExt[suffix];
    if (rule) return rule;
  }

  return byExt[lowered];
}

function globMatches(pattern: string, path: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, "[^/]");
  try {
    return new RegExp(`^${escaped}$`).test(path);
  } catch {
    return false;
  }
}
