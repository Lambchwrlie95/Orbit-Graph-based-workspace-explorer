import React, { useRef, useState, useEffect, useCallback } from "react";
import { useVirtualScroll } from "../hooks/useVirtualScroll";

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Height of each item in pixels */
  itemHeight?: number;
  /** Number of items to render outside viewport */
  overscan?: number;
  /** Height of the container (defaults to 100%) */
  height?: number | string;
  /** Class name for container */
  className?: string;
  /** Callback when scroll nears end (for infinite scroll) */
  onEndReached?: () => void;
  /** Threshold from end to trigger onEndReached (in pixels) */
  endReachedThreshold?: number;
  /** Selected item index (for keyboard navigation) */
  selectedIndex?: number;
  /** Callback for selection change */
  onSelectIndex?: (index: number) => void;
}

/**
 * VirtualList - Renders only visible items for performance with large lists
 * 
 * Usage:
 * ```tsx
 * <VirtualList
 *   items={largeArray}
 *   renderItem={(item, index) => <div key={item.id}>{item.name}</div>}
 *   itemHeight={40}
 * />
 * ```
 */
export function VirtualList<T>({
  items,
  renderItem,
  itemHeight = 40,
  overscan = 5,
  height = "100%",
  className = "",
  onEndReached,
  endReachedThreshold = 200,
  selectedIndex,
  onSelectIndex,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Measure viewport height
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setViewportHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  const {
    virtualState: { totalHeight, startIndex, endIndex, offsetY, scrollTop },
    onScroll,
  } = useVirtualScroll({
    itemCount: items.length,
    itemHeight,
    viewportHeight,
    overscan,
  });

  // Handle end reached
  useEffect(() => {
    if (onEndReached && items.length > 0) {
      const scrollBottom = scrollTop + viewportHeight;
      const totalHeightNum = typeof totalHeight === "number" ? totalHeight : parseInt(totalHeight as string);
      if (totalHeightNum - scrollBottom < endReachedThreshold) {
        onEndReached();
      }
    }
  }, [scrollTop, viewportHeight, totalHeight, items.length, onEndReached, endReachedThreshold]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (selectedIndex === undefined || !onSelectIndex) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
          onSelectIndex(selectedIndex + 1);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (selectedIndex > 0) {
          onSelectIndex(selectedIndex - 1);
        }
        break;
      case "Home":
        e.preventDefault();
        onSelectIndex(0);
        break;
      case "End":
        e.preventDefault();
        onSelectIndex(items.length - 1);
        break;
    }
  }, [selectedIndex, onSelectIndex, items.length]);

  // Get visible items
  const visibleItems = items.slice(startIndex, endIndex + 1);

  return (
    <div
      ref={containerRef}
      className={`virtual-list-container ${className}`}
      style={{
        height,
        overflow: "auto",
        position: "relative",
      }}
      onScroll={onScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-activedescendant={selectedIndex !== undefined ? `virtual-item-${selectedIndex}` : undefined}
    >
      <div
        className="virtual-list-content"
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        <div
          className="virtual-list-items"
          style={{
            position: "absolute",
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            return (
              <div
                key={actualIndex}
                id={`virtual-item-${actualIndex}`}
                className={`virtual-list-item ${selectedIndex === actualIndex ? "selected" : ""}`}
                style={{
                  height: itemHeight,
                  boxSizing: "border-box",
                }}
                role="option"
                aria-selected={selectedIndex === actualIndex}
                onClick={() => onSelectIndex?.(actualIndex)}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VirtualList;
