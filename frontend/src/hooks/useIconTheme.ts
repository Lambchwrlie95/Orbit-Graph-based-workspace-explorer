import { useCallback, useEffect, useState } from "react";
import { tauriInvoke } from "../lib/tauriCommands";
import { iconRuleForPath } from "../lib/fileGlyphs";
import type { IconRule, IconThemePayload } from "../types";

/**
 * Loads the active icon theme once on mount and exposes a memoizable resolver.
 * Listens for `orbit:icon-theme-changed` so the theme picker can hot-swap
 * themes without a reload.
 */
export function useIconTheme() {
  const [theme, setTheme] = useState<IconThemePayload | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await tauriInvoke("get_active_icon_theme");
      setTheme(next);
      return next;
    } catch {
      setTheme(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    document.addEventListener("orbit:icon-theme-changed", handler);
    return () => document.removeEventListener("orbit:icon-theme-changed", handler);
  }, [reload]);

  const resolve = useCallback(
    (path: string, isDir: boolean, isCluster?: boolean): IconRule =>
      iconRuleForPath(path, isDir, !!isCluster, theme),
    [theme],
  );

  return { theme, reload, resolve };
}
