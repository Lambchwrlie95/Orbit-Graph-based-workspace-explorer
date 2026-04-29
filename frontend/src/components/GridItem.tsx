import React from "react";
import { FileRecord } from "../types";
import { fileTypeLabel, formatBytes, isImageFile, getFileIconClass } from "../utils";

export type IconSize = 48 | 64 | 96 | 128;

export interface GridItemProps {
  /** The file record to display */
  record: FileRecord;
  /** Icon size in pixels */
  iconSize: IconSize;
  /** Whether the item is selected */
  isSelected: boolean;
  /** Callback when item is selected */
  onSelect: (record: FileRecord) => void;
  /** Callback when item is double-clicked */
  onDoubleClick?: (record: FileRecord) => void;
}

/**
 * GridItem - Individual grid cell component for file browsing
 * 
 * Renders a file or folder with:
 * - Icon/thumbnail based on file type
 * - File name (truncated with ellipsis)
 * - Selection state
 * - Hover effects
 * 
 * Supports 4 icon sizes: 48px, 64px, 96px, 128px
 */
export function GridItem({
  record,
  iconSize,
  isSelected,
  onSelect,
  onDoubleClick,
}: GridItemProps) {
  const isFolder = record.isDir;
  const isImage = !isFolder && isImageFile(record.extension);
  const fileIconClass = isFolder ? "folder" : getFileIconClass(record.extension);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(record);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick?.(record);
  };

  // Render the icon/thumbnail content
  const renderIcon = () => {
    // Image files show placeholder thumbnail (real thumbnails in Phase 7)
    if (isImage) {
      return (
        <div className="grid-thumbnail-placeholder">
          <span>🖼️</span>
          <span className="thumbnail-label">IMG</span>
        </div>
      );
    }

    // Folders and other files show icon
    return (
      <div className={`grid-icon ${fileIconClass} size-${iconSize}`}>
        {isFolder ? "D" : fileTypeLabel(record)}
      </div>
    );
  };

  // Format the label text
  const labelText = record.name;
  
  // Calculate tooltip content
  const tooltipContent = isFolder
    ? `${record.name}\nFolder`
    : `${record.name}\n${formatBytes(record.sizeBytes)}`;

  return (
    <button
      className={`grid-item size-${iconSize} ${isSelected ? "selected" : ""}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={tooltipContent}
      role="gridcell"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
    >
      <div className={`grid-icon-wrapper size-${iconSize}`}>
        {renderIcon()}
      </div>
      <span className="grid-label" aria-label={labelText}>
        {labelText}
      </span>
    </button>
  );
}

/**
 * GridParentItem - Special ".." item for navigating to parent folder
 */
export interface GridParentItemProps {
  /** Callback when clicked */
  onNavigate: () => void;
  /** Icon size in pixels */
  iconSize: IconSize;
}

export function GridParentItem({ onNavigate, iconSize }: GridParentItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate();
  };

  return (
    <button
      className={`grid-item parent-item size-${iconSize}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title="Go to parent folder"
      role="gridcell"
    >
      <div className={`grid-icon-wrapper size-${iconSize}`}>
        <div className={`grid-icon size-${iconSize}`}>↑</div>
      </div>
      <span className="grid-label">..</span>
    </button>
  );
}

export default GridItem;
