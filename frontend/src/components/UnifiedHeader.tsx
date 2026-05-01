import React, { useEffect, useMemo, useRef, useState } from "react";
import { tauriInvoke } from "../lib/tauriCommands";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import {
  BookmarkPlus,
  ChevronRight,
  Copy,
  FolderOpen,
  Home,
  Maximize2,
  Minus,
  PanelLeft,
  PanelRight,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";

function getTauriWindow(): Window | null {
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window)) return null;
  return getCurrentWindow();
}

interface UnifiedHeaderProps {
  workspacePath?: string;
  currentPath?: string;
  selectedPath?: string | null;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenFolder: () => void;
  onScan: () => void;
  onRefreshGraph: () => void;
  onOpenSelected: () => void;
  onCopySelected: () => void;
  onAddBookmark: () => void;
  onShowExplorer: () => void;
  onShowSearch: () => void;
  onShowInspector: () => void;
  onShowCode: () => void;
  onNavigateToPath?: (path: string) => void;
}

export function UnifiedHeader({
  workspacePath,
  currentPath,
  selectedPath,
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
  onOpenFolder,
  onScan,
  onRefreshGraph,
  onOpenSelected,
  onCopySelected,
  onAddBookmark,
  onShowExplorer,
  onShowSearch,
  onShowInspector,
  onShowCode,
  onNavigateToPath,
}: UnifiedHeaderProps) {
  const win = useMemo(() => getTauriWindow(), []);
  const [openMenu, setOpenMenu] = useState<"file" | "view" | "run" | "panels" | null>(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(currentPath || workspacePath || "");
  const pathInputRef = useRef<HTMLInputElement>(null);
  const workspaceName = workspacePath ? workspacePath.split("/").pop() || workspacePath : "No workspace";
  const hasSelection = Boolean(selectedPath);
  const displayPath = currentPath || workspacePath || "";

  // Update path input when currentPath changes
  useEffect(() => {
    if (!isEditingPath) {
      setPathInput(displayPath);
    }
  }, [displayPath, isEditingPath]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingPath && pathInputRef.current) {
      pathInputRef.current.focus();
      pathInputRef.current.select();
    }
  }, [isEditingPath]);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim() && onNavigateToPath) {
      onNavigateToPath(pathInput.trim());
    }
    setIsEditingPath(false);
  };

  const handlePathKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setPathInput(displayPath);
      setIsEditingPath(false);
    }
  };

  const handleBreadcrumbClick = (path: string) => {
    console.log("[UnifiedHeader] Breadcrumb clicked:", path);
    if (onNavigateToPath && path) {
      onNavigateToPath(path);
    }
  };

  // Generate breadcrumb segments from path
  const breadcrumbs = useMemo(() => {
    if (!displayPath) return [];
    const parts = displayPath.split("/").filter(Boolean);
    const segments: { label: string; path: string }[] = [];
    let currentSegment = "";

    parts.forEach((part, index) => {
      currentSegment += `/${part}`;
      segments.push({
        label: part,
        path: currentSegment,
      });
    });

    return segments;
  }, [displayPath]);

  useEffect(() => {
    if (!openMenu) return undefined;

    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".menu-popover") || target?.closest(".menu-trigger")) return;
      setOpenMenu(null);
    };

    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  const runMenuAction = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  return (
    <header className="top-menu" data-tauri-drag-region>
      <div className="menu-left">
        <button
          type="button"
          id="toggleLeftBtn"
          className="sidebar-toggle"
          onClick={onToggleLeft}
          title={leftCollapsed ? "Show left sidebar" : "Hide left sidebar"}
          aria-pressed={!leftCollapsed}
        >
          <PanelLeft size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className={`menu-trigger ${openMenu === "file" ? "active" : ""}`}
          onClick={() => setOpenMenu((menu) => menu === "file" ? null : "file")}
        >
          File
        </button>
        <button
          type="button"
          className={`menu-trigger ${openMenu === "view" ? "active" : ""}`}
          onClick={() => setOpenMenu((menu) => menu === "view" ? null : "view")}
        >
          View
        </button>
        <button
          type="button"
          className={`menu-trigger ${openMenu === "run" ? "active" : ""}`}
          onClick={() => setOpenMenu((menu) => menu === "run" ? null : "run")}
        >
          Run
        </button>
        <button
          type="button"
          className={`menu-trigger ${openMenu === "panels" ? "active" : ""}`}
          onClick={() => setOpenMenu((menu) => menu === "panels" ? null : "panels")}
        >
          Panels
        </button>
      </div>

      <div className="menu-path-bar" data-tauri-drag-region>
        {isEditingPath ? (
          <form onSubmit={handlePathSubmit} className="path-edit-form">
            <input
              ref={pathInputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={handlePathKeyDown}
              onBlur={() => {
                setPathInput(displayPath);
                setIsEditingPath(false);
              }}
              className="path-input"
              placeholder="Enter path..."
            />
          </form>
        ) : (
          <div className="path-breadcrumbs">
            <button
              className="breadcrumb-home"
              onClick={() => workspacePath && handleBreadcrumbClick(workspacePath)}
              title={workspacePath || "No workspace"}
            >
              <Home size={12} />
            </button>
            {breadcrumbs.map((segment, index) => (
              <React.Fragment key={segment.path}>
                <ChevronRight size={12} className="breadcrumb-separator" />
                <button
                  className="breadcrumb-segment"
                  onClick={() => handleBreadcrumbClick(segment.path)}
                  title={segment.path}
                >
                  {segment.label}
                </button>
              </React.Fragment>
            ))}
            <button
              className="path-edit-btn"
              onClick={() => setIsEditingPath(true)}
              title="Edit path (Ctrl+L)"
            >
              <FolderOpen size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="menu-right">
        <button
          type="button"
          id="toggleRightBtn"
          onClick={onToggleRight}
          title={rightCollapsed ? "Show right sidebar" : "Hide right sidebar"}
          aria-pressed={!rightCollapsed}
        >
          <PanelRight size={14} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onScan} title="Scan workspace">
          <RefreshCcw size={13} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onCopySelected} title="Copy selected path" disabled={!hasSelection}>
          <Copy size={13} strokeWidth={1.8} />
        </button>

        {win && (
          <span className="window-controls">
            <button type="button" onClick={() => void win.minimize()} title="Minimize" aria-label="Minimize">
              <Minus size={12} strokeWidth={2} />
            </button>
            <button type="button" onClick={() => void win.toggleMaximize()} title="Maximize" aria-label="Maximize">
              <Maximize2 size={11} strokeWidth={2} />
            </button>
            <button type="button" className="window-close" onClick={() => void win.close()} title="Close" aria-label="Close">
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        )}
      </div>

      {openMenu && (
        <div className={`menu-popover menu-popover-${openMenu}`} role="menu">
          {openMenu === "file" && (
            <>
              <MenuItem label="Open Folder..." onClick={() => runMenuAction(onOpenFolder)} />
              <MenuItem label="Scan Workspace" onClick={() => runMenuAction(onScan)} />
              <MenuSeparator />
              <MenuItem label="Open Selected" onClick={() => runMenuAction(onOpenSelected)} disabled={!hasSelection} />
              <MenuItem label="Copy Selected Path" onClick={() => runMenuAction(onCopySelected)} disabled={!hasSelection} />
            </>
          )}

          {openMenu === "view" && (
            <>
              <MenuItem label={leftCollapsed ? "Show Left Sidebar" : "Hide Left Sidebar"} onClick={() => runMenuAction(onToggleLeft)} />
              <MenuItem label={rightCollapsed ? "Show Right Sidebar" : "Hide Right Sidebar"} onClick={() => runMenuAction(onToggleRight)} />
              <MenuSeparator />
              <MenuItem label="Explorer" onClick={() => runMenuAction(onShowExplorer)} />
              <MenuItem label="Search" onClick={() => runMenuAction(onShowSearch)} />
            </>
          )}

          {openMenu === "run" && (
            <>
              <MenuItem label="Scan Workspace" onClick={() => runMenuAction(onScan)} />
              <MenuItem label="Refresh Graph" onClick={() => runMenuAction(onRefreshGraph)} disabled={!workspacePath} />
            </>
          )}

          {openMenu === "panels" && (
            <>
              <MenuItem label="Inspector" onClick={() => runMenuAction(onShowInspector)} />
              <MenuItem label="Code" onClick={() => runMenuAction(onShowCode)} />
              <MenuSeparator />
              <MenuItem label="Bookmark Current Workspace" onClick={() => runMenuAction(onAddBookmark)} disabled={!workspacePath} />
            </>
          )}
        </div>
      )}
    </header>
  );
}

interface MenuItemProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ label, onClick, disabled }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}

export default UnifiedHeader;
