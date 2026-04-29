import React, { useMemo } from "react";
import { FileRecord } from "../types";
import { fileTypeLabel, formatBytes, getParentPath } from "../utils";

interface ExplorerListProps {
  currentPath: string;
  rootPath: string;
  items: FileRecord[];
  selectedPath?: string;
  onSelect: (record: FileRecord) => void;
  onNavigate: (path: string) => void;
}

export function ExplorerList({
  currentPath,
  rootPath,
  items,
  selectedPath,
  onSelect,
  onNavigate,
}: ExplorerListProps) {
  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);
  const canGoUp = parentPath !== null && currentPath !== rootPath;

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  return (
    <div className="explorer-list-container">
      <div className="explorer-list-header">
        <span className="item-count">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="file-list">
        {canGoUp && (
          <button
            className="file-row parent-row"
            onClick={() => parentPath && onNavigate(parentPath)}
            title="Go to parent folder"
          >
            <span className="file-icon folder">↑</span>
            <span className="file-name">..</span>
            <span className="file-meta">parent</span>
          </button>
        )}
        {sortedItems.map((item) => (
          <button
            key={item.path}
            className={`file-row ${selectedPath === item.path ? "selected" : ""}`}
            onClick={() => onSelect(item)}
            onDoubleClick={() => item.isDir && onNavigate(item.path)}
            title={item.path}
          >
            <span className={`file-icon ${item.isDir ? "folder" : getFileIconClass(item.extension)}`}>
              {item.isDir ? "D" : fileTypeLabel(item)}
            </span>
            <span className="file-name">{item.name}</span>
            <span className="file-meta">
              {item.isDir ? "folder" : formatBytes(item.sizeBytes)}
            </span>
          </button>
        ))}
        {items.length === 0 && !canGoUp && (
          <div className="empty-state small">This folder is empty</div>
        )}
      </div>
    </div>
  );
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
