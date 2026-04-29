import { useState, useMemo, useCallback, useRef, useEffect } from "react";

export interface VirtualScrollState {
  /** Total height of the scrollable content */
  totalHeight: number;
  /** Index of first visible item */
  startIndex: number;
  /** Index of last visible item */
  endIndex: number;
  /** Offset to transform visible items */
  offsetY: number;
  /** Current scroll top position */
  scrollTop: number;
}

export interface UseVirtualScrollOptions {
  /** Total number of items */
  itemCount: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the viewport/container */
  viewportHeight: number;
  /** Number of items to render outside viewport (overscan) */
  overscan?: number;
}

export interface UseVirtualScrollReturn {
  /** State for rendering */
  virtualState: VirtualScrollState;
  /** Handler to attach to scroll container */
  onScroll: (event: React.UIEvent<HTMLElement>) => void;
  /** Scroll to specific item index */
  scrollToIndex: (index: number) => void;
  /** Ref to attach to scroll container */
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Hook for virtual scrolling of large lists
 * Renders only visible items + overscan for performance
 */
export function useVirtualScroll({
  itemCount,
  itemHeight,
  viewportHeight,
  overscan = 5,
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const containerRef = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const virtualState = useMemo<VirtualScrollState>(() => {
    const totalHeight = itemCount * itemHeight;
    
    // Calculate visible indices
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    const endIndex = Math.min(itemCount - 1, startIndex + visibleCount + overscan * 2);
    
    // Calculate offset for visible items
    const offsetY = startIndex * itemHeight;

    return {
      totalHeight,
      startIndex,
      endIndex,
      offsetY,
      scrollTop,
    };
  }, [scrollTop, itemCount, itemHeight, viewportHeight, overscan]);

  // Handle scroll events
  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  // Scroll to specific index
  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current && index >= 0 && index < itemCount) {
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, [itemCount, itemHeight]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Force recalculation on resize
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    virtualState,
    onScroll,
    scrollToIndex,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
  };
}

export default useVirtualScroll;
