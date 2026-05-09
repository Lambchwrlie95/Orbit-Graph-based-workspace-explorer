import React, { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? commands.filter((command) => {
          const haystack = `${command.label} ${command.hint ?? ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : commands;
    return visible;
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  if (!open) return null;

  const runCommand = (command: PaletteCommand) => {
    if (command.disabled) return;
    command.run();
    onClose();
  };

  return (
    <div className="modal-backdrop command-palette-backdrop" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-input-row">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && filtered[activeIndex]) {
                event.preventDefault();
                runCommand(filtered[activeIndex]);
              }
            }}
            placeholder="Run command..."
          />
          <kbd>Ctrl P</kbd>
        </div>

        <div className="command-palette-list" role="listbox">
          {filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              className={`command-palette-item ${index === activeIndex ? "active" : ""}`}
              disabled={command.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runCommand(command)}
            >
              <Command size={14} />
              <span className="command-palette-label">{command.label}</span>
              {command.hint && <span className="command-palette-hint">{command.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="command-palette-empty">No commands</div>}
        </div>
      </div>
    </div>
  );
}
