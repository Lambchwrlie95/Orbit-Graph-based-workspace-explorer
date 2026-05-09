#!/bin/bash
# DEPRECATED: prefer the top-level ./install.sh which builds + installs
# everything in one pass and is the script ./uninstall.sh mirrors.
# This helper is kept for older docs/links that referenced it.

set -e
echo "Note: ./install.sh at the repo root is the canonical installer." >&2
echo "      This helper only writes the .desktop entry + icons (no build)." >&2
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="orbit"

# Installation directories
LOCAL_APPS="$HOME/.local/share/applications"
LOCAL_ICONS="$HOME/.local/share/icons/hicolor"

# Build path to executable
EXECUTABLE="$PROJECT_DIR/src-tauri/target/release/orbit"

# Check if executable exists
if [ ! -f "$EXECUTABLE" ]; then
    echo "⚠️  Warning: Executable not found at $EXECUTABLE"
    echo "   Please build the app first with: cargo build --release"
    echo "   Continuing with installation anyway..."
fi

# Create directories
echo "Creating directories..."
mkdir -p "$LOCAL_APPS"
mkdir -p "$LOCAL_ICONS/32x32/apps"
mkdir -p "$LOCAL_ICONS/128x128/apps"
mkdir -p "$LOCAL_ICONS/256x256/apps"
mkdir -p "$LOCAL_ICONS/512x512/apps"

# Copy icons
echo "Installing icons..."
cp "$PROJECT_DIR/src-tauri/icons/32x32.png" "$LOCAL_ICONS/32x32/apps/$APP_NAME.png"
cp "$PROJECT_DIR/src-tauri/icons/128x128.png" "$LOCAL_ICONS/128x128/apps/$APP_NAME.png"
cp "$PROJECT_DIR/src-tauri/icons/256x256.png" "$LOCAL_ICONS/256x256/apps/$APP_NAME.png"
cp "$PROJECT_DIR/src-tauri/icons/512x512.png" "$LOCAL_ICONS/512x512/apps/$APP_NAME.png"

# Create desktop entry with correct path
echo "Creating desktop entry..."
cat > "$LOCAL_APPS/$APP_NAME.desktop" << EOF
[Desktop Entry]
Name=Orbit
Comment=Graph-first file intelligence IDE
Exec=$EXECUTABLE %F
Icon=$APP_NAME
Type=Application
Terminal=false
Categories=System;FileTools;FileManager;
StartupNotify=true
StartupWMClass=orbit
MimeType=inode/directory;
Keywords=file;manager;graph;ide;code;explorer;
Actions=NewWindow;

[Desktop Action NewWindow]
Name=Open New Window
Exec=$EXECUTABLE
EOF

# Update icon cache
echo "Updating icon cache..."
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -f -t "$LOCAL_ICONS" 2>/dev/null || true
fi
if command -v update-icon-caches &> /dev/null; then
    update-icon-caches "$LOCAL_ICONS" 2>/dev/null || true
fi

# Update desktop database
echo "Updating desktop database..."
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$LOCAL_APPS" 2>/dev/null || true
fi

echo ""
echo "✅ Orbit desktop entry installed successfully!"
echo ""
echo "To launch Orbit:"
echo "  - From app launcher/menu: Search for 'Orbit'"
echo "  - From terminal: orbit"
echo ""
echo "If the app doesn't appear immediately, try running:"
echo "  killall -SIGUSR1 plasmashell  # For KDE Plasma"
echo "  # or restart your session"
echo ""

# Also copy to user applications folder for GUI installers
if [ -d "$HOME/Applications" ]; then
    cp "$PROJECT_DIR/src-tauri/icons/512x512.png" "$HOME/Applications/orbit.png" 2>/dev/null || true
fi
