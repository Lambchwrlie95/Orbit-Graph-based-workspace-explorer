#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════╗
# ║             Orbit — Install Script                     ║
# ║  Graph-first file intelligence IDE                     ║
# ║  Builds from source (Arch / pacman -S style workflow)  ║
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
die()  { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}◆${RESET} ${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="orbit"
BIN_NAME="orbit"

WANTS_HELP=0
for arg in "$@"; do
  case "$arg" in
    --help|-h) WANTS_HELP=1 ;;
  esac
done

DESKTOP_IDS=(
  "orbit.desktop"
  "orbit-folder.desktop"
  "orbit-dev.desktop"
  "Orbit.desktop"
  "local.orbit.file-intelligence.desktop"
)

# Re-launch in a terminal when triggered from a file manager so the user sees
# build output instead of the script silently dying with `set -e`.
if [[ "$WANTS_HELP" == 0 ]] && [ ! -t 1 ] && [ -z "${ORBIT_INSTALL_TTY:-}" ]; then
  for term in alacritty kitty ghostty foot wezterm gnome-terminal konsole xterm; do
    if command -v "$term" >/dev/null 2>&1; then
      export ORBIT_INSTALL_TTY=1
      case "$term" in
        gnome-terminal) exec "$term" -- bash "$0" "$@" ;;
        konsole)        exec "$term" -e bash "$0" "$@" ;;
        *)              exec "$term" -e bash "$0" "$@" ;;
      esac
    fi
  done
fi

BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor"
DATA_DIR="${HOME}/.local/share/orbit"

RELEASE_BIN="${SCRIPT_DIR}/src-tauri/target/release/${BIN_NAME}"

# ── Banner ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╭─────────────────────────────────────────╮"
echo "  │  ⬡  Orbit  ·  File Intelligence IDE    │"
echo "  ╰─────────────────────────────────────────╯"
echo -e "${RESET}"

# ── Args ─────────────────────────────────────────────────
LINK=0
SKIP_BUILD=0
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --link|--dev)  LINK=1 ;;
    --skip-build)  SKIP_BUILD=1 ;;
    --no-build)    NO_BUILD=1; SKIP_BUILD=1 ;;
    --help|-h)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "  Builds Orbit from source (frontend + cargo --release) and"
      echo "  installs it to your user prefix (\$HOME/.local). No AppImage,"
      echo "  no system files. Re-running re-builds incrementally and"
      echo "  re-installs in place."
      echo ""
      echo "Options:"
      echo "  --link, --dev    Symlink the release binary instead of copying."
      echo "                   Future cargo --release builds are picked up"
      echo "                   on next launch — no reinstall needed."
      echo "  --skip-build     Use whatever is already in target/release."
      echo "  --no-build       Same as --skip-build (stricter — fail if"
      echo "                   the binary is missing)."
      echo "  --help, -h       Show this help"
      echo ""
      echo "Files written:"
      echo "  ${BIN_DIR}/${BIN_NAME}           ← binary or symlink"
      echo "  ${APPS_DIR}/${APP_NAME}.desktop"
      echo "  ${ICONS_DIR}/<size>/apps/${APP_NAME}.png"
      echo ""
      echo "Uninstall: ./uninstall.sh   (wipes everything by default)"
      exit 0
      ;;
  esac
done

# ── Prerequisites ────────────────────────────────────────
step "Checking prerequisites"

REQ_OK=1
require() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found"
  else
    warn "$1 missing — $2"
    REQ_OK=0
  fi
}

if [[ "$SKIP_BUILD" == 0 ]]; then
  require cargo "install rustup (https://rustup.rs/) then 'rustup default stable'"
  require node  "install via your package manager (e.g. pacman -S nodejs npm)"
  require npm   "ships with node — re-check your nodejs install"
  require pkg-config "needed by Tauri build (pacman -S pkgconf)"
  if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
    warn "webkit2gtk-4.1 missing — install with: pacman -S webkit2gtk-4.1"
    REQ_OK=0
  else
    ok "webkit2gtk found"
  fi
  if [[ "$REQ_OK" == 0 ]]; then
    die "Missing build prerequisites. Install them and re-run, or use --skip-build."
  fi
else
  ok "Build skipped — using existing binary"
fi

# ── Build from source ────────────────────────────────────
if [[ "$SKIP_BUILD" == 0 ]]; then
  step "Building frontend"
  cd "${SCRIPT_DIR}/frontend"
  if [[ ! -d node_modules ]]; then
    info "Installing frontend deps (npm install)…"
    npm install --silent
  fi
  npm run build 2>&1 | tail -3
  ok "Frontend bundled → ${DIM}frontend/dist/${RESET}"

  step "Building Rust binary (release) — first build can take several minutes"
  cd "${SCRIPT_DIR}/src-tauri"
  # Stream cargo output so the user sees progress on long compiles
  cargo build --release 2>&1 | grep -E "^(error|warning: unused|   Compiling orbit|   Compiling tauri|    Finished)" || true
  if [[ ! -f "$RELEASE_BIN" ]]; then
    die "Build finished but binary not found at ${RELEASE_BIN}"
  fi
  ok "Built → ${DIM}${RELEASE_BIN}${RESET}"
  cd "${SCRIPT_DIR}"
elif [[ "$NO_BUILD" == 1 ]] && [[ ! -f "$RELEASE_BIN" ]]; then
  die "--no-build set but ${RELEASE_BIN} doesn't exist."
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

# ── Install binary ───────────────────────────────────────
step "Installing executable"
DEST_EXEC="${BIN_DIR}/${BIN_NAME}"
rm -f "$DEST_EXEC"
if [[ "$LINK" == 1 ]]; then
  ln -s "$RELEASE_BIN" "$DEST_EXEC"
  ok "Symlink → ${DIM}${DEST_EXEC} → ${RELEASE_BIN}${RESET}"
  info "Future ${BOLD}cargo build --release${RESET} runs are picked up automatically."
else
  install -m 755 "$RELEASE_BIN" "$DEST_EXEC"
  ok "Binary installed → ${DIM}${DEST_EXEC}${RESET}"
fi

# ── Install icons ────────────────────────────────────────
step "Installing icons"
ICON_SRC="${SCRIPT_DIR}/src-tauri/icons"
for size in 32 128 256 512; do
  src="${ICON_SRC}/${size}x${size}.png"
  dst="${ICONS_DIR}/${size}x${size}/apps/${APP_NAME}.png"
  if [[ -f "$src" ]]; then
    cp "$src" "$dst"
    ok "${size}×${size} icon installed"
  else
    warn "Icon ${size}x${size}.png missing — skipping"
  fi
done

# ── Desktop entry ────────────────────────────────────────
step "Creating desktop entry"
for desktop_id in "${DESKTOP_IDS[@]}"; do
  desktop_path="${APPS_DIR}/${desktop_id}"
  if [[ "$desktop_id" != "${APP_NAME}.desktop" && -e "$desktop_path" ]]; then
    rm -f "$desktop_path"
    ok "Removed stale launcher ${DIM}${desktop_path}${RESET}"
  fi
done

cat > "${APPS_DIR}/${APP_NAME}.desktop" << DESKTOP
[Desktop Entry]
Name=Orbit
GenericName=File Intelligence IDE
Comment=Graph-first file and project explorer
Exec=${DEST_EXEC} %F
Icon=${APP_NAME}
Type=Application
Terminal=false
Categories=System;FileTools;FileManager;
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

# ── Refresh caches ───────────────────────────────────────
step "Refreshing system caches"
if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f -t "${ICONS_DIR}" 2>/dev/null && ok "Icon cache updated" || true
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

# ── PATH hint ────────────────────────────────────────────
PATH_OK=0
echo "${PATH}" | grep -q "${BIN_DIR}" && PATH_OK=1

# ── Done ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓  Orbit installed.${RESET}"
echo ""
echo -e "  Launch from your app menu (search ${BOLD}Orbit${RESET}) or run:"
echo -e "    ${BOLD}${CYAN}orbit${RESET}  [path]"
echo ""
if [[ "$PATH_OK" == 0 ]]; then
  echo -e "  ${YELLOW}⚠  ${BIN_DIR} is not in your \$PATH${RESET}"
  echo -e "  Add this to your shell config:"
  echo -e "  ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
  echo ""
fi
echo -e "  Uninstall (full wipe — pacman -Rns style):"
echo -e "    ${DIM}./uninstall.sh${RESET}"
echo ""

if [ -n "${ORBIT_INSTALL_TTY:-}" ] && [ -t 0 ]; then
  printf "  Press Enter to close this window…"
  read -r _ || true
fi
