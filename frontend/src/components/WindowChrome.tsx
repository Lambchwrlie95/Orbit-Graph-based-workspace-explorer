import React, { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import { Minus, Maximize2, X } from "lucide-react";

function getTauriWindow(): Window | null {
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window)) return null;
  return getCurrentWindow();
}

/**
 * Frameless-window controls (minimize / maximize / close).
 * Used when `decorations: false` in Tauri so the in-app top bar acts as the title bar.
 */
export function WindowChrome() {
  const win = useMemo(() => getTauriWindow(), []);

  if (!win) return null;

  return (
    <div className="window-chrome" role="toolbar" aria-label="Window controls">
      <button
        type="button"
        className="window-chrome-btn"
        onClick={() => void win.minimize()}
        aria-label="Minimize"
        title="Minimize"
      >
        <Minus className="window-chrome-icon" size={12} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="window-chrome-btn"
        onClick={() => void win.toggleMaximize()}
        aria-label="Maximize"
        title="Maximize"
      >
        <Maximize2 className="window-chrome-icon" size={12} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="window-chrome-btn window-chrome-btn-close"
        onClick={() => void win.close()}
        aria-label="Close"
        title="Close"
      >
        <X className="window-chrome-icon" size={12} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
