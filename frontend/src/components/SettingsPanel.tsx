import React, { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { FLAVORS, type FlavorId, applyFlavor, loadStoredFlavor, storeFlavor } from "../lib/theme";

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
  onOpenThemesFolder: () => void;
  onClearSelectedThumbnailCache: () => void;
  canClearSelectedThumbnailCache: boolean;
}

export function SettingsPanel({
  open,
  onClose,
  performanceMode,
  onPerformanceModeChange,
  thumbnailMemoryCap,
  onThumbnailMemoryCapChange,
  deepScan,
  onDeepScanChange,
  graphNodeLimit,
  onGraphNodeLimitChange,
  visibleFolderRescan,
  onVisibleFolderRescanChange,
  onOpenThemesFolder,
  onClearSelectedThumbnailCache,
  canClearSelectedThumbnailCache,
}: SettingsPanelProps) {
  if (!open) return null;

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
          <div>
            <Settings size={16} />
            <h2>Settings</h2>
          </div>
          <button type="button" onClick={onClose} title="Close settings" aria-label="Close settings">
            <X size={15} />
          </button>
        </header>

        <div className="settings-content">
          <SettingsSection title="General">
            <ToggleRow
              label="Visible-folder focus rescan"
              checked={visibleFolderRescan}
              onChange={onVisibleFolderRescanChange}
            />
          </SettingsSection>

          <SettingsSection title="Performance">
            <div className="segmented-control">
              {(["eco", "balanced", "full"] as PerformanceMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={performanceMode === mode ? "active" : ""}
                  onClick={() => onPerformanceModeChange(mode)}
                >
                  {mode === "eco" ? "Eco" : mode === "balanced" ? "Balanced" : "Full Visuals"}
                </button>
              ))}
            </div>
            <NumberRow label="Thumbnail memory cap" value={thumbnailMemoryCap} min={50} max={2000} step={50} onChange={onThumbnailMemoryCapChange} />
            <ToggleRow label="Deep scan flag" checked={deepScan} onChange={onDeepScanChange} />
          </SettingsSection>

          <SettingsSection title="Graph">
            <NumberRow label="Graph node cap" value={graphNodeLimit} min={100} max={5000} step={100} onChange={onGraphNodeLimitChange} />
            <button type="button" className="settings-action" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-labels"))}>
              Toggle labels
            </button>
            <button type="button" className="settings-action" onClick={() => document.dispatchEvent(new CustomEvent("orbit:graph:toggle-icons"))}>
              Toggle particle/icon mode
            </button>
          </SettingsSection>

          <SettingsSection title="Assets">
            <button
              type="button"
              className="settings-action"
              onClick={onClearSelectedThumbnailCache}
              disabled={!canClearSelectedThumbnailCache}
            >
              Clear selected thumbnail cache
            </button>
          </SettingsSection>

          <SettingsSection title="Appearance">
            <FlavorPicker />
          </SettingsSection>

          <SettingsSection title="Icons">
            <button type="button" className="settings-action" onClick={() => document.dispatchEvent(new CustomEvent("orbit:open-icon-editor"))}>
              Open icon editor
            </button>
            <button type="button" className="settings-action" onClick={onOpenThemesFolder}>
              Open themes folder
            </button>
          </SettingsSection>

          <SettingsSection title="External Apps">
            <div className="settings-note">$VISUAL, $EDITOR, $TERMINAL, and xdg handlers are used for external actions.</div>
          </SettingsSection>
        </div>
      </section>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-row number">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
      />
    </label>
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
