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

export function isTextFile(extension?: string | null): boolean {
  if (!extension) return false;
  return [
    "txt", "md", "rs", "ts", "tsx", "js", "jsx", "json", 
    "toml", "yaml", "yml", "css", "scss", "sass", "less", 
    "html", "htm", "xml", "svg"
  ].includes(extension.toLowerCase());
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
