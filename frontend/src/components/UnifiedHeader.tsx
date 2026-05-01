import React, { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import {
  BookmarkPlus,
  Copy,
  FolderOpen,
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
  onShowAssets: () => void;
  onShowStatus: () => void;
  onShowInspector: () => void;
  onShowCode: () => void;
}

export function UnifiedHeader({
  workspacePath,
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
  onShowAssets,
  onShowStatus,
  onShowInspector,
  onShowCode,
}: UnifiedHeaderProps) {
  const win = useMemo(() => getTauriWindow(), []);
  const [openMenu, setOpenMenu] = useState<"file" | "view" | "run" | "panels" | null>(null);
  const workspaceName = workspacePath ? workspacePath.split("/").pop() || workspacePath : "No workspace";
  const hasSelection = Boolean(selectedPath);

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

      <div className="menu-title" data-tauri-drag-region title={workspacePath}>
        Orbit / {workspaceName}
      </div>

      <div className="menu-right">
        <button
          type="button"
          id="toggleLeftBtn"
          onClick={onToggleLeft}
          title={leftCollapsed ? "Show left sidebar" : "Hide left sidebar"}
          aria-pressed={!leftCollapsed}
        >
          <PanelLeft size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          id="toggleRightBtn"
          onClick={onToggleRight}
          title={rightCollapsed ? "Show right sidebar" : "Hide right sidebar"}
          aria-pressed={!rightCollapsed}
        >
          <PanelRight size={13} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onOpenFolder} title="Open folder">
          <FolderOpen size={13} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onScan} title="Scan workspace">
          <RefreshCcw size={13} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onShowSearch} title="Search side panel">
          <Search size={13} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onAddBookmark} title="Bookmark current workspace">
          <BookmarkPlus size={13} strokeWidth={1.8} />
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
              <MenuItem label="Assets" onClick={() => runMenuAction(onShowAssets)} />
              <MenuItem label="Status" onClick={() => runMenuAction(onShowStatus)} />
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
