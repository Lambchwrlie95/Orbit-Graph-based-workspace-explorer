import React, { memo, useMemo, useState } from "react";
import { FileRecord } from "../types";
import { fileTypeLabel, formatBytes, relativeDate } from "../utils";
import { VirtualList } from "./VirtualList";

interface ExplorerListProps {
  currentPath: string;
  rootPath: string;
  items: FileRecord[];
  selectedPath?: string;
  onSelect: (record: FileRecord) => void;
  onNavigate: (path: string) => void;
}

const VIRTUAL_SCROLL_THRESHOLD = 50; // Use virtual scrolling for lists > 50 items
const ITEM_HEIGHT = 36; // Height of each file row in pixels

function ExplorerListComponent({
  items,
  selectedPath,
  onSelect,
  onNavigate,
}: ExplorerListProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  // Find selected index for keyboard navigation
  const currentSelectedIndex = useMemo(() => {
    if (!selectedPath) return -1;
    return sortedItems.findIndex(item => item.path === selectedPath);
  }, [sortedItems, selectedPath]);

  const handleSelectIndex = (index: number) => {
    setSelectedIndex(index);
    if (index >= 0 && index < sortedItems.length) {
      onSelect(sortedItems[index]);
    }
  };

  const renderFileRow = (item: FileRecord) => (
    <button
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
        {item.isDir
          ? (item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : "folder")
          : relativeDate(item.modifiedAt ?? item.createdAt)}
      </span>
    </button>
  );

  // Use virtual scrolling for large lists
  const useVirtualScroll = sortedItems.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="explorer-list-container">
      <div className="explorer-list-header">
        <span className="item-count">
          {items.length} item{items.length !== 1 ? "s" : ""}
          {useVirtualScroll && (
            <span className="virtual-scroll-indicator" title="Using virtual scrolling for performance">
              (virtual)
            </span>
          )}
        </span>
      </div>

      {/* File list - virtual or standard */}
      {useVirtualScroll ? (
        <VirtualList
          items={sortedItems}
          renderItem={renderFileRow}
          itemHeight={ITEM_HEIGHT}
          overscan={5}
          height="calc(100% - 40px)"
          selectedIndex={currentSelectedIndex >= 0 ? currentSelectedIndex : selectedIndex}
          onSelectIndex={handleSelectIndex}
        />
      ) : (
        <div className="file-list">
          {sortedItems.map((item) => (
            <React.Fragment key={item.path}>
              {renderFileRow(item)}
            </React.Fragment>
          ))}
          {items.length === 0 && (
            <div className="empty-state small">This folder is empty</div>
          )}
        </div>
      )}
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

export const ExplorerList = memo(ExplorerListComponent);
