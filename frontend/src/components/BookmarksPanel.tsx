import React from "react";
import { Bookmark, BookmarkMinus, BookmarkPlus } from "lucide-react";

interface BookmarksPanelProps {
  bookmarks: string[];
  currentRootPath: string;
  onAddCurrent: () => void;
  onRemoveCurrent: () => void;
  onOpenBookmark: (path: string) => void;
}

export function BookmarksPanel({
  bookmarks,
  currentRootPath,
  onAddCurrent,
  onRemoveCurrent,
  onOpenBookmark,
}: BookmarksPanelProps) {
  return (
    <section className="bookmarks-panel">
      <div className="bookmarks-header">
        <span className="bookmarks-title">
          <Bookmark size={12} strokeWidth={2} />
          Bookmarks
        </span>
        <div className="bookmarks-actions">
          <button
            type="button"
            onClick={onAddCurrent}
            title="Bookmark current workspace"
            aria-label="Bookmark current workspace"
          >
            <BookmarkPlus size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onRemoveCurrent}
            title="Remove current workspace bookmark"
            aria-label="Remove current workspace bookmark"
          >
            <BookmarkMinus size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="bookmarks-list" role="list" aria-label="Workspace bookmarks">
        {bookmarks.length === 0 ? (
          <div className="bookmarks-empty">◌ No bookmarks yet</div>
        ) : (
          bookmarks.map((path) => {
            const isActive = path === currentRootPath;
            const label = bookmarkLabel(path);
            return (
              <button
                key={path}
                type="button"
                className={`bookmark-item ${isActive ? "active" : ""}`}
                onClick={() => onOpenBookmark(path)}
                aria-label={`Open bookmark ${label}`}
              >
                <span className="bookmark-dot" aria-hidden>{isActive ? "◉" : "◎"}</span>
                <span className="bookmark-label">{label}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function bookmarkLabel(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export default BookmarksPanel;
