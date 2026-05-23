import React, { useEffect, useState } from "react";
import { tauriInvoke } from "../lib/tauriCommands";
import type { FileRecord } from "../types";

export type ContextTarget =
  | { kind: "item"; item: FileRecord }
  | { kind: "folder"; folderPath: string };

interface FileContextMenuProps {
  /** Screen-space click coords, or null to hide. */
  position: { x: number; y: number } | null;
  target: ContextTarget | null;
  onClose: () => void;
  /** Called after any successful filesystem mutation so the parent can re-list. */
  onChanged: (newPath?: string) => void;
}

type Mode = "menu" | "rename" | "newFile" | "newFolder";

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  position,
  target,
  onClose,
  onChanged,
}) => {
  const [mode, setMode] = useState<Mode>("menu");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the menu opens with new context.
  useEffect(() => {
    if (position && target) {
      setMode("menu");
      setError(null);
      if (target.kind === "item") setInput(target.item.name);
      else setInput("");
    }
  }, [position, target]);

  // Dismiss on outside click + Escape.
  useEffect(() => {
    if (!position) return;
    const handleClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(".file-context-menu")) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener("click", handleClick);
      document.addEventListener("contextmenu", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("contextmenu", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [position, onClose]);

  if (!position || !target) return null;

  const submitRename = async () => {
    if (target.kind !== "item") return;
    if (!input.trim() || input === target.item.name) {
      onClose();
      return;
    }
    try {
      const newPath = await tauriInvoke("rename", {
        path: target.item.path,
        newName: input.trim(),
      });
      onChanged(newPath);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const submitCreate = async (kind: "newFile" | "newFolder") => {
    const parent =
      target.kind === "folder"
        ? target.folderPath
        : target.item.isDir
          ? target.item.path
          : target.item.path.replace(/\/[^/]+$/, "");
    if (!input.trim()) {
      setError("Name required");
      return;
    }
    try {
      const command = kind === "newFile" ? "create_file" : "create_folder";
      const newPath = await tauriInvoke(command, {
        parentDir: parent,
        name: input.trim(),
      });
      onChanged(newPath);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      /* no-op */
    }
    onClose();
  };

  // Clamp so the menu never spills off the right/bottom edges.
  const left = Math.min(position.x, window.innerWidth - 220);
  const top = Math.min(position.y, window.innerHeight - 280);

  return (
    <div
      className="file-context-menu"
      style={{ left, top }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {mode === "menu" && (
        <>
          {target.kind === "item" && (
            <>
              <button
                className="ctx-item"
                onClick={() => {
                  void tauriInvoke("open_path", { path: target.item.path });
                  onClose();
                }}
              >
                Open
              </button>
              {!target.item.isDir && (
                <button
                  className="ctx-item"
                  onClick={async () => {
                    try {
                      await tauriInvoke("open_in_terminal_editor", {
                        path: target.item.path,
                      });
                    } catch (e) {
                      setError(String(e));
                      return;
                    }
                    onClose();
                  }}
                >
                  Open in $EDITOR
                </button>
              )}
              <button className="ctx-item" onClick={() => copyPath(target.item.path)}>
                Copy path
              </button>
              <div className="ctx-sep" />
              <button
                className="ctx-item"
                onClick={() => {
                  setMode("rename");
                  setError(null);
                }}
              >
                Rename…
              </button>
            </>
          )}
          <button
            className="ctx-item"
            onClick={() => {
              setMode("newFile");
              setInput("");
              setError(null);
            }}
          >
            New File…
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              setMode("newFolder");
              setInput("");
              setError(null);
            }}
          >
            New Folder…
          </button>
          {target.kind === "folder" && (
            <>
              <div className="ctx-sep" />
              <button className="ctx-item" onClick={() => copyPath(target.folderPath)}>
                Copy folder path
              </button>
            </>
          )}
        </>
      )}

      {(mode === "rename" || mode === "newFile" || mode === "newFolder") && (
        <div className="ctx-input-group">
          <label className="ctx-input-label">
            {mode === "rename"
              ? "Rename to"
              : mode === "newFile"
                ? "New file name"
                : "New folder name"}
          </label>
          <input
            autoFocus
            type="text"
            className="ctx-input"
            value={input}
            placeholder={mode === "newFile" ? "untitled.txt" : ""}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (mode === "rename") void submitRename();
                else void submitCreate(mode);
              }
            }}
          />
          {error && <div className="ctx-error">{error}</div>}
          <div className="ctx-input-actions">
            <button className="ctx-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="ctx-btn-primary"
              onClick={() => {
                if (mode === "rename") void submitRename();
                else void submitCreate(mode);
              }}
            >
              {mode === "rename" ? "Rename" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
