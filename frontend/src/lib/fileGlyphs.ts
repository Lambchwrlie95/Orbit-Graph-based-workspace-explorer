/** Unicode glyph + semantic color per file extension. */
/** Shared by EditorTabs, the Icons view of the graph, and the Inspector. */

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
