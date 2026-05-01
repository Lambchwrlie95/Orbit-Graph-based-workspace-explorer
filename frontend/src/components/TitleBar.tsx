import React, { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

function getTauriWindow(): Window | null {
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window)) return null;
  return getCurrentWindow();
}

interface TitleBarProps {
  /** Current workspace/folder name to display */
  workspaceName?: string;
  /** Optional additional content for the center area */
  children?: React.ReactNode;
}

/**
 * Custom title bar with app branding, workspace info, and window controls.
 * Replaces the native window decorations for a seamless custom look.
 */
export function TitleBar({ workspaceName, children }: TitleBarProps) {
  const win = useMemo(() => getTauriWindow(), []);

  if (!win) return null;

  return (
    <div className="titlebar" data-tauri-drag-region>
      {/* Left: App branding */}
      <div className="titlebar-brand">
        <div className="titlebar-logo">O</div>
        <span className="titlebar-app-name">Orbit</span>
        {workspaceName && (
          <>
            <span className="titlebar-separator">/</span>
            <span className="titlebar-workspace" title={workspaceName}>
              {workspaceName}
            </span>
          </>
        )}
      </div>

      {/* Center: Draggable area with optional content */}
      <div className="titlebar-center" data-tauri-drag-region>
        {children}
      </div>

      {/* Right: Window controls */}
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => void win.minimize()}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => void win.toggleMaximize()}
          aria-label="Maximize"
          title="Maximize"
        >
          <Square size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={() => void win.close()}
          aria-label="Close"
          title="Close"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
