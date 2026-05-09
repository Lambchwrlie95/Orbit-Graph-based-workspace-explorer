#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════╗
# ║           Orbit — Uninstall Script                    ║
# ║   Default: full wipe (pacman -Rns equivalent).        ║
# ║   Pass --keep-data to preserve DB / thumbnails / cfg. ║
# ╚═══════════════════════════════════════════════════════╝
set -euo pipefail

RESET='\033[0m'
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
gone() { echo -e "  ${DIM}–  $* (not found, skipped)${RESET}"; }
step() { echo -e "\n${BOLD}${CYAN}◆${RESET} ${BOLD}$*${RESET}"; }

WANTS_HELP=0
for arg in "$@"; do
  case "$arg" in
    --help|-h) WANTS_HELP=1 ;;
  esac
done

# Re-launch in a terminal when triggered from a file manager.
if [[ "$WANTS_HELP" == 0 ]] && [ ! -t 1 ] && [ -z "${ORBIT_UNINSTALL_TTY:-}" ]; then
  for term in alacritty kitty ghostty foot wezterm gnome-terminal konsole xterm; do
    if command -v "$term" >/dev/null 2>&1; then
      export ORBIT_UNINSTALL_TTY=1
      case "$term" in
        gnome-terminal) exec "$term" -- bash "$0" "$@" ;;
        konsole)        exec "$term" -e bash "$0" "$@" ;;
        *)              exec "$term" -e bash "$0" "$@" ;;
      esac
    fi
  done
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="orbit"
BIN_NAME="orbit"
DESKTOP_IDS=(
  "orbit.desktop"
  "orbit-folder.desktop"
  "orbit-dev.desktop"
  "Orbit.desktop"
  "local.orbit.file-intelligence.desktop"
)

BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor"
DATA_DIR="${HOME}/.local/share/orbit"
CACHE_DIR="${HOME}/.cache/orbit"
CONFIG_DIR="${HOME}/.config/orbit"

# Source-tree build artifacts (cleaned by --clean-source).
TARGET_DIR="${SCRIPT_DIR}/src-tauri/target"
NODE_MODULES="${SCRIPT_DIR}/frontend/node_modules"
FRONTEND_DIST="${SCRIPT_DIR}/frontend/dist"

# ── Args ─────────────────────────────────────────────────
# Default = full wipe. Flags subtract from the wipe.
KEEP_DATA=0
CLEAN_SOURCE=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --keep-data)    KEEP_DATA=1 ;;
    --clean-source) CLEAN_SOURCE=1 ;;
    --yes|-y)       ASSUME_YES=1 ;;
    --purge|--all)  : ;;  # accepted for back-compat — already the default
    --help|-h)
      echo "Usage: ./uninstall.sh [options]"
      echo ""
      echo "  Default behaviour wipes EVERYTHING Orbit installed (binary,"
      echo "  desktop entry, icons) AND all user state (DB, thumbnails,"
      echo "  cache, config, icon themes). pacman -Rns equivalent."
      echo ""
      echo "Options:"
      echo "  --keep-data      Preserve ${DATA_DIR}, ${CACHE_DIR},"
      echo "                   ${CONFIG_DIR} (DB / thumbnails / settings)."
      echo "  --clean-source   Also wipe build artifacts in the source tree:"
      echo "                   src-tauri/target/, frontend/node_modules/,"
      echo "                   frontend/dist/. Frees several GB."
      echo "  --yes, -y        Skip confirmation prompt."
      exit 0
      ;;
  esac
done

# ── Banner ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╭─────────────────────────────────────────╮"
echo "  │  ⬡  Orbit  ·  Uninstall                │"
echo "  ╰─────────────────────────────────────────╯"
echo -e "${RESET}"

# ── Show plan + confirm ──────────────────────────────────
echo -e "  ${BOLD}This will remove:${RESET}"
echo -e "    • Binary / symlink → ${DIM}${BIN_DIR}/${BIN_NAME}${RESET}"
echo -e "    • Desktop entry   → ${DIM}${APPS_DIR}/${APP_NAME}.desktop${RESET}"
echo -e "    • Icons           → ${DIM}${ICONS_DIR}/<size>/apps/${APP_NAME}.png${RESET}"
if [[ "$KEEP_DATA" == 0 ]]; then
  echo -e "    • App data        → ${DIM}${DATA_DIR}${RESET}"
  echo -e "    • Cache           → ${DIM}${CACHE_DIR}${RESET}"
  echo -e "    • Config + themes → ${DIM}${CONFIG_DIR}${RESET}"
else
  echo -e "    ${DIM}(--keep-data: leaving DB / cache / config in place)${RESET}"
fi
if [[ "$CLEAN_SOURCE" == 1 ]]; then
  echo -e "    • Source build artifacts:"
  echo -e "        ${DIM}${TARGET_DIR}${RESET}"
  echo -e "        ${DIM}${NODE_MODULES}${RESET}"
  echo -e "        ${DIM}${FRONTEND_DIST}${RESET}"
fi
echo ""

if [[ "$ASSUME_YES" == 0 ]]; then
  if [ -t 0 ]; then
    printf "  Continue? [y/N] "
    read -r answer
    case "$answer" in
      [yY]|[yY][eE][sS]) ;;
      *) echo -e "\n  Aborted."; exit 0 ;;
    esac
  else
    warn "No TTY — pass --yes to skip confirmation when running non-interactively."
    exit 1
  fi
fi

# ── Remove binary / symlink ──────────────────────────────
step "Removing executable"
DEST_EXEC="${BIN_DIR}/${BIN_NAME}"
if [[ -f "$DEST_EXEC" ]] || [[ -L "$DEST_EXEC" ]]; then
  rm -f "$DEST_EXEC"
  ok "Removed ${DIM}${DEST_EXEC}${RESET}"
else
  gone "${DEST_EXEC}"
fi

# ── Remove desktop entries ───────────────────────────────
step "Removing desktop entries"
for desktop_id in "${DESKTOP_IDS[@]}"; do
  desktop_file="${APPS_DIR}/${desktop_id}"
  if [[ -f "$desktop_file" ]] || [[ -L "$desktop_file" ]]; then
    rm -f "$desktop_file"
    ok "Removed ${DIM}${desktop_file}${RESET}"
  else
    gone "${desktop_file}"
  fi
done

# ── Remove icons ─────────────────────────────────────────
step "Removing icons"
REMOVED_ICONS=0
for size in 32 128 256 512; do
  icon="${ICONS_DIR}/${size}x${size}/apps/${APP_NAME}.png"
  if [[ -f "$icon" ]]; then
    rm -f "$icon"
    ok "${size}×${size} icon removed"
    REMOVED_ICONS=$((REMOVED_ICONS + 1))
  else
    gone "${icon}"
  fi
done

# Legacy artifact: scripts/install-desktop-entry.sh dropped a copy here
# for GUI app-installer tools. Most installs won't have it.
LEGACY_APP_ICON="${HOME}/Applications/orbit.png"
if [[ -f "$LEGACY_APP_ICON" ]]; then
  rm -f "$LEGACY_APP_ICON"
  ok "Removed legacy ${DIM}${LEGACY_APP_ICON}${RESET}"
fi

# ── Remove user state ────────────────────────────────────
if [[ "$KEEP_DATA" == 0 ]]; then
  step "Removing application data, cache, and config"
  for dir in "$DATA_DIR" "$CACHE_DIR" "$CONFIG_DIR"; do
    if [[ -d "$dir" ]]; then
      rm -rf "$dir"
      ok "Removed ${DIM}${dir}${RESET}"
    else
      gone "${dir}"
    fi
  done
else
  step "Preserving application data (--keep-data)"
  for dir in "$DATA_DIR" "$CACHE_DIR" "$CONFIG_DIR"; do
    if [[ -d "$dir" ]]; then
      info "Kept ${DIM}${dir}${RESET}"
    fi
  done
fi

# ── Optional source-tree clean ───────────────────────────
if [[ "$CLEAN_SOURCE" == 1 ]]; then
  step "Cleaning source-tree build artifacts"
  for path in "$TARGET_DIR" "$NODE_MODULES" "$FRONTEND_DIST"; do
    if [[ -d "$path" ]]; then
      rm -rf "$path"
      ok "Removed ${DIM}${path}${RESET}"
    else
      gone "${path}"
    fi
  done
fi

# ── Refresh caches ───────────────────────────────────────
step "Refreshing system caches"
if [[ "$REMOVED_ICONS" -gt 0 ]]; then
  if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t "${ICONS_DIR}" 2>/dev/null && ok "Icon cache updated" || true
  fi
fi
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "${APPS_DIR}" 2>/dev/null && ok "Desktop database updated" || true
fi
if command -v xdg-desktop-menu &>/dev/null; then
  xdg-desktop-menu forceupdate 2>/dev/null && ok "Desktop menu refreshed" || true
fi
if command -v kbuildsycoca6 &>/dev/null; then
  kbuildsycoca6 --noincremental 2>/dev/null && ok "KDE service cache refreshed" || true
elif command -v kbuildsycoca5 &>/dev/null; then
  kbuildsycoca5 --noincremental 2>/dev/null && ok "KDE service cache refreshed" || true
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓  Orbit uninstalled.${RESET}"
echo ""
if [[ "$KEEP_DATA" == 0 ]]; then
  echo -e "  All Orbit files, data, cache, config, and icon themes removed."
else
  echo -e "  Binary + desktop entry removed. User data kept (--keep-data)."
fi
if [[ "$CLEAN_SOURCE" == 0 ]]; then
  echo -e "  ${DIM}Source-tree build artifacts (target/, node_modules/, dist/)"
  echo -e "  were not touched. Pass ${BOLD}--clean-source${RESET}${DIM} to also delete them.${RESET}"
fi
echo -e "  Re-install anytime with:  ${DIM}./install.sh${RESET}"
echo ""

if [ -n "${ORBIT_UNINSTALL_TTY:-}" ] && [ -t 0 ]; then
  printf "  Press Enter to close this window…"
  read -r _ || true
fi
