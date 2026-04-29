import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileRecord } from "../types";
import { getParentPath } from "../utils";
import { Column } from "./Column";

export interface ExplorerColumnsProps {
  /** Root workspace path */
  rootPath: string;
  /** Current directory path */
  currentPath: string;
  /** Currently selected file path */
  selectedPath?: string;
  /** Called when file is selected */
  onSelect: (record: FileRecord) => void;
  /** Called when navigating to a folder */
  onNavigate: (path: string) => void;
}

interface ColumnState {
  /** Full path of the folder */
  path: string;
  /** Display name of the folder */
  name: string;
  /** Files and folders in this column */
  items: FileRecord[];
  /** Column width in pixels */
  width: number;
  /** Currently selected path in this column */
  selectedPath?: string;
}

const DEFAULT_COLUMN_WIDTH = 250;

/**
 * ExplorerColumns - Miller columns (Finder-style) file browser
 * 
 * Features:
 * - Horizontal layout of columns showing folder hierarchy
 * - Selection cascade: selecting folder in column N shows contents in column N+1
 * - Arrow key navigation (← → between columns, ↑ ↓ within column)
 * - Column width persistence during session
 * - Horizontal scrolling for deep hierarchies
 * - Smooth scroll to new columns
 * - Virtual scrolling for large folders
 */
export function ExplorerColumns({
  rootPath,
  currentPath,
  selectedPath,
  onSelect,
  onNavigate,
}: ExplorerColumnsProps) {
  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Build the columns array from a full path
   * Creates columns for each folder in the path hierarchy
   */
  const buildColumnsFromPath = useCallback(async (fullPath: string) => {
    if (!rootPath) return;
    
    setIsLoading(true);
    try {
      const newColumns: ColumnState[] = [];
      
      // Add root column
      const rootItems = await invoke<FileRecord[]>("list_children", { parentPath: rootPath });
      const rootName = rootPath.split("/").pop() || "Root";
      newColumns.push({
        path: rootPath,
        name: rootName,
        items: rootItems,
        width: DEFAULT_COLUMN_WIDTH,
      });

      // If fullPath is the root, we're done
      if (fullPath === rootPath) {
        setColumns(newColumns);
        setActiveColumnIndex(0);
        return;
      }

      // Add intermediate columns based on relative path
      if (fullPath.startsWith(rootPath)) {
        const relativePath = fullPath.slice(rootPath.length).replace(/^\//, "");
        const segments = relativePath.split("/").filter(Boolean);
        
        let currentPath = rootPath;
        for (const segment of segments) {
          currentPath = currentPath === "/" ? `/${segment}` : `${currentPath}/${segment}`;
          try {
            const items = await invoke<FileRecord[]>("list_children", { parentPath: currentPath });
            newColumns.push({
              path: currentPath,
              name: segment,
              items,
              width: DEFAULT_COLUMN_WIDTH,
            });
          } catch (err) {
            console.error(`Failed to load column for ${currentPath}:`, err);
            break;
          }
        }
      }

      setColumns(newColumns);
      setActiveColumnIndex(newColumns.length - 1);
    } catch (err) {
      console.error("Failed to build columns:", err);
    } finally {
      setIsLoading(false);
    }
  }, [rootPath]);

  // Rebuild columns when currentPath or rootPath changes
  useEffect(() => {
    if (currentPath && rootPath) {
      buildColumnsFromPath(currentPath);
    }
  }, [currentPath, rootPath, buildColumnsFromPath]);

  // Update selected path in columns when it changes externally
  useEffect(() => {
    if (!selectedPath) return;
    
    setColumns(prev => {
      // Find which column should have this selection
      const parentPath = getParentPath(selectedPath);
      if (!parentPath) return prev;
      
      return prev.map(col => {
        // This column's path is the parent of the selected item
        if (col.path === parentPath) {
          return { ...col, selectedPath };
        }
        return col;
      });
    });
  }, [selectedPath]);

  /**
   * Scroll to make a column visible
   */
  const scrollToColumn = useCallback((columnIndex: number) => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const columnElements = container.querySelectorAll(".column");
    
    if (columnElements[columnIndex]) {
      const column = columnElements[columnIndex] as HTMLElement;
      const containerRect = container.getBoundingClientRect();
      const columnRect = column.getBoundingClientRect();
      
      // Column is to the right of visible area
      if (columnRect.right > containerRect.right) {
        container.scrollTo({
          left: container.scrollLeft + (columnRect.right - containerRect.right) + 20,
          behavior: "smooth",
        });
      }
      // Column is to the left of visible area
      else if (columnRect.left < containerRect.left) {
        container.scrollTo({
          left: container.scrollLeft - (containerRect.left - columnRect.left) - 20,
          behavior: "smooth",
        });
      }
    }
  }, []);

  /**
   * Handle selection in a column
   * This is the core cascade logic for Miller columns
   */
  const handleColumnSelect = useCallback(async (columnIndex: number, record: FileRecord) => {
    // Update selected path in the column
    setColumns(prev => prev.map((col, idx) => 
      idx === columnIndex ? { ...col, selectedPath: record.path } : col
    ));

    if (record.isDir) {
      // Loading folder contents for cascade
      setIsLoading(true);
      try {
        const items = await invoke<FileRecord[]>("list_children", { parentPath: record.path });
        
        setColumns(prev => {
          // Remove columns after this one
          const newCols = prev.slice(0, columnIndex + 1);
          
          // Add new column with folder contents
          newCols.push({
            path: record.path,
            name: record.name,
            items,
            width: DEFAULT_COLUMN_WIDTH,
          });
          
          return newCols;
        });
        
        // Set active column to the new one
        const newIndex = columnIndex + 1;
        setActiveColumnIndex(newIndex);
        
        // Navigate to the folder
        onNavigate(record.path);
        
        // Scroll to show the new column
        setTimeout(() => scrollToColumn(newIndex), 50);
      } catch (err) {
        console.error("Failed to load folder contents:", err);
      } finally {
        setIsLoading(false);
      }
    } else {
      // File selected - call onSelect
      onSelect(record);
      
      // Remove trailing columns beyond the selected one
      setColumns(prev => prev.slice(0, columnIndex + 1));
    }
  }, [onSelect, onNavigate, scrollToColumn]);

  /**
   * Handle column width change
   */
  const handleColumnWidthChange = useCallback((columnIndex: number, newWidth: number) => {
    setColumns(prev => prev.map((col, idx) => 
      idx === columnIndex ? { ...col, width: newWidth } : col
    ));
  }, []);

  /**
   * Handle column focus
   */
  const handleColumnFocus = useCallback((columnIndex: number) => {
    setActiveColumnIndex(columnIndex);
  }, []);

  /**
   * Handle navigate up from a column
   */
  const handleNavigateUp = useCallback((columnIndex: number) => {
    if (columnIndex === 0) return; // Can't go up from root
    
    const parentCol = columns[columnIndex - 1];
    if (parentCol) {
      onNavigate(parentCol.path);
      setActiveColumnIndex(columnIndex - 1);
    }
  }, [columns, onNavigate]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        if (activeColumnIndex > 0) {
          const newIndex = activeColumnIndex - 1;
          setActiveColumnIndex(newIndex);
          scrollToColumn(newIndex);
        }
        break;
      
      case "ArrowRight":
        e.preventDefault();
        if (activeColumnIndex < columns.length - 1) {
          const newIndex = activeColumnIndex + 1;
          setActiveColumnIndex(newIndex);
          scrollToColumn(newIndex);
        }
        break;
      
      case "Home":
        e.preventDefault();
        if (activeColumnIndex > 0) {
          setActiveColumnIndex(0);
          scrollToColumn(0);
        }
        break;
      
      case "End":
        e.preventDefault();
        if (columns.length > 0) {
          const lastIndex = columns.length - 1;
          setActiveColumnIndex(lastIndex);
          scrollToColumn(lastIndex);
        }
        break;
    }
  }, [activeColumnIndex, columns.length, scrollToColumn]);

  // Check if we can show parent navigation for each column
  const canShowParent = useCallback((columnIndex: number) => {
    return columnIndex > 0;
  }, []);

  return (
    <div 
      className="explorer-columns-container"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Columns Scroll Container */}
      <div 
        ref={scrollContainerRef}
        className="columns-scroll-container"
      >
        {columns.map((col, index) => (
          <Column
            key={col.path}
            folderPath={col.path}
            folderName={col.name}
            items={col.items}
            selectedPath={col.selectedPath}
            isActive={index === activeColumnIndex}
            onSelect={(record) => handleColumnSelect(index, record)}
            onFocus={() => handleColumnFocus(index)}
            width={col.width}
            onWidthChange={(width) => handleColumnWidthChange(index, width)}
            showParent={canShowParent(index)}
            onNavigateUp={() => handleNavigateUp(index)}
            isLoading={isLoading && index === activeColumnIndex}
          />
        ))}
        
        {/* Empty state when no columns */}
        {columns.length === 0 && !isLoading && (
          <div className="empty-state">
            <p>Select a workspace to browse</p>
          </div>
        )}
        
        {/* Loading state */}
        {isLoading && columns.length === 0 && (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExplorerColumns;
