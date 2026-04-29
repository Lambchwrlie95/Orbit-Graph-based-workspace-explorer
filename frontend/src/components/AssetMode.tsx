import React, { useState, useEffect, useMemo } from 'react';
import { FileRecord } from '../types';
import { useThumbnails } from '../hooks/useThumbnails';
import { ImageIcon, Loader2 } from 'lucide-react';

interface AssetModeProps {
  className?: string;
  files: FileRecord[];
  currentPath: string;
}

const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

export const AssetMode: React.FC<AssetModeProps> = ({ 
  className,
  files,
  currentPath,
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

  const columns = Math.max(1, Math.floor((typeof window !== 'undefined' ? window.innerWidth - 400 : 800) / (selectedSize + 16)));

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <ImageIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-medium text-gray-200">Asset Mode</h2>
          <span className="text-xs text-gray-500">
            {imageFiles.length} images
          </span>
          {loadingCount > 0 && (
            <span className="text-xs text-indigo-400">
              ({loadingCount} generating...)
            </span>
          )}
        </div>
        
        {/* Size selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Size:</span>
          <div className="flex bg-gray-700 rounded overflow-hidden">
            {[128, 256, 512].map(size => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  selectedSize === size
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                {size}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div 
        className="flex-1 overflow-auto p-4"
        onScroll={handleScroll}
      >
        {imageFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-sm">No images in current folder</p>
            <p className="text-xs mt-2">Images will appear here when available</p>
          </div>
        ) : (
          <div 
            className="grid gap-4"
            style={{ 
              gridTemplateColumns: `repeat(auto-fill, minmax(${selectedSize}px, 1fr))`,
            }}
          >
            {imageFiles.map((file, index) => {
              const thumbKey = `${file.id}_${selectedSize}`;
              const thumbUrl = thumbnails.get(thumbKey);
              const loading = isLoading(file.id, selectedSize);

              return (
                <div
                  key={file.id}
                  className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-indigo-500 transition-colors"
                  style={{ 
                    opacity: index >= visibleRange.start && index < visibleRange.end ? 1 : 0.5 
                  }}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : loading ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-750">
                      <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-750">
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  
                  {/* Overlay with filename */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs text-white font-medium truncate">{file.name}</p>
                    {file.extension && (
                      <p className="text-[10px] text-gray-300 uppercase">{file.extension}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-500 flex justify-between">
        <span>{currentPath || 'No workspace'}</span>
        <span>{imageFiles.length} images</span>
      </div>
    </div>
  );
};

export default AssetMode;
