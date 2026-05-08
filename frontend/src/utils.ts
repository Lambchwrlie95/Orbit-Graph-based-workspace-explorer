import { FileRecord } from "./types";

export function fileTypeLabel(item: FileRecord): string {
  return (item.extension ?? "F").slice(0, 2).toUpperCase();
}

export function colorForExtension(extension?: string | null): string {
  if (!extension) return "#94a3b8";
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "ico"].includes(extension)) return "#38bdf8";
  if (["rs", "ts", "tsx", "js", "jsx"].includes(extension)) return "#a78bfa";
  if (["md", "txt", "doc", "docx"].includes(extension)) return "#f8fafc";
  if (["json", "toml", "yaml", "yml", "xml"].includes(extension)) return "#fbbf24";
  if (["css", "scss", "sass", "less", "html"].includes(extension)) return "#f472b6";
  return "#94a3b8";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function shortPath(path: string): string {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

export function getParentPath(path: string): string | null {
  if (!path) return null;
  const lastSep = path.lastIndexOf("/");
  if (lastSep <= 0) return null;
  return path.slice(0, lastSep) || "/";
}

export function formatDate(timestamp?: number | null): string {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

export function relativeDate(timestamp?: number | null): string {
  if (!timestamp) return "-";
  const now = Date.now();
  const then = timestamp * 1000;
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (weeks < 5) return `${weeks}w`;
  return formatDate(timestamp);
}

// Anything Monaco can syntax-highlight, plus common plain-text formats.
// Used by the Inspector to decide whether to render a text preview at all.
const TEXT_EXTENSIONS = new Set([
  // Programming languages
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "pyw", "pyi",
  "rs",
  "go",
  "java", "kt", "kts", "scala",
  "c", "cpp", "cc", "cxx", "h", "hh", "hpp", "hxx",
  "cs",
  "rb",
  "php", "phtml",
  "swift",
  "lua",
  "pl", "pm",
  "r",
  "jl",
  "dart",
  "ex", "exs",
  "erl", "hrl",
  "hs", "lhs",
  "clj", "cljs", "cljc", "edn",
  "fs", "fsx", "fsi",
  "ml", "mli",
  "nim",
  "zig",
  "v", "vh",
  "sv", "svh",
  "groovy", "gradle",
  "tcl",
  "vb", "vbs",
  // Shell / scripts
  "sh", "bash", "zsh", "fish", "ksh",
  "ps1", "psm1",
  "bat", "cmd",
  // Markup / docs
  "md", "mdx", "markdown",
  "rst", "adoc", "asciidoc",
  "tex",
  "html", "htm",
  "xml", "xsd", "xsl", "xslt",
  "svg",
  // Stylesheets
  "css", "scss", "sass", "less", "styl", "stylus",
  // Config / data
  "json", "json5", "jsonc",
  "yaml", "yml",
  "toml",
  "ini", "cfg", "conf", "config",
  "env",
  "properties",
  "csv", "tsv",
  // Build / infra
  "dockerfile",
  "makefile", "mk",
  "cmake",
  "lock",
  // Database / query
  "sql", "psql",
  "graphql", "gql",
  // Web / templating
  "vue", "svelte", "astro",
  "ejs", "pug", "hbs", "handlebars", "mustache", "twig", "njk",
  // Misc text
  "txt", "log",
  "diff", "patch",
  "gitignore", "gitattributes", "editorconfig",
  "rtf",
]);

export function isTextFile(extension?: string | null): boolean {
  if (!extension) return false;
  return TEXT_EXTENSIONS.has(extension.toLowerCase());
}

export function isImageFile(extension?: string | null): boolean {
  if (!extension) return false;
  return [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"
  ].includes(extension.toLowerCase());
}

export function getFileIconClass(extension?: string | null): string {
  if (!extension) return "file";
  if (isImageFile(extension)) return "image";
  if (["rs", "ts", "tsx", "js", "jsx"].includes(extension)) return "code";
  if (["md", "txt"].includes(extension)) return "text";
  if (["json", "toml", "yaml", "yml"].includes(extension)) return "config";
  return "file";
}
