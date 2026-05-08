import React, { memo, useMemo } from "react";
import { FileRecord } from "../types";
import { formatBytes, shortPath } from "../utils";

interface SearchPanelProps {
  rootPath: string;
  query: string;
  results: FileRecord[];
  selectedPath?: string;
  isLoading?: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (record: FileRecord) => void;
  onOpen: (record: FileRecord) => void;
}

function SearchPanelComponent({
  rootPath,
  query,
  results,
  selectedPath,
  isLoading,
  onQueryChange,
  onSelect,
  onOpen,
}: SearchPanelProps) {
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [results]);

  return (
    <div className="search-panel">
      <div className="search-header">
        <div className="search-input-container">
          <input
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search files by name..."
            autoFocus
          />
          {query && (
            <button
              className="clear-search"
              onClick={() => onQueryChange("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <span className="search-status">
          {isLoading ? "⟳ Searching…" : `⊞ ${results.length} result${results.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="file-list">
        {sortedResults.map((item) => (
          <button
            key={item.path}
            className={`file-row search-result ${selectedPath === item.path ? "selected" : ""}`}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onOpen(item)}
            title={item.path}
          >
            <span className={`file-icon ${item.isDir ? "folder" : getFileIconClass(item.extension)}`}>
              {item.isDir ? "⊞" : fileGlyph(item.extension)}
            </span>
            <div className="search-result-info">
              <span className="file-name">{item.name}</span>
              <span className="file-path">{shortPath(item.parentPath || "")}</span>
            </div>
            <span className="file-meta">
              {item.isDir ? "folder" : formatBytes(item.sizeBytes)}
            </span>
          </button>
        ))}

        {!isLoading && results.length === 0 && query && (
          <div className="empty-state">
            <p>◌ No results for "{query}"</p>
            <p className="muted">Try a different search term</p>
          </div>
        )}

        {!query && (
          <div className="empty-state">
            <p>⌕ Enter a term to find files</p>
            <p className="muted">⬡ {shortPath(rootPath)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function fileGlyph(ext?: string | null): string {
  const e = (ext ?? "").toLowerCase();
  if (e === "ts" || e === "tsx") return "⬡";
  if (e === "js" || e === "jsx" || e === "mjs" || e === "cjs") return "◈";
  if (e === "rs") return "⬖";
  if (e === "py" || e === "pyi" || e === "pyw") return "◇";
  if (e === "go") return "⬡";
  if (e === "java" || e === "kt" || e === "scala") return "◉";
  if (e === "c" || e === "cpp" || e === "h" || e === "hpp") return "◑";
  if (e === "md" || e === "mdx") return "≡";
  if (e === "html" || e === "htm") return "◫";
  if (e === "css" || e === "scss" || e === "sass") return "◌";
  if (e === "json") return "⊞";
  if (e === "toml" || e === "yaml" || e === "yml" || e === "xml") return "⊟";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(e)) return "◈";
  return "·";
}

function getFileIconClass(extension?: string | null): string {
  if (!extension) return "";
  const ext = extension.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) {
    return "image";
  }
  if (["rs", "ts", "tsx", "js", "jsx"].includes(ext)) {
    return "code";
  }
  return "";
}

export const SearchPanel = memo(SearchPanelComponent);
