import React, { useState, useCallback, useRef } from 'react';
import { X, GripVertical } from 'lucide-react';

/**
 * Editor Tabs component
 * 
 * Displays a horizontal tab bar for open files with:
 * - File name display (basename)
 * - Modified indicator (●) for unsaved changes
 * - Close button on each tab
 * - Active tab highlighting
 * - Middle-click to close
 * - Drag-and-drop reordering support
 */

export interface EditorTabsProps {
  openFiles: string[];
  activeFile: string | null;
  modifiedFiles: Set<string>;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onTabReorder?: (files: string[]) => void;
}

/**
 * Extract the filename (basename) from a full path
 */
function getFileName(path: string): string {
  // Handle both forward slashes and backslashes
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/**
 * Extract file extension for icon/styling
 */
function getFileExtension(path: string): string {
  const fileName = getFileName(path);
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';
}

/** Unicode glyph representing the file's language/type */
function getFileGlyph(path: string): string {
  const ext = getFileExtension(path).toLowerCase();
  if (['.ts', '.tsx'].includes(ext)) return '⬡';
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return '◈';
  if (['.rs'].includes(ext)) return '⬖';
  if (['.py', '.pyi', '.pyw'].includes(ext)) return '◇';
  if (['.go'].includes(ext)) return '⬡';
  if (['.java', '.kt', '.scala'].includes(ext)) return '◉';
  if (['.c', '.cpp', '.cc', '.h', '.hpp'].includes(ext)) return '◑';
  if (['.cs'].includes(ext)) return '◎';
  if (['.rb'].includes(ext)) return '◆';
  if (['.php'].includes(ext)) return '◈';
  if (['.swift'].includes(ext)) return '◐';
  if (['.sh', '.bash', '.zsh'].includes(ext)) return '▸';
  if (['.md', '.mdx'].includes(ext)) return '≡';
  if (['.html', '.htm'].includes(ext)) return '◫';
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) return '◌';
  if (['.json'].includes(ext)) return '⊞';
  if (['.toml', '.yaml', '.yml', '.xml', '.ini', '.conf'].includes(ext)) return '⊟';
  if (['.sql'].includes(ext)) return '⊞';
  if (['.svg'].includes(ext)) return '◈';
  return '·';
}

/**
 * Get color coding for file type
 */
function getFileTypeColor(path: string): string {
  const ext = getFileExtension(path).toLowerCase();
  
  // Code files
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return '#7dd3fc'; // Blue
  }
  if (['.py', '.pyw', '.pyi'].includes(ext)) {
    return '#fde047'; // Yellow
  }
  if (['.rs'].includes(ext)) {
    return '#fca5a5'; // Rust orange
  }
  if (['.go'].includes(ext)) {
    return '#7ee8ba'; // Go cyan
  }
  if (['.java', '.kt', '.scala'].includes(ext)) {
    return '#fdba74'; // Orange
  }
  if (['.cpp', '.cc', '.c', '.h', '.hpp'].includes(ext)) {
    return '#93c5fd'; // Light blue
  }
  
  // Config files
  if (['.json', '.yaml', '.yml', '.toml', '.xml', '.ini'].includes(ext)) {
    return '#86efac'; // Green
  }
  
  // Markup
  if (['.md', '.mdx', '.html', '.htm'].includes(ext)) {
    return '#c4b5fd'; // Purple
  }
  
  // Styles
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    return '#fdba74'; // Orange
  }
  
  // Data
  if (['.sql', '.csv'].includes(ext)) {
    return '#fca5a5'; // Pink
  }
  
  return '#a8bbc8'; // Default gray
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  openFiles,
  activeFile,
  modifiedFiles,
  onTabClick,
  onTabClose,
  onTabReorder,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Handle tab click
  const handleClick = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    onTabClick(path);
  }, [onTabClick]);

  // Handle tab close (X button)
  const handleClose = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    onTabClose(path);
  }, [onTabClose]);

  // Handle middle-click to close
  const handleMouseDown = useCallback((e: React.MouseEvent, path: string) => {
    // Middle mouse button (button 1) closes the tab
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(path);
    }
  }, [onTabClose]);

  // Drag start
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    
    // Add a slight delay to show the drag effect
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.classList.add('dragging');
      }
    }, 0);
  }, []);

  // Drag end
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    
    if (e.target instanceof HTMLElement) {
      e.target.classList.remove('dragging');
    }
  }, []);

  // Drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  // Drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving the tab container entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverIndex(null);
    }
  }, []);

  // Drop
  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    
    if (draggedIndex !== null && !isNaN(dragIndex) && dragIndex !== dropIndex && onTabReorder) {
      const newFiles = [...openFiles];
      const [removed] = newFiles.splice(dragIndex, 1);
      newFiles.splice(dropIndex, 0, removed);
      onTabReorder(newFiles);
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, openFiles, onTabReorder]);

  // Empty state
  if (openFiles.length === 0) {
    return (
      <div className="editor-tabs-empty" style={{
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        background: '#0b0f12',
        borderBottom: '1px solid #1c2831',
        color: '#5a6b75',
        fontSize: '12px',
      }}>
        No files open
      </div>
    );
  }

  return (
    <div 
      ref={tabsRef}
      className="editor-tabs" 
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: '36px',
        background: '#0b0f12',
        borderBottom: '1px solid #1c2831',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {openFiles.map((filePath, index) => {
        const isActive = filePath === activeFile;
        const isModified = modifiedFiles.has(filePath);
        const fileName = getFileName(filePath);
        const fileColor = getFileTypeColor(filePath);
        const fileGlyph = getFileGlyph(filePath);
        const isDragOver = dragOverIndex === index;
        const isDragging = draggedIndex === index;
        
        return (
          <div
            key={filePath}
            className={`editor-tab ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
            onClick={(e) => handleClick(e, filePath)}
            onMouseDown={(e) => handleMouseDown(e, filePath)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            draggable={!!onTabReorder}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              minWidth: '120px',
              maxWidth: '200px',
              flexShrink: 0,
              cursor: 'pointer',
              userSelect: 'none',
              background: isActive 
                ? '#17232b' 
                : isDragOver 
                  ? '#1a3a3a' 
                  : 'transparent',
              borderRight: '1px solid #1c2831',
              borderBottom: isActive ? '2px solid #20b8a5' : 'none',
              opacity: isDragging ? 0.5 : 1,
              transition: 'background 0.15s ease, opacity 0.15s ease',
            }}
            title={filePath}
          >
            {/* Drag handle */}
            {onTabReorder && (
              <GripVertical
                size={12}
                style={{
                  opacity: 0.5,
                  cursor: 'grab',
                  flexShrink: 0,
                }}
              />
            )}

            {/* Language glyph — changes to ● when file is modified */}
            <span
              title={isModified ? 'Unsaved changes' : undefined}
              style={{
                fontSize: '11px',
                lineHeight: 1,
                flexShrink: 0,
                color: isModified ? '#fbbf24' : fileColor,
                transition: 'color 0.15s ease',
              }}
              aria-hidden
            >
              {isModified ? '●' : fileGlyph}
            </span>
            
            {/* File name */}
            <span 
              className="tab-filename"
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '13px',
                color: isActive ? '#e5edf4' : '#8ca1af',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {fileName}
            </span>
            
            {/* Close button */}
            <button
              className="tab-close"
              onClick={(e) => handleClose(e, filePath)}
              style={{
                width: '18px',
                height: '18px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: '3px',
                background: 'transparent',
                color: isActive ? '#8ca1af' : '#5a6b75',
                cursor: 'pointer',
                flexShrink: 0,
                opacity: 0,
                transition: 'opacity 0.15s ease, background 0.15s ease',
              }}
              title="Close (Middle-click to close without save prompt)"
              aria-label={`Close ${fileName}`}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      
      {/* CSS for hover effects */}
      <style>{`
        .editor-tab:hover .tab-close {
          opacity: 1 !important;
        }
        
        .editor-tab .tab-close:hover {
          background: #26343f !important;
          color: #e5edf4 !important;
        }
        
        .editor-tabs::-webkit-scrollbar {
          display: none;
        }
        
        .editor-tab.dragging {
          cursor: grabbing;
        }
        
        .editor-tab.drag-over {
          background: #1a3a3a !important;
        }
      `}</style>
    </div>
  );
};

export default EditorTabs;
