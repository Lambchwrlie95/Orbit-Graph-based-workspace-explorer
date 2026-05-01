import React, { memo, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { FileRecord } from "../types";
import { getParentPath } from "../utils";
import { GridItem, GridParentItem, IconSize } from "./GridItem";
import { VirtualList } from "./VirtualList";

export interface ExplorerGridProps {
  /** Current directory path */
  currentPath: string;
  /** Root workspace path */
  rootPath: string;
  /** Files and folders to display */
  items: FileRecord[];
  /** Currently selected item path */
  selectedPath?: string;
  /** Callback when item is selected */
  onSelect: (record: FileRecord) => void;
  /** Callback when navigating to folder */
  onNavigate: (path: string) => void;
  /** Icon size (48, 64, 96, 128) - defaults to 64 */
  iconSize?: IconSize;
  /** Callback when icon size changes */
  onIconSizeChange?: (size: IconSize) => void;
  /** Sort criteria - defaults to name */
  sortBy?: "name" | "size" | "modified";
  /** Callback when sort changes */
  onSortByChange?: (sort: "name" | "size" | "modified") => void;
  /** Sort direction - defaults to asc */
  sortDirection?: "asc" | "desc";
  /** Callback when sort direction changes */
  onSortDirectionChange?: (dir: "asc" | "desc") => void;
}

const VIRTUAL_SCROLL_THRESHOLD = 50;
const GRID_GAP = 16;
const ICON_SIZE_TO_ITEM_HEIGHT: Record<IconSize, number> = {
  48: 90,  // 48px icon + label area + padding
  64: 110, // 64px icon + label area + padding
  96: 145, // 96px icon + label area + padding
  128: 185, // 128px icon + label area + padding
};

/**
 * ExplorerGrid - Grid view component for file browsing
 * 
 * Features:
 * - CSS Grid layout for small folders (<50 items)
 * - Virtual scrolling for large folders (≥50 items)
 * - Sort controls (name, size, modified)
 * - Icon size selector (48/64/96/128px)
 * - Keyboard navigation (arrow keys, Enter, Home, End)
 * - Parent folder navigation
 */
function ExplorerGridComponent({
  currentPath,
  rootPath,
  items,
  selectedPath,
  onSelect,
  onNavigate,
  iconSize = 64,
  onIconSizeChange,
  sortBy = "name",
  onSortByChange,
  sortDirection = "asc",
  onSortDirectionChange,
}: ExplorerGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Calculate parent path
  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);
  const canGoUp = parentPath !== null && currentPath !== rootPath;

  // Calculate items per row based on container width and icon size
  const itemsPerRow = useMemo(() => {
    const itemTotalWidth = iconSize + 32 + GRID_GAP; // icon + padding + gap
    return Math.max(1, Math.floor((containerWidth - 32) / itemTotalWidth)); // -32 for padding
  }, [containerWidth, iconSize]);

  // Sort items
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      // Always sort directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;

      // Then sort by selected criteria
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = (a.sizeBytes || 0) - (b.sizeBytes || 0);
          break;
        case "modified":
          const aTime = a.modifiedAt || 0;
          const bTime = b.modifiedAt || 0;
          comparison = aTime - bTime;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [items, sortBy, sortDirection]);

  // Find selected index
  const currentSelectedIndex = useMemo(() => {
    if (!selectedPath) return -1;
    return sortedItems.findIndex(item => item.path === selectedPath);
  }, [sortedItems, selectedPath]);

  // Measure container width
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Handle selection change
  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
    if (index >= 0 && index < sortedItems.length) {
      onSelect(sortedItems[index]);
    }
  }, [sortedItems, onSelect]);

  // Handle item selection
  const handleSelectItem = (record: FileRecord) => {
    onSelect(record);
  };

  // Handle item double-click (open/navigate)
  const handleDoubleClick = (record: FileRecord) => {
    if (record.isDir) {
      onNavigate(record.path);
    }
  };

  // Handle sort change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortByChange?.(e.target.value as "name" | "size" | "modified");
  };

  // Handle sort direction toggle
  const handleSortDirectionToggle = () => {
    onSortDirectionChange?.(sortDirection === "asc" ? "desc" : "asc");
  };

  // Handle icon size change
  const handleIconSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onIconSizeChange?.(parseInt(e.target.value, 10) as IconSize);
  };

  // Use virtual scrolling for large lists
  const useVirtualScroll = sortedItems.length > VIRTUAL_SCROLL_THRESHOLD;
  const rowHeight = ICON_SIZE_TO_ITEM_HEIGHT[iconSize];

  // Convert items to rows for virtual scrolling
  const rows = useMemo(() => {
    if (!useVirtualScroll) return [];
    const result: FileRecord[][] = [];
    for (let i = 0; i < sortedItems.length; i += itemsPerRow) {
      result.push(sortedItems.slice(i, i + itemsPerRow));
    }
    return result;
  }, [sortedItems, itemsPerRow, useVirtualScroll]);

  // Render a single grid row for virtual scrolling
  const renderRow = (row: FileRecord[], rowIndex: number) => (
    <div className="grid-virtual-row" style={{ height: rowHeight }}>
      {row.map((item) => (
        <GridItem
          key={item.path}
          record={item}
          iconSize={iconSize}
          isSelected={selectedPath === item.path}
          onSelect={handleSelectItem}
          onDoubleClick={handleDoubleClick}
        />
      ))}
    </div>
  );

  // Item count display
  const itemCountText = `${items.length} item${items.length !== 1 ? "s" : ""}`;
  const virtualIndicator = useVirtualScroll ? " (virtual)" : "";

  return (
    <div className="explorer-grid-container" ref={containerRef}>
      {/* Toolbar */}
      <div className="grid-toolbar">
        <span className="item-count">
          {itemCountText}
          {virtualIndicator && (
            <span className="virtual-scroll-indicator" title="Using virtual scrolling for performance">
              {virtualIndicator}
            </span>
          )}
        </span>
        
        <div className="grid-toolbar-controls">
          {/* Icon size selector */}
          <select
            value={iconSize}
            onChange={handleIconSizeChange}
            title="Icon size"
            aria-label="Icon size"
          >
            <option value={48}>48px</option>
            <option value={64}>64px</option>
            <option value={96}>96px</option>
            <option value={128}>128px</option>
          </select>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={handleSortChange}
            title="Sort by"
            aria-label="Sort by"
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="modified">Modified</option>
          </select>

          {/* Sort direction toggle */}
          <button
            className="sort-direction-btn"
            onClick={handleSortDirectionToggle}
            title={sortDirection === "asc" ? "Ascending" : "Descending"}
            aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
          >
            {sortDirection === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Parent navigation (shown as first item) */}
      {canGoUp && !useVirtualScroll && (
        <div className="grid-parent-navigation">
          <GridParentItem
            iconSize={iconSize}
            onNavigate={() => parentPath && onNavigate(parentPath)}
          />
        </div>
      )}

      {/* Grid content */}
      {useVirtualScroll ? (
        // Virtual scrolling for large lists
        <VirtualList
          items={rows}
          renderItem={(row, index) => renderRow(row, index)}
          itemHeight={rowHeight}
          overscan={3}
          selectedIndex={currentSelectedIndex >= 0 ? Math.floor(currentSelectedIndex / itemsPerRow) : selectedIndex}
          onSelectIndex={handleSelectIndex}
        />
      ) : (
        // CSS Grid for small lists
        <div 
          className="grid-container"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 32}px, 1fr))`,
          }}
        >
          {canGoUp && (
            <GridParentItem
              iconSize={iconSize}
              onNavigate={() => parentPath && onNavigate(parentPath)}
            />
          )}
          {sortedItems.map((item) => (
            <GridItem
              key={item.path}
              record={item}
              iconSize={iconSize}
              isSelected={selectedPath === item.path}
              onSelect={handleSelectItem}
              onDoubleClick={handleDoubleClick}
            />
          ))}
          {items.length === 0 && !canGoUp && (
            <div className="empty-state small" style={{ gridColumn: "1 / -1" }}>
              This folder is empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const ExplorerGrid = memo(ExplorerGridComponent);
export default ExplorerGrid;
