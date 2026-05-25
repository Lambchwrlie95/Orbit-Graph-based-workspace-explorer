/**
 * Orbit theme registry.
 *
 * Two sources of truth for colors at runtime:
 *
 *   1. Omarchy live palette (read from `~/.config/omarchy/current/theme/colors.toml`
 *      by `src-tauri/src/omarchy.rs`). Wired in `main.tsx`. Active when
 *      `mode === "omarchy"`.
 *
 *   2. Built-in flavors declared in `styles.css` under `html[data-theme="..."]`.
 *      Activated by setting `data-theme` on the root element.
 *
 * The picker lives in `SettingsPanel.tsx`. Persistence is plain localStorage —
 * we don't need cross-window sync.
 */
import { tauriInvoke } from "./tauriCommands";

export const THEME_STORAGE_KEY = "orbit:theme:choice";

export type FlavorId =
  | "omarchy"
  | "catppuccin-mocha"
  | "catppuccin-macchiato"
  | "catppuccin-frappe"
  | "catppuccin-latte"
  | "dracula"
  | "gruvbox-dark";

export interface FlavorMeta {
  id: FlavorId;
  label: string;
  /** Whether the flavor expects a light UI surface (drives icon variants). */
  light: boolean;
  /** Short hint shown next to the picker option. */
  hint?: string;
}

export const FLAVORS: FlavorMeta[] = [
  { id: "omarchy", label: "Follow Omarchy", hint: "syncs with ~/.config/omarchy", light: false },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", light: false },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato", light: false },
  { id: "catppuccin-frappe", label: "Catppuccin Frappé", light: false },
  { id: "catppuccin-latte", label: "Catppuccin Latte", light: true },
  { id: "dracula", label: "Dracula", light: false },
  { id: "gruvbox-dark", label: "Gruvbox Dark", light: false },
];

const FLAVOR_IDS = new Set<FlavorId>(FLAVORS.map((f) => f.id));

export function isFlavorId(value: string | null | undefined): value is FlavorId {
  return !!value && FLAVOR_IDS.has(value as FlavorId);
}

export function loadStoredFlavor(): FlavorId {
  if (typeof localStorage === "undefined") return "omarchy";
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return isFlavorId(raw) ? raw : "omarchy";
}

export function storeFlavor(id: FlavorId): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, id);
}

/**
 * Apply a flavor to <html>. Omarchy clears `data-theme` so the runtime
 * `--omarchy-*` vars set by the Omarchy bridge take over; anything else
 * sets `data-theme` and the matching block in styles.css wins.
 *
 * Also re-fetches Omarchy colors when switching back to omarchy, so the
 * palette is up-to-date even if no theme-change event fired since startup.
 */
export async function applyFlavor(id: FlavorId): Promise<void> {
  const root = document.documentElement;
  if (id === "omarchy") {
    root.removeAttribute("data-theme");
    // Clear inline overrides set by a previous applyOmarchyColors call so the
    // :root defaults shine through until the Tauri palette arrives.
    clearOmarchyInline();
    try {
      const colors = await tauriInvoke("get_omarchy_colors");
      if (colors?.available) {
        applyOmarchyColors(colors);
      }
    } catch {
      // Tauri may not be ready (e.g. plain vite preview). Falling back to
      // built-in defaults from :root is fine.
    }
  } else {
    // Built-in flavors live in styles.css under `html[data-theme="..."]`.
    // Drop inline overrides first so the flavor block actually wins
    // (inline style beats a CSS rule's specificity).
    clearOmarchyInline();
    root.setAttribute("data-theme", id);
  }
  window.dispatchEvent(new CustomEvent("orbit:flavor-changed", { detail: { id } }));
}

const OMARCHY_INLINE_VARS = [
  "--omarchy-bg", "--omarchy-fg", "--omarchy-accent", "--omarchy-cursor",
  "--omarchy-border", "--omarchy-sel-bg", "--omarchy-sel-fg",
  ...Array.from({ length: 16 }, (_, i) => `--omarchy-color${i}`),
];

function clearOmarchyInline(): void {
  const root = document.documentElement;
  OMARCHY_INLINE_VARS.forEach((name) => root.style.removeProperty(name));
  OMARCHY_INLINE_GRAPH_VARS.forEach((name) => root.style.removeProperty(name));
}

type OmarchyPayload = {
  background?: string;
  foreground?: string;
  accent?: string;
  cursor?: string;
  activeBorderColor?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  palette?: string[];
  graph?: {
    edgeHierarchy?: string;
    edgeCode?: string;
    edgeDocs?: string;
    edgeSymlink?: string;
    edgeSemantic?: string;
    edgeTags?: string;
    edgeOther?: string;
    canvas?: string;
    nodeDefault?: string;
  };
  available?: boolean;
};

const GRAPH_VAR_MAP: Array<[keyof NonNullable<OmarchyPayload["graph"]>, string]> = [
  ["edgeHierarchy", "--orbit-edge-hierarchy"],
  ["edgeCode", "--orbit-edge-code"],
  ["edgeDocs", "--orbit-edge-docs"],
  ["edgeSymlink", "--orbit-edge-symlink"],
  ["edgeSemantic", "--orbit-edge-semantic"],
  ["edgeTags", "--orbit-edge-tags"],
  ["edgeOther", "--orbit-edge-other"],
  ["canvas", "--orbit-graph-canvas"],
  ["nodeDefault", "--orbit-graph-node-default"],
];

/**
 * Push Omarchy palette into CSS custom properties. Called both at startup
 * (main.tsx) and after a `omarchy-theme-changed` event.
 */
export function applyOmarchyColors(colors: OmarchyPayload): void {
  const root = document.documentElement;
  const set = (name: string, value?: string) => {
    if (value) root.style.setProperty(name, value);
  };
  set("--omarchy-bg", colors.background);
  set("--omarchy-fg", colors.foreground);
  set("--omarchy-accent", colors.accent);
  set("--omarchy-cursor", colors.cursor);
  set("--omarchy-sel-bg", colors.selectionBackground);
  set("--omarchy-sel-fg", colors.selectionForeground);

  // Border falls back through three layers so a half-populated theme
  // still gets a reasonable rule.
  const border =
    colors.activeBorderColor ||
    colors.palette?.[8] ||
    (colors.background && colors.foreground
      ? `color-mix(in srgb, ${colors.background} 85%, ${colors.foreground} 15%)`
      : undefined);
  set("--omarchy-border", border);

  if (colors.palette) {
    colors.palette.forEach((c, i) => set(`--omarchy-color${i}`, c));
  }

  // Graph-edge overrides from orbit.toml (Method A integration). Only set when
  // the template is installed — otherwise the CSS defaults (or per-flavor
  // overrides) keep applying.
  if (colors.graph) {
    GRAPH_VAR_MAP.forEach(([key, varName]) => set(varName, colors.graph?.[key]));
  }
}

const OMARCHY_INLINE_GRAPH_VARS = GRAPH_VAR_MAP.map(([, v]) => v);
