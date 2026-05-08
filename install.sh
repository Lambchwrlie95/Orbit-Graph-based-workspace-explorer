#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════╗
# ║             Orbit — Install Script                     ║
# ║  Graph-first file intelligence IDE                     ║
# ╚═══════════════════════════════════════════════════════╝
set -euo pipefail

# ── Colours ──────────────────────────────────────────────
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
die()  { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}◆${RESET} ${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="orbit"
BIN_NAME="orbit"
APPIMAGE_NAME="Orbit.AppImage"

# Installation paths
BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor"
DATA_DIR="${HOME}/.local/share/orbit"

RELEASE_BIN="${SCRIPT_DIR}/src-tauri/target/release/${BIN_NAME}"
APPIMAGE_PATH="${SCRIPT_DIR}/target/release/bundle/appimage/${APPIMAGE_NAME}"

# ── Banner ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╭─────────────────────────────────────────╮"
echo "  │  ⬡  Orbit  ·  File Intelligence IDE    │"
echo "  ╰─────────────────────────────────────────╯"
echo -e "${RESET}"

# ── Parse args ───────────────────────────────────────────
MODE="auto"
BUILD=0
LINK=0
for arg in "$@"; do
  case "$arg" in
    --build)    BUILD=1 ;;
    --appimage) MODE="appimage" ;;
    --binary)   MODE="binary" ;;
    --link)     LINK=1 ;;
    --dev)      LINK=1 ;;
    --help|-h)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --build      Build from source before installing"
      echo "  --appimage   Install AppImage (default when available)"
      echo "  --binary     Install raw release binary"
      echo "  --link, --dev  Symlink the release binary instead of copying"
      echo "                 — every cargo build --release is auto-picked-up"
      echo "                 next launch, no reinstall needed."
      echo "  --help       Show this help"
      echo ""
      echo "What gets installed:"
      echo "  ${BIN_DIR}/${BIN_NAME}        ← launcher/symlink"
      echo "  ${APPS_DIR}/${APP_NAME}.desktop"
      echo "  ${ICONS_DIR}/<size>/apps/${APP_NAME}.png"
      exit 0
      ;;
  esac
done

# ── Prerequisites ────────────────────────────────────────
step "Checking prerequisites"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found"
  else
    warn "$1 not found — ${2:-may be needed}"
  fi
}

check_cmd cargo    "required to build from source (https://rustup.rs/)"
check_cmd node     "required to build frontend"
check_cmd npm      "required to build frontend"

# ── Optional build step ───────────────────────────────────
if [[ "$BUILD" == 1 ]]; then
  step "Building Orbit from source"
  info "Building frontend…"
  cd "${SCRIPT_DIR}/frontend" && npm install --silent && npm run build 2>&1 | tail -3
  info "Building Rust binary (release)…"
  cd "${SCRIPT_DIR}/src-tauri" && cargo build --release 2>&1 | grep -E "^error|Compiling orbit|Finished" || true
  cd "${SCRIPT_DIR}"
  ok "Build complete"
fi

# ── Determine what to install ─────────────────────────────
step "Locating artifact"

INSTALL_TYPE=""
if [[ "$MODE" == "appimage" ]] || ([[ "$MODE" == "auto" ]] && [[ -f "$APPIMAGE_PATH" ]]); then
  if [[ -f "$APPIMAGE_PATH" ]]; then
    INSTALL_TYPE="appimage"
    ARTIFACT="$APPIMAGE_PATH"
    ok "AppImage found at ${DIM}${APPIMAGE_PATH}${RESET}"
  else
    warn "AppImage not found — falling back to binary"
    MODE="binary"
  fi
fi

if [[ "$MODE" == "binary" ]] || ([[ "$MODE" == "auto" ]] && [[ "$INSTALL_TYPE" == "" ]]); then
  if [[ -f "$RELEASE_BIN" ]]; then
    INSTALL_TYPE="binary"
    ARTIFACT="$RELEASE_BIN"
    ok "Release binary found at ${DIM}${RELEASE_BIN}${RESET}"
  else
    warn "No prebuilt artifact found — auto-building from source"
    info "(use  ./install.sh --build  to skip this prompt next time)"
    step "Building Orbit from source"
    info "Building frontend…"
    cd "${SCRIPT_DIR}/frontend" && npm install --silent && npm run build 2>&1 | tail -3
    info "Building Rust binary (release)… this can take several minutes"
    cd "${SCRIPT_DIR}/src-tauri" && cargo build --release 2>&1 | grep -E "^error|Compiling orbit|Finished" || true
    cd "${SCRIPT_DIR}"
    if [[ -f "$RELEASE_BIN" ]]; then
      INSTALL_TYPE="binary"
      ARTIFACT="$RELEASE_BIN"
      ok "Build complete → ${DIM}${RELEASE_BIN}${RESET}"
    else
      die "Build finished but binary not found at ${RELEASE_BIN}"
    fi
  fi
fi

# ── Create directories ────────────────────────────────────
step "Creating directories"

for dir in "$BIN_DIR" "$APPS_DIR" \
           "${ICONS_DIR}/32x32/apps" \
           "${ICONS_DIR}/128x128/apps" \
           "${ICONS_DIR}/256x256/apps" \
           "${ICONS_DIR}/512x512/apps" \
           "$DATA_DIR"; do
  mkdir -p "$dir"
done
ok "Directories ready"

# ── Install binary / AppImage ─────────────────────────────
step "Installing executable"

DEST_EXEC="${BIN_DIR}/${BIN_NAME}"

if [[ "$INSTALL_TYPE" == "appimage" ]]; then
  cp "$ARTIFACT" "${DATA_DIR}/${APPIMAGE_NAME}"
  chmod +x "${DATA_DIR}/${APPIMAGE_NAME}"
  ln -sf "${DATA_DIR}/${APPIMAGE_NAME}" "$DEST_EXEC"
  ok "AppImage installed → ${DIM}${DATA_DIR}/${APPIMAGE_NAME}${RESET}"
  ok "Symlink created  → ${DIM}${DEST_EXEC}${RESET}"
elif [[ "$LINK" == 1 ]]; then
  rm -f "$DEST_EXEC"
  ln -s "$ARTIFACT" "$DEST_EXEC"
  ok "Symlink created   → ${DIM}${DEST_EXEC}${RESET}"
  info "Tracking ${DIM}${ARTIFACT}${RESET}"
  info "Future ${BOLD}cargo build --release${RESET} runs are picked up on next launch."
else
  install -m 755 "$ARTIFACT" "$DEST_EXEC"
  ok "Binary installed → ${DIM}${DEST_EXEC}${RESET}"
fi

# ── Install icons ─────────────────────────────────────────
step "Installing icons"

ICON_SRC="${SCRIPT_DIR}/src-tauri/icons"
for size in 32 128 256 512; do
  src="${ICON_SRC}/${size}x${size}.png"
  dst="${ICONS_DIR}/${size}x${size}/apps/${APP_NAME}.png"
  if [[ -f "$src" ]]; then
    cp "$src" "$dst"
    ok "${size}×${size} icon installed"
  else
    warn "Icon ${size}x${size}.png not found — skipping"
  fi
done

# ── Create desktop entry ──────────────────────────────────
step "Creating desktop entry"

cat > "${APPS_DIR}/${APP_NAME}.desktop" << DESKTOP
[Desktop Entry]
Name=Orbit
GenericName=File Intelligence IDE
Comment=Graph-first file and project explorer
Exec=${DEST_EXEC} %F
Icon=${APP_NAME}
Type=Application
Terminal=false
Categories=System;FileTools;FileManager;Development;IDE;
StartupNotify=true
StartupWMClass=orbit
MimeType=inode/directory;
Keywords=file;manager;graph;ide;code;explorer;orbit;
Actions=NewWindow;

[Desktop Action NewWindow]
Name=Open New Window
Exec=${DEST_EXEC}
DESKTOP

ok "Desktop entry written → ${DIM}${APPS_DIR}/${APP_NAME}.desktop${RESET}"

# ── Refresh caches ─────────────────────────────────────────
step "Refreshing system caches"

if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f -t "${ICONS_DIR}" 2>/dev/null && ok "Icon cache updated" || true
fi
if command -v update-icon-caches &>/dev/null; then
  update-icon-caches "${ICONS_DIR}" 2>/dev/null || true
fi
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "${APPS_DIR}" 2>/dev/null && ok "Desktop database updated" || true
fi

# ── PATH hint ─────────────────────────────────────────────
PATH_OK=0
if echo "${PATH}" | grep -q "${BIN_DIR}"; then PATH_OK=1; fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓  Orbit installed successfully!${RESET}"
echo ""
echo -e "  Launch from your app menu by searching ${BOLD}Orbit${RESET}"
echo -e "  or run from the terminal:"
echo ""
if [[ "$PATH_OK" == 0 ]]; then
  echo -e "  ${YELLOW}⚠  ${BIN_DIR} is not in your PATH${RESET}"
  echo -e "  Add this to your shell config:"
  echo -e "  ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
  echo ""
fi
echo -e "  ${BOLD}${CYAN}orbit${RESET}  [path]"
echo ""
echo -e "  To uninstall:  ${DIM}./uninstall.sh${RESET}"
echo ""
