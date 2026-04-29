import React, { useState, useRef, useCallback, useMemo } from "react";
import { FileRecord } from "../types";
import { fileTypeLabel, formatBytes, getParentPath } from "../utils";
import { VirtualList } from "./VirtualList";

export interface ColumnProps {
  /** Folder path this column displays */
  folderPath: string;
  /** Folder name for header */
  folderName: string;
  /** Files and folders in this column */
  items: FileRecord[];
  /** Currently selected path in this column */
  selectedPath?: string;
  /** Whether this column has keyboard focus */
  isActive: boolean;
  /** Called when item is selected */
  onSelect: (record: FileRecord) => void;
  /** Called when column receives focus */
  onFocus: () => void;
  /** Column width in pixels */
  width: number;
  /** Called when width changes (during resize) */
  onWidthChange?: (width: number) => void;
  /** Show ".." parent navigation */
  showParent?: boolean;
  /** Called when navigating to parent */
  onNavigateUp?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

const VIRTUAL_SCROLL_THRESHOLD = 50;
const ITEM_HEIGHT = 32;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/**
 * Column - Individual Miller column component
 * 
 * Features:
 * - Header with folder name and item count
 * - Scrollable file list with parent navigation
 * - Virtual scrolling for large folders
 * - Resizable width (200-400px range)
 * - Active state indication
 * - Keyboard navigation support
 */
export function Column({
  folderPath,
  folderName,
  items,
  selectedPath,
  isActive,
  onSelect,
  onFocus,
  width,
  onWidthChange,
  showParent = false,
  onNavigateUp,
  isLoading = false,
}: ColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Sort items: directories first, then alphabetically
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  // Find selected index for keyboard navigation
  const currentSelectedIndex = useMemo(() => {
    if (!selectedPath) return -1;
    return sortedItems.findIndex(item => item.path === selectedPath);
  }, [sortedItems, selectedPath]);

  // Handle selection by index (for keyboard nav)
  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
    if (index >= 0 && index < sortedItems.length) {
      onSelect(sortedItems[index]);
    }
  }, [sortedItems, onSelect]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaX));
      onWidthChange?.(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width, onWidthChange]);

  // Handle column focus
  const handleColumnClick = useCallback(() => {
    onFocus();
  }, [onFocus]);

  // Handle parent navigation
  const handleParentClick = useCallback(() => {
    onNavigateUp?.();
  }, [onNavigateUp]);

  // Handle item click
  const handleItemClick = useCallback((item: FileRecord) => {
    onSelect(item);
  }, [onSelect]);

  // Handle item double-click
  const handleItemDoubleClick = useCallback((item: FileRecord) => {
    // Double-click on folder triggers select (which cascades in parent)
    if (item.isDir) {
      onSelect(item);
    }
  }, [onSelect]);

  // Get file icon class
  const getFileIconClass = (extension?: string | null): string => {
    if (!extension) return "";
    const ext = extension.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) {
      return "image";
    }
    if (["rs", "ts", "tsx", "js", "jsx"].includes(ext)) {
      return "code";
    }
    return "";
  };

  // Render a single file item
  const renderFileItem = useCallback((item: FileRecord) => (
    <button
      className={`column-item ${selectedPath === item.path ? "selected" : ""}`}
      onClick={() => handleItemClick(item)}
      onDoubleClick={() => handleItemDoubleClick(item)}
      title={item.path}
      tabIndex={-1}
    >
      <span className={`column-icon ${item.isDir ? "folder" : getFileIconClass(item.extension)}`}>
        {item.isDir ? "D" : fileTypeLabel(item)}
      </span>
      <span className="column-name">{item.name}</span>
      <span className="column-meta">
        {item.isDir 
          ? (item as FileRecord & { childCount?: number }).childCount 
            ? `${(item as FileRecord & { childCount?: number }).childCount} items` 
            : "folder"
          : formatBytes(item.sizeBytes)
        }
      </span>
    </button>
  ), [selectedPath, handleItemClick, handleItemDoubleClick]);

  // Use virtual scrolling for large lists
  const useVirtualScroll = sortedItems.length > VIRTUAL_SCROLL_THRESHOLD;

  // Calculate list height (subtract header height)
  const listHeight = showParent 
    ? "calc(100% - 78px)" // header + parent row
    : "calc(100% - 46px)"; // header only

  return (
    <div
      ref={columnRef}
      className={`column ${isActive ? "active" : ""} ${isResizing ? "resizing" : ""}`}
      style={{ width: `${width}px` }}
      onClick={handleColumnClick}
    >
      {/* Column Header */}
      <div className="column-header">
        <span className="column-title" title={folderName}>
          {folderName}
        </span>
        <span className="column-count">
          {items.length} items
        </span>
      </div>

      {/* Column Content */}
      <div className="column-content">
        {/* Parent Navigation */}
        {showParent && (
          <button
            className="column-item parent-item"
            onClick={handleParentClick}
            title="Go to parent folder"
          >
            <span className="column-icon folder">↑</span>
            <span className="column-name">..</span>
            <span className="column-meta">parent</span>
          </button>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="column-loading">
            <span>Loading...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && items.length === 0 && (
          <div className="column-empty">
            <span>Empty folder</span>
          </div>
        )}

        {/* File List */}
        {!isLoading && items.length > 0 && (
          useVirtualScroll ? (
            <VirtualList
              items={sortedItems}
              renderItem={renderFileItem}
              itemHeight={ITEM_HEIGHT}
              overscan={5}
              height={listHeight}
              selectedIndex={currentSelectedIndex >= 0 ? currentSelectedIndex : selectedIndex}
              onSelectIndex={handleSelectIndex}
            />
          ) : (
            <div className="column-list">
              {sortedItems.map((item) => (
                <React.Fragment key={item.path}>
                  {renderFileItem(item)}
                </React.Fragment>
              ))}
            </div>
          )
        )}
      </div>

      {/* Resize Handle */}
      <div
        className="column-resize-handle"
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      />
    </div>
  );
}

export default Column;
