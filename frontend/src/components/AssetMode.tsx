import React, { useState, useEffect, useMemo } from 'react';
import { FileRecord } from '../types';
import { useThumbnails } from '../hooks/useThumbnails';
import { ImageIcon, Loader2 } from 'lucide-react';

interface AssetModeProps {
  className?: string;
  files: FileRecord[];
  currentPath: string;
  onSelect?: (record: FileRecord) => void;
}

const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

export const AssetMode: React.FC<AssetModeProps> = ({ 
  className,
  files,
  currentPath,
  onSelect,
}) => {
  const { ensureThumbnail, isLoading, thumbnails, loadingCount } = useThumbnails();
  const [selectedSize, setSelectedSize] = useState<number>(256);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  // Filter image files
  const imageFiles = useMemo(() => {
    return files.filter(f => {
      const ext = f.extension?.toLowerCase();
      return SUPPORTED_IMAGE_EXTENSIONS.includes(ext || '');
    });
  }, [files]);

  // Request thumbnails for visible images
  useEffect(() => {
    const visibleFiles = imageFiles.slice(visibleRange.start, visibleRange.end);
    visibleFiles.forEach(file => {
      ensureThumbnail(file.id, file.path, file.modifiedAt || 0, selectedSize);
    });
  }, [imageFiles, visibleRange, selectedSize, ensureThumbnail]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const itemHeight = selectedSize + 16; // thumbnail size + gap
    const columns = Math.floor(container.clientWidth / (selectedSize + 16)) || 1;
    const rowHeight = itemHeight;
    
    const startRow = Math.floor(scrollTop / rowHeight);
    const visibleRows = Math.ceil(containerHeight / rowHeight);
    const start = Math.max(0, startRow * columns - columns);
    const end = Math.min(imageFiles.length, (startRow + visibleRows + 2) * columns);
    
    setVisibleRange({ start, end });
  };

  return (
    <div className={`asset-mode ${className || ''}`}>
      <div className="asset-header">
        <div className="asset-title">
          <ImageIcon className="asset-title-icon" size={16} />
          <h2>Assets</h2>
          <span className="asset-count">
            ◈ {imageFiles.length} images
          </span>
          {loadingCount > 0 && (
            <span className="asset-loading">
              ⟳ {loadingCount} generating…
            </span>
          )}
        </div>
        
        <div className="asset-size-control">
          <span>Size</span>
          <div className="segmented-control">
            {[128, 256, 512].map(size => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={selectedSize === size ? 'active' : ''}
              >
                {size}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="asset-grid-scroll" onScroll={handleScroll}>
        {imageFiles.length === 0 ? (
          <div className="asset-empty">
            <ImageIcon size={48} />
            <p>◌ No images in current folder</p>
          </div>
        ) : (
          <div
            className="asset-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${selectedSize}px, 1fr))`,
            }}
          >
            {/* Top spacer: preserves scroll position so the user can keep
                paging down even though we only render the visible window.
                Spans the full grid row so the auto-fill columns ignore it. */}
            {visibleRange.start > 0 && (
              <div
                aria-hidden
                style={{
                  gridColumn: '1 / -1',
                  height: Math.ceil(visibleRange.start / Math.max(1, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) / (selectedSize + 16)))) * (selectedSize + 16),
                }}
              />
            )}
            {imageFiles.slice(visibleRange.start, visibleRange.end).map((file) => {
              // True virtualization: only the visible window allocates JSX.
              // Off-screen images aren't rendered at all (they were
              // previously rendered with opacity 0.5, costing ~2k React
              // nodes for a 2k-image folder).
              const thumbKey = `${file.id}_${selectedSize}`;
              const thumbUrl = thumbnails.get(thumbKey);
              const loading = isLoading(file.id, selectedSize);

              return (
                <button
                  key={file.id}
                  className="asset-tile"
                  title={file.path}
                  onClick={() => onSelect?.(file)}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      loading="lazy"
                    />
                  ) : loading ? (
                    <div className="asset-placeholder">
                      <Loader2 className="spin" size={22} />
                    </div>
                  ) : (
                    <div className="asset-placeholder">
                      <ImageIcon size={28} />
                    </div>
                  )}

                  <div className="asset-tile-caption">
                    <p>{file.name}</p>
                    {file.extension && (
                      <span>{file.extension}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {/* Bottom spacer mirrors the top one so the scrollbar reflects
                the full image count, not just the visible window. */}
            {visibleRange.end < imageFiles.length && (
              <div
                aria-hidden
                style={{
                  gridColumn: '1 / -1',
                  height: Math.ceil((imageFiles.length - visibleRange.end) / Math.max(1, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) / (selectedSize + 16)))) * (selectedSize + 16),
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="asset-status">
        <span>⬡ {currentPath || 'No workspace'}</span>
        <span>◈ {imageFiles.length} images</span>
      </div>
    </div>
  );
};

export default AssetMode;
