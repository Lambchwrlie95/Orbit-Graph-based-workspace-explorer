import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Accessibility,
  Cpu,
  Database,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Info,
  Keyboard,
  Layers,
  Music,
  Palette,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { FLAVORS, type FlavorId, applyFlavor, loadStoredFlavor, storeFlavor } from "../lib/theme";
import type { GraphWallpaper } from "../types";
import { fileToAssetUrl } from "../lib/tauriCommands";

export type PerformanceMode = "eco" | "balanced" | "full";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  performanceMode: PerformanceMode;
  onPerformanceModeChange: (mode: PerformanceMode) => void;
  thumbnailMemoryCap: number;
  onThumbnailMemoryCapChange: (cap: number) => void;
  deepScan: boolean;
  onDeepScanChange: (enabled: boolean) => void;
  graphNodeLimit: number;
  onGraphNodeLimitChange: (limit: number) => void;
  visibleFolderRescan: boolean;
  onVisibleFolderRescanChange: (enabled: boolean) => void;
  editorCommand: string;
  onEditorCommandChange: (command: string) => void;
  onOpenThemesFolder: () => void;
  onOpenOrbitConfigDir: () => void;
  onClearSelectedThumbnailCache: () => void;
  canClearSelectedThumbnailCache: boolean;
  wallpapers?: GraphWallpaper[];
  graph3dWallpaper?: string | null;
  onGraph3dWallpaperChange?: (path: string | null) => void;
}

type SectionId =
  | "general"
  | "graph"
  | "performance"
  | "appearance"
  | "icons"
  | "external"
  | "media"
  | "accessibility"
  | "data"
  | "shortcuts"
  | "about";

interface SectionMeta {
  id: SectionId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  search: string;
}

const SECTIONS: SectionMeta[] = [
  { id: "general",       label: "General",        hint: "Workspace defaults & focus behavior", icon: SettingsIcon,  search: "visible folder focus rescan workspace general" },
  { id: "graph",         label: "Graph",          hint: "Layout, labels, wallpapers",          icon: Layers,        search: "graph node cap labels icons particle wallpaper 3d" },
  { id: "performance",   label: "Performance",    hint: "Modes, memory, scanning",             icon: Cpu,           search: "performance mode eco balanced full thumbnail memory cap deep scan" },
  { id: "appearance",    label: "Appearance",     hint: "Theme flavor",                        icon: Palette,       search: "appearance color theme flavor catppuccin dracula gruvbox omarchy" },
  { id: "icons",         label: "Icons",          hint: "Icon themes & editor",                icon: ImageIcon,     search: "icons icon theme editor folder glyph" },
  { id: "external",      label: "External Apps",  hint: "Editor & browser launch",             icon: ExternalLink,  search: "external app editor command vscode neovim nvim kitty" },
  { id: "media",        label: "Media",           hint: "Audio & video playback",               icon: Music,         search: "media audio video music player mpv vlc playback codec gstreamer" },
  { id: "accessibility", label: "Accessibility",  hint: "Motion & contrast",                   icon: Accessibility, search: "accessibility motion contrast reduced" },
  { id: "data",          label: "Data & Storage", hint: "Index, cache, disk usage",            icon: Database,      search: "data storage cache thumbnail clear index database" },
  { id: "shortcuts",     label: "Shortcuts",      hint: "Keyboard reference",                  icon: Keyboard,      search: "shortcuts keyboard hotkey binding key" },
  { id: "about",         label: "About",          hint: "Version & credits",                   icon: Info,          search: "about version credits orbit" },
];

const KEYBOARD_SHORTCUTS: Array<{ group: string; entries: Array<{ keys: string; label: string }> }> = [
  {
    group: "Global",
    entries: [
      { keys: "Ctrl + L", label: "Edit address bar" },
      { keys: "Ctrl + K", label: "Open command palette" },
      { keys: "?",        label: "Show keyboard help" },
      { keys: "Esc",      label: "Cancel / close dialogs" },
    ],
  },
  {
    group: "Graph",
    entries: [
      { keys: "F", label: "Fit graph to view" },
      { keys: "L", label: "Toggle labels" },
      { keys: "I", label: "Toggle icons mode" },
      { keys: "D", label: "Toggle dim-unrelated" },
    ],
  },
  {
    group: "Navigation",
    entries: [
      { keys: "← / →",     label: "Cycle siblings" },
      { keys: "Enter",     label: "Open selected" },
      { keys: "Backspace", label: "Go to parent folder" },
    ],
  },
];

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    open, onClose,
    performanceMode, onPerformanceModeChange,
    thumbnailMemoryCap, onThumbnailMemoryCapChange,
    deepScan, onDeepScanChange,
    graphNodeLimit, onGraphNodeLimitChange,
    visibleFolderRescan, onVisibleFolderRescanChange,
    editorCommand, onEditorCommandChange,
    onOpenThemesFolder,
    onOpenOrbitConfigDir,
    onClearSelectedThumbnailCache, canClearSelectedThumbnailCache,
    wallpapers = [],
    graph3dWallpaper, onGraph3dWallpaperChange,
  } = props;

  const [section, setSection] = useState<SectionId>("general");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("orbit:reduced-motion") === "1",
  );
  const [highContrast, setHighContrast] = useState<boolean>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("orbit:high-contrast") === "1",
  );
  const [alwaysExternal, setAlwaysExternal] = useState<boolean>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("orbit:media:alwaysExternal") === "1",
  );
  const [appName, setAppName] = useState<string>("Orbit");
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    document.documentElement.classList.toggle("orbit-reduced-motion", reducedMotion);
    window.localStorage.setItem("orbit:reduced-motion", reducedMotion ? "1" : "0");
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle("orbit-high-contrast", highContrast);
    window.localStorage.setItem("orbit:high-contrast", highContrast ? "1" : "0");
  }, [highContrast]);

  useEffect(() => {
    window.localStorage.setItem("orbit:media:alwaysExternal", alwaysExternal ? "1" : "0");
  }, [alwaysExternal]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const tauri = (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
        if (!tauri) return;
        const { getName, getVersion } = await import("@tauri-apps/api/app");
        const [name, version] = await Promise.all([
          getName().catch(() => ""),
          getVersion().catch(() => ""),
        ]);
        if (cancelled) return;
        if (name) setAppName(name);
        if (version) setAppVersion(version);
      } catch {
        /* not running in Tauri — ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) =>
      s.label.toLowerCase().includes(q) || s.search.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (filteredSections.length === 0) return;
    if (!filteredSections.some((s) => s.id === section)) {
      setSection(filteredSections[0].id);
    }
  }, [filteredSections, section]);

  if (!open) return null;

  const activeMeta = SECTIONS.find((s) => s.id === section);

  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div className="settings-title">
            <SettingsIcon size={13} strokeWidth={1.8} />
            <h2>Settings</h2>
          </div>
          <div className="settings-search">
            <Search size={11} strokeWidth={1.8} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Search settings"
            />
            <kbd className="settings-search-hint">/</kbd>
          </div>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close settings"
          >
            <X size={13} strokeWidth={1.9} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings categories">
            {filteredSections.length === 0 ? (
              <div className="settings-nav-empty">No matches</div>
            ) : (
              filteredSections.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={section === s.id ? "settings-nav-item active" : "settings-nav-item"}
                    onClick={() => setSection(s.id)}
                    aria-current={section === s.id ? "page" : undefined}
                  >
                    <Icon size={12} strokeWidth={1.8} />
                    <span>{s.label}</span>
                  </button>
                );
              })
            )}
          </nav>

          <main className="settings-content">
            {activeMeta && (
              <div className="settings-section-head">
                <h3>{activeMeta.label}</h3>
                <p>{activeMeta.hint}</p>
              </div>
            )}

            {section === "general" && (
              <div className="settings-stack">
                <ToggleRow
                  label="Visible-folder focus rescan"
                  description="Rescan only the folder currently in view when the window regains focus."
                  checked={visibleFolderRescan}
                  onChange={onVisibleFolderRescanChange}
                />
              </div>
            )}

            {section === "graph" && (
              <div className="settings-stack">
                <NumberRow
                  label="Graph node cap"
                  description="Maximum nodes Sigma will render at once. Higher values cost frame rate."
                  value={graphNodeLimit}
                  min={100} max={5000} step={100}
                  onChange={onGraphNodeLimitChange}
                />
                <div className="settings-block settings-block--card">
                  <div className="settings-block-label">Graph controls</div>
                  <div className="settings-action-grid">
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-labels"))}>
                      <span>Labels</span>
                      <small>Show / hide node text</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-icons"))}>
                      <span>Icons</span>
                      <small>Swap spheres and glyphs</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:fit"))}>
                      <span>Fit view</span>
                      <small>Frame the current graph</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:switch-3d"))}>
                      <span>3D mode</span>
                      <small>Jump to the 3D graph</small>
                    </button>
                  </div>
                </div>
                <div className="settings-block settings-block--card settings-block--3d">
                  <div className="settings-block-label">3D graph controls</div>
                  <div className="settings-action-grid">
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:3d:pause-toggle"))}>
                      <span>Pause / resume</span>
                      <small>Freeze or reheat physics</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:3d:pin-toggle"))}>
                      <span>Drag pinning</span>
                      <small>Toggle fixed drag positions</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:3d:release-pins"))}>
                      <span>Release pins</span>
                      <small>Let all nodes flow again</small>
                    </button>
                    <button type="button" className="settings-action-card" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:3d:refit"))}>
                      <span>Refit 3D</span>
                      <small>Recenter camera safely</small>
                    </button>
                  </div>
                </div>
                <div className="settings-block">
                  <div className="settings-block-label">3D wallpaper</div>
                  {wallpapers.length > 0 ? (
                    <div className="wallpaper-grid">
                      <button
                        type="button"
                        className={`wallpaper-option ${!graph3dWallpaper ? "active" : ""}`}
                        onClick={() => onGraph3dWallpaperChange?.(null)}
                        title="No wallpaper"
                      >
                        <span className="wallpaper-none">None</span>
                      </button>
                      {wallpapers.map((w) => (
                        <button
                          key={w.path}
                          type="button"
                          className={`wallpaper-option ${graph3dWallpaper === w.path ? "active" : ""}`}
                          onClick={() => onGraph3dWallpaperChange?.(w.path)}
                          title={`${w.theme} — ${w.name}\n${w.path}`}
                        >
                          <img src={fileToAssetUrl(w.path)} alt={w.name} className="wallpaper-thumb" loading="lazy" />
                          <span className="wallpaper-label">{w.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-help">No wallpapers found.</p>
                  )}
                  <p className="settings-help">
                    Drop image files (jpg, png, webp) into <code>~/.config/orbit/backgrounds/</code> and they'll appear here on next launch.
                    Omarchy per-theme backgrounds from <code>~/.config/omarchy/themes/*/backgrounds/</code> are also picked up automatically.
                  </p>
                  <button type="button" className="settings-cta" onClick={onOpenOrbitConfigDir}>
                    Open Orbit config folder
                  </button>
                </div>
              </div>
            )}

            {section === "performance" && (
              <div className="settings-stack">
                <div className="settings-block">
                  <div className="settings-block-label">Mode</div>
                  <div className="segmented-control">
                    {(["eco", "balanced", "full"] as PerformanceMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={performanceMode === mode ? "active" : ""}
                        onClick={() => onPerformanceModeChange(mode)}
                      >
                        {mode === "eco" ? "Eco" : mode === "balanced" ? "Balanced" : "Full"}
                      </button>
                    ))}
                  </div>
                  <p className="settings-help">{describePerfMode(performanceMode)}</p>
                </div>
                <NumberRow
                  label="Thumbnail memory cap"
                  description="Megabytes of decoded thumbnails kept resident in memory."
                  value={thumbnailMemoryCap}
                  min={50} max={2000} step={50}
                  unit="MB"
                  onChange={onThumbnailMemoryCapChange}
                />
                <ToggleRow
                  label="Deep scan"
                  description="Walk into hidden directories during indexing."
                  checked={deepScan}
                  onChange={onDeepScanChange}
                />
              </div>
            )}

            {section === "appearance" && (
              <div className="settings-stack">
                <div className="settings-block">
                  <div className="settings-block-label">Color flavor</div>
                  <FlavorPicker />
                  <p className="settings-help">Hot-swaps the whole UI palette. Built-in flavors work standalone. "Follow Omarchy" syncs live with your Omarchy color scheme if installed.</p>
                </div>
              </div>
            )}

            {section === "icons" && (
              <div className="settings-stack">
                <ActionRow
                  label="Icon editor"
                  description="Edit your icon overrides and per-path glyph mappings."
                  onClick={() => {
                    document.dispatchEvent(new CustomEvent("orbit:open-icon-editor"));
                    onClose();
                  }}
                  cta="Open"
                />
                <ActionRow
                  label="Themes folder"
                  description="Reveal the icon themes directory in your file manager."
                  onClick={onOpenThemesFolder}
                  cta="Reveal"
                  icon={Folder}
                />
              </div>
            )}

            {section === "external" && (
              <div className="settings-stack">
                <div className="settings-block">
                  <div className="settings-block-label">Editor preset</div>
                  <div className="segmented-control">
                    <button type="button" className={editorCommand === "kitty -e nvim {file}" ? "active" : ""} onClick={() => onEditorCommandChange("kitty -e nvim {file}")}>Neovim</button>
                    <button type="button" className={editorCommand === "code {file}" ? "active" : ""} onClick={() => onEditorCommandChange("code {file}")}>VS Code</button>
                    <button type="button" className={!editorCommand.trim() ? "active" : ""} onClick={() => onEditorCommandChange("")}>$EDITOR</button>
                  </div>
                </div>
                <div className="settings-block">
                  <div className="settings-block-label">Custom command</div>
                  <input
                    className="settings-input settings-input--mono"
                    type="text"
                    value={editorCommand}
                    placeholder="kitty -e nvim {file}"
                    onChange={(event) => onEditorCommandChange(event.target.value)}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                  <p className="settings-help">
                    Use <code>{"{file}"}</code> as the selected path placeholder. Blank falls back to <code>$EDITOR</code>.
                  </p>
                </div>
              </div>
            )}

            {section === "media" && (
              <div className="settings-stack">
                <ToggleRow
                  label="Always open in system player"
                  description="Skip embedded audio playback and open every audio file directly in your system player (mpv, VLC, etc.)."
                  checked={alwaysExternal}
                  onChange={setAlwaysExternal}
                />
                <p className="settings-help settings-help--block">
                  On Linux, embedded audio requires GStreamer plugins (gst-plugins-good, gst-plugins-bad).
                  If you see <em>"could not decode"</em> errors, enable this toggle or install the missing plugins.
                </p>
                <div className="settings-block">
                  <div className="settings-block-label">Supported formats (embedded)</div>
                  <p className="settings-help">
                    OGG Vorbis, WebM Opus, WAV — always work. MP3, AAC, FLAC, and others depend on installed GStreamer plugins.
                  </p>
                </div>
              </div>
            )}

            {section === "accessibility" && (
              <div className="settings-stack">
                <ToggleRow
                  label="Reduce motion"
                  description="Disable animations, transitions, and graph relax-pass jitter."
                  checked={reducedMotion}
                  onChange={setReducedMotion}
                />
                <ToggleRow
                  label="High contrast"
                  description="Strengthen text, border, and selection contrast."
                  checked={highContrast}
                  onChange={setHighContrast}
                />
                <p className="settings-help settings-help--block">
                  Preferences are stored in localStorage and apply only to Orbit. With both off, the app inherits
                  <code>prefers-reduced-motion</code> from the OS.
                </p>
              </div>
            )}

            {section === "data" && (
              <div className="settings-stack">
                <ActionRow
                  label="Clear thumbnails for selected file"
                  description="Remove cached thumbnails generated for the currently selected path. The index is not affected."
                  onClick={onClearSelectedThumbnailCache}
                  disabled={!canClearSelectedThumbnailCache}
                  cta="Clear"
                />
                <div className="settings-block">
                  <div className="settings-block-label">On-disk locations</div>
                  <dl className="settings-paths">
                    <div>
                      <dt>Index</dt>
                      <dd><code>~/.local/share/orbit/orbit.db</code></dd>
                    </div>
                    <div>
                      <dt>Thumbnails</dt>
                      <dd><code>~/.local/share/orbit/thumbnails/</code></dd>
                    </div>
                    <div>
                      <dt>Log</dt>
                      <dd><code>~/.local/share/orbit/app.log</code></dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {section === "shortcuts" && (
              <div className="settings-stack">
                {KEYBOARD_SHORTCUTS.map((group) => (
                  <div key={group.group} className="settings-block">
                    <div className="settings-block-label">{group.group}</div>
                    <ul className="shortcut-list">
                      {group.entries.map((entry) => (
                        <li key={entry.label}>
                          <span>{entry.label}</span>
                          <kbd>{entry.keys}</kbd>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="settings-help settings-help--block">
                  Press <kbd>?</kbd> anywhere in the app to bring up the full keyboard reference dialog.
                </p>
              </div>
            )}

            {section === "about" && (
              <div className="settings-stack">
                <div className="settings-about">
                  <div className="settings-about-mark" aria-hidden>◐</div>
                  <h4>{appName}</h4>
                  {appVersion && <div className="settings-about-version">v{appVersion}</div>}
                  <p className="settings-about-tag">A graph-native wiki for the filesystem.</p>
                </div>
                <div className="settings-block">
                  <div className="settings-block-label">Resources</div>
                  <ul className="settings-link-list">
                    <li>
                      <button
                        type="button"
                        className="settings-link"
                        onClick={() => document.dispatchEvent(new CustomEvent("orbit:keyboard-help"))}
                      >
                        Keyboard help dialog
                      </button>
                    </li>
                    <li>
                      <button type="button" className="settings-link" onClick={onOpenThemesFolder}>
                        Open themes folder
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function describePerfMode(mode: PerformanceMode): string {
  if (mode === "eco") return "Lowest CPU and memory. Thumbnails throttled, animations minimal.";
  if (mode === "balanced") return "Sensible defaults — graph stays responsive on most machines.";
  return "All effects on. Best for fast machines and small workspaces.";
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-row">
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {description && <span className="settings-row-desc">{description}</span>}
      </span>
      <span className={`settings-switch ${checked ? "on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="settings-switch-track" aria-hidden />
        <span className="settings-switch-thumb" aria-hidden />
      </span>
    </label>
  );
}

function NumberRow({
  label, description, value, min, max, step, unit, onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-row">
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {description && <span className="settings-row-desc">{description}</span>}
      </span>
      <span className="settings-row-control">
        <input
          className="settings-input settings-input--mono"
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        />
        {unit && <span className="settings-input-unit">{unit}</span>}
      </span>
    </label>
  );
}

function ActionRow({
  label, description, onClick, cta = "Open", disabled, icon: Icon,
}: {
  label: string;
  description?: string;
  onClick: () => void;
  cta?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-text">
        <span className="settings-row-label">
          {Icon && <Icon size={12} strokeWidth={1.8} />}
          {label}
        </span>
        {description && <span className="settings-row-desc">{description}</span>}
      </span>
      <button type="button" className="settings-cta" onClick={onClick} disabled={disabled}>
        {cta}
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function FlavorPicker() {
  const [active, setActive] = useState<FlavorId>(() => loadStoredFlavor());

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: FlavorId }>).detail;
      if (detail?.id) setActive(detail.id);
    };
    window.addEventListener("orbit:flavor-changed", handler);
    return () => window.removeEventListener("orbit:flavor-changed", handler);
  }, []);

  const choose = (id: FlavorId) => {
    storeFlavor(id);
    setActive(id);
    applyFlavor(id).catch(() => {});
  };

  return (
    <div className="flavor-picker">
      {FLAVORS.map((flavor) => (
        <button
          key={flavor.id}
          type="button"
          className={`flavor-option ${active === flavor.id ? "active" : ""}`}
          onClick={() => choose(flavor.id)}
          title={flavor.hint ?? flavor.label}
        >
          <span className="flavor-swatches" aria-hidden>
            <i data-flavor={flavor.id} className="flavor-swatch flavor-swatch--bg" />
            <i data-flavor={flavor.id} className="flavor-swatch flavor-swatch--accent" />
            <i data-flavor={flavor.id} className="flavor-swatch flavor-swatch--edge" />
          </span>
          <span className="flavor-label">{flavor.label}</span>
        </button>
      ))}
    </div>
  );
}

export default SettingsPanel;
