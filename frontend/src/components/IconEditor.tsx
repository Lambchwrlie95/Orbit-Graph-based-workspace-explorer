import React, { useEffect, useMemo, useState } from "react";
import { X, Save, Trash2, RefreshCw } from "lucide-react";
import { tauriInvoke } from "../lib/tauriCommands";
import { THEME_TOKENS, resolveIconFg } from "../lib/fileGlyphs";
import type { IconThemePayload } from "../types";

// Curated palette: Nerd Font Private-Use-Area glyphs plus Unicode shapes that
// render fine without a Nerd Font installed. Click one to pick it for the
// active row.
const GLYPH_PALETTE: string[] = [
  // Files & folders
  "", "", "", "", "", "", "", "", "", "", "", "", "",
  // Tooling
  "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  // Languages
  "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  // Web
  "", "", "", "", "", "", "", "", "", "", "", "",
  // Data
  "", "", "", "", "", "",
  // Media
  "", "", "", "", "", "",
  // Misc
  "", "", "", "", "", "", "", "", "",
  // Unicode shapes (font-agnostic fallback)
  "◉", "○", "●", "◎", "◐", "◑", "◒", "◓",
  "■", "□", "▣", "▢", "▤", "▥", "▦", "▧",
  "▲", "△", "▼", "▽", "◆", "◇", "★", "☆",
  "⬡", "⬢", "⬣", "⬖", "⬗", "⬘", "⬙", "⊞",
  "✱", "✦", "✧", "✪", "✫", "✬", "✭", "✰",
];

const COLOR_PALETTE: string[] = [
  "#cbd5e1", "#94a3b8", "#64748b", "#fbbf24", "#facc15", "#fde047",
  "#fb923c", "#ef4444", "#ec4899", "#f472b6", "#a78bfa", "#8b5cf6",
  "#3b82f6", "#60a5fa", "#22d3ee", "#06b6d4", "#10b981", "#22c55e",
  "#84cc16", "#cbcb41", "#dea584", "#519aba", "#73c991", "#cc3e44",
];

interface IconEditorProps {
  open: boolean;
  onClose: () => void;
  /** The currently active theme — used to seed the editor with the right rows. */
  activeTheme: IconThemePayload | null;
  /** Called after a successful save so the parent can swap the active theme + reload. */
  onSaved: (newThemeId: string) => void;
}

type Row = {
  kind: "ext" | "file" | "dir";
  key: string;
  text: string;
  fg: string;
  /** Was this row inherited from the base theme (for visual hint). */
  inherited: boolean;
};

const USER_THEME_ID = "user-overrides";

function seedRows(activeTheme: IconThemePayload): Row[] {
  const next: Row[] = [];
  for (const [name, rule] of Object.entries(activeTheme.byDirname)) {
    next.push({ kind: "dir", key: name, text: rule.text, fg: rule.fg ?? "#73c991", inherited: true });
  }
  for (const [name, rule] of Object.entries(activeTheme.byFilename)) {
    next.push({ kind: "file", key: name, text: rule.text, fg: rule.fg ?? "#cbd5e1", inherited: true });
  }
  for (const [name, rule] of Object.entries(activeTheme.byExt)) {
    next.push({ kind: "ext", key: name, text: rule.text, fg: rule.fg ?? "#cbd5e1", inherited: true });
  }
  // Sort: dirs first, then files, then exts — all alphabetical within group
  next.sort((a, b) => {
    const kindOrder = { dir: 0, file: 1, ext: 2 };
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    return a.key.localeCompare(b.key);
  });
  return next;
}

export const IconEditor: React.FC<IconEditorProps> = ({ open, onClose, activeTheme, onSaved }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [picker, setPicker] = useState<{ index: number; field: "text" | "fg" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed rows from the active theme each time the modal opens.
  useEffect(() => {
    if (!open || !activeTheme) return;
    setRows(seedRows(activeTheme));
    setFilter("");
    setError(null);
  }, [open, activeTheme]);

  const visibleRows = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => r.key.toLowerCase().includes(q));
  }, [rows, filter]);

  const updateRow = (originalIndex: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], ...patch, inherited: false };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [
      { kind: "dir", key: "", text: "", fg: "#73c991", inherited: false },
      ...prev,
    ]);
  };

  const removeRow = (originalIndex: number) => {
    setRows((prev) => prev.filter((_, i) => i !== originalIndex));
  };

  const buildToml = (): string => {
    const lines: string[] = [];
    lines.push(`name = "User Overrides"`);
    lines.push(`author = "you"`);
    lines.push(`version = "1.0"`);
    lines.push("");
    if (activeTheme) {
      lines.push(`# Forked from: ${activeTheme.meta.name} (${activeTheme.meta.id})`);
      lines.push("");
    }
    lines.push("[icon.default_file]");
    lines.push(`text = ${JSON.stringify(activeTheme?.defaultFile.text ?? "")}`);
    lines.push(`fg = ${JSON.stringify(activeTheme?.defaultFile.fg ?? "#cbd5e1")}`);
    lines.push("");
    lines.push("[icon.default_dir]");
    lines.push(`text = ${JSON.stringify(activeTheme?.defaultDir.text ?? "")}`);
    lines.push(`fg = ${JSON.stringify(activeTheme?.defaultDir.fg ?? "#73c991")}`);
    lines.push("");
    lines.push("[icon.default_cluster]");
    lines.push(`text = ${JSON.stringify(activeTheme?.defaultCluster.text ?? "")}`);
    lines.push(`fg = ${JSON.stringify(activeTheme?.defaultCluster.fg ?? "#f59e0b")}`);
    lines.push("");
    for (const row of rows) {
      if (!row.key.trim() || !row.text.trim()) continue;
      const tableName = row.kind === "ext" ? "icon.exts" : row.kind === "dir" ? "icon.dirs" : "icon.files";
      lines.push(`[[${tableName}]]`);
      lines.push(`name = ${JSON.stringify(row.key.trim())}`);
      lines.push(`text = ${JSON.stringify(row.text)}`);
      lines.push(`fg = ${JSON.stringify(row.fg)}`);
      lines.push("");
    }
    return lines.join("\n");
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const toml = buildToml();
      await tauriInvoke("save_user_icon_theme", { id: USER_THEME_ID, tomlContent: toml });
      await tauriInvoke("set_active_icon_theme", { id: USER_THEME_ID });
      onSaved(USER_THEME_ID);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const onResetActive = () => {
    if (!activeTheme) return;
    if (!window.confirm(`Discard your edits and reload from "${activeTheme.meta.name}"?`)) return;
    setRows(seedRows(activeTheme));
  };

  if (!open) return null;

  return (
    <div className="icon-editor-backdrop" onClick={onClose}>
      <div className="icon-editor-modal" onClick={(e) => e.stopPropagation()}>
        <header className="icon-editor-header">
          <div>
            <h2>Icon Editor</h2>
            <p>
              Forking from <strong>{activeTheme?.meta.name ?? "—"}</strong>. Saves to{" "}
              <code>~/.config/orbit/icon-themes/{USER_THEME_ID}.toml</code> and switches to it.
            </p>
          </div>
          <button className="icon-editor-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="icon-editor-toolbar">
          <input
            type="text"
            placeholder="Filter (e.g. ts, .env, Dockerfile)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="icon-editor-search"
          />
          <button onClick={addRow} className="icon-editor-add">+ Add row</button>
          <button onClick={onResetActive} className="icon-editor-reset" title="Reload from base theme">
            <RefreshCw size={13} /> Reset
          </button>
        </div>

        <div className="icon-editor-list">
          {visibleRows.length === 0 && (
            <div className="icon-editor-empty">No matches. Try clearing the filter or add a row.</div>
          )}
          {visibleRows.map((row) => {
            const originalIndex = rows.indexOf(row);
            return (
              <div key={`${row.kind}-${originalIndex}`} className={`icon-editor-row${row.inherited ? " inherited" : " edited"}`}>
                <select
                  value={row.kind}
                  onChange={(e) => updateRow(originalIndex, { kind: e.target.value as "ext" | "file" | "dir" })}
                  className="icon-editor-kind"
                >
                  <option value="dir">folder</option>
                  <option value="file">filename</option>
                  <option value="ext">.ext</option>
                </select>
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => updateRow(originalIndex, { key: e.target.value })}
                  placeholder={row.kind === "ext" ? "rs" : row.kind === "dir" ? "src" : "Cargo.toml"}
                  className="icon-editor-key"
                />
                <button
                  className="icon-editor-glyph"
                  style={{ color: row.fg, fontFamily: "Symbols Nerd Font, Symbola, monospace" }}
                  onClick={() => setPicker({ index: originalIndex, field: "text" })}
                  title="Pick glyph"
                >
                  {row.text || "?"}
                </button>
                <button
                  className={`icon-editor-color${row.fg.startsWith("theme:") ? " theme-linked" : ""}`}
                  style={{ background: resolveIconFg(row.fg) }}
                  onClick={() => setPicker({ index: originalIndex, field: "fg" })}
                  title={row.fg.startsWith("theme:") ? `Theme token: ${row.fg.slice(6)}` : row.fg}
                />
                <button
                  className="icon-editor-delete"
                  onClick={() => removeRow(originalIndex)}
                  title="Remove row"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {picker && (
          <div className="icon-editor-picker" onClick={() => setPicker(null)}>
            <div className="icon-editor-picker-inner" onClick={(e) => e.stopPropagation()}>
              {picker.field === "text" ? (
                <>
                  <h3>Pick a glyph</h3>
                  <div className="glyph-grid">
                    {GLYPH_PALETTE.map((g, i) => (
                      <button
                        key={i}
                        className="glyph-cell"
                        style={{ fontFamily: "Symbols Nerd Font, Symbola, monospace" }}
                        onClick={() => {
                          updateRow(picker.index, { text: g });
                          setPicker(null);
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Or paste any character / Unicode escape…"
                    className="glyph-custom"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value;
                        if (v) {
                          updateRow(picker.index, { text: v });
                          setPicker(null);
                        }
                      }
                    }}
                  />
                </>
              ) : (
                <>
                  <h3>Theme palette</h3>
                  <p className="color-picker-hint">These colors follow the active theme — they shift automatically when you switch themes.</p>
                  <div className="theme-token-grid">
                    {THEME_TOKENS.map(({ token, cssVar, sentinel }) => {
                      const live = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || "#808080";
                      const isActive = rows[picker.index]?.fg === sentinel;
                      return (
                        <button
                          key={token}
                          className={`theme-token-cell${isActive ? " active" : ""}`}
                          style={{ background: live }}
                          title={token}
                          onClick={() => {
                            updateRow(picker.index, { fg: sentinel });
                            setPicker(null);
                          }}
                        >
                          <span className="theme-token-label">{token.replace("color", "c")}</span>
                        </button>
                      );
                    })}
                  </div>
                  <h3>Fixed colors</h3>
                  <div className="color-grid">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        className="color-cell"
                        style={{ background: c }}
                        onClick={() => {
                          updateRow(picker.index, { fg: c });
                          setPicker(null);
                        }}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="#rrggbb or theme:accent"
                    className="color-custom"
                    defaultValue={rows[picker.index]?.fg ?? ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(v) || v.startsWith("theme:")) {
                          updateRow(picker.index, { fg: v });
                          setPicker(null);
                        }
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {error && <div className="icon-editor-error">{error}</div>}

        <footer className="icon-editor-footer">
          <span className="icon-editor-count">{rows.length} entries</span>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onSave} className="btn-primary" disabled={saving}>
            <Save size={13} /> {saving ? "Saving…" : "Save & apply"}
          </button>
        </footer>
      </div>
    </div>
  );
};

