import React, { useState, useCallback, useEffect } from "react";

interface SplitterProps {
  /** Current size of the panel this splitter controls */
  size: number;
  /** Callback when size changes */
  onSizeChange: (size: number) => void;
  /** Callback when panel should be toggled (closed/opened) */
  onToggle?: () => void;
  /** Minimum size when open */
  minSize?: number;
  /** Maximum size */
  maxSize?: number;
  /** Side of the panel ('left' or 'right') */
  side: "left" | "right";
  /** Whether the panel is collapsed */
  collapsed?: boolean;
}

export function Splitter({
  size,
  onSizeChange,
  onToggle,
  minSize = 180,
  maxSize = 500,
  side,
  collapsed = false,
}: SplitterProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    if (collapsed) {
      // If collapsed, clicking the splitter opens the panel
      onToggle?.();
      return;
    }
    setIsDragging(true);
  }, [collapsed, onToggle]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rawSize =
        side === "left"
          ? e.clientX
          : window.innerWidth - e.clientX;
      
      // Allow dragging to 0 to close, but snap to minSize if between 0 and minSize
      if (rawSize < 30) {
        onSizeChange(0);
      } else if (rawSize < minSize) {
        onSizeChange(minSize);
      } else {
        onSizeChange(Math.min(maxSize, rawSize));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // If dragged to 0 or very small, trigger collapse
      if (size < 30) {
        onToggle?.();
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, side, minSize, maxSize, onSizeChange, onToggle, size]);

  return (
    <div
      className={`splitter ${isDragging ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
      onMouseDown={handleMouseDown}
      data-splitter-side={side}
    />
  );
}

export default Splitter;
