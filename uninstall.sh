#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════╗
# ║           Orbit — Uninstall Script                    ║
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

APP_NAME="orbit"
BIN_NAME="orbit"
APPIMAGE_NAME="Orbit.AppImage"

BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor"
DATA_DIR="${HOME}/.local/share/orbit"

# ── Banner ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╭─────────────────────────────────────────╮"
echo "  │  ⬡  Orbit  ·  Uninstall                │"
echo "  ╰─────────────────────────────────────────╯"
echo -e "${RESET}"

# ── Confirm ───────────────────────────────────────────────
if [[ "${1:-}" != "--yes" ]] && [[ "${1:-}" != "-y" ]]; then
  echo -e "  This will remove Orbit from your user installation."
  echo -e "  ${DIM}(Build artifacts and source files are not touched.)${RESET}"
  echo ""
  printf "  Continue? [y/N] "
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo -e "\n  Aborted."; exit 0 ;;
  esac
fi

# ── Remove binary / symlink ───────────────────────────────
step "Removing executable"

DEST_EXEC="${BIN_DIR}/${BIN_NAME}"
if [[ -f "$DEST_EXEC" ]] || [[ -L "$DEST_EXEC" ]]; then
  rm -f "$DEST_EXEC"
  ok "Removed ${DIM}${DEST_EXEC}${RESET}"
else
  gone "${DEST_EXEC}"
fi

# ── Remove AppImage ───────────────────────────────────────
APPIMAGE="${DATA_DIR}/${APPIMAGE_NAME}"
if [[ -f "$APPIMAGE" ]]; then
  rm -f "$APPIMAGE"
  ok "Removed ${DIM}${APPIMAGE}${RESET}"
else
  gone "${APPIMAGE}"
fi

# ── Remove desktop entry ──────────────────────────────────
step "Removing desktop entry"

DESKTOP_FILE="${APPS_DIR}/${APP_NAME}.desktop"
if [[ -f "$DESKTOP_FILE" ]]; then
  rm -f "$DESKTOP_FILE"
  ok "Removed ${DIM}${DESKTOP_FILE}${RESET}"
else
  gone "${DESKTOP_FILE}"
fi

# ── Remove icons ──────────────────────────────────────────
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

# ── Remove data directory ─────────────────────────────────
step "Removing application data"

if [[ -d "$DATA_DIR" ]]; then
  # Only remove if it's just the AppImage or empty
  remaining=$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 ! -name "${APPIMAGE_NAME}" 2>/dev/null | wc -l)
  if [[ "$remaining" -eq 0 ]]; then
    rm -rf "$DATA_DIR"
    ok "Removed ${DIM}${DATA_DIR}${RESET}"
  else
    warn "Data directory not empty — left in place: ${DIM}${DATA_DIR}${RESET}"
    info "Contains user data (thumbnails, cache, logs) — remove manually if desired"
  fi
else
  gone "${DATA_DIR}"
fi

# ── Refresh caches ─────────────────────────────────────────
step "Refreshing system caches"

if [[ "$REMOVED_ICONS" -gt 0 ]]; then
  if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t "${ICONS_DIR}" 2>/dev/null && ok "Icon cache updated" || true
  fi
fi
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "${APPS_DIR}" 2>/dev/null && ok "Desktop database updated" || true
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓  Orbit uninstalled.${RESET}"
echo ""
echo -e "  Source files and build artifacts were ${BOLD}not${RESET} touched."
echo -e "  Re-install anytime with:  ${DIM}./install.sh${RESET}"
echo ""
