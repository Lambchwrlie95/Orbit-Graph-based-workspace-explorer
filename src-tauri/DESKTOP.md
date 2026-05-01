# Desktop Entry Installation

This directory contains desktop integration files for Orbit.

## Files

- `orbit.desktop` - Desktop entry for the application
- `orbit-folder.desktop` - Context menu entry for folders
- `icons/` - Application icons in various sizes

## Installing Desktop Entry

### Quick Install (Recommended)

Run the install script from the project root:

```bash
./scripts/install-desktop-entry.sh
```

This will:
- Install the desktop entry to `~/.local/share/applications/`
- Install icons to `~/.local/share/icons/hicolor/`
- Create a symlink at `~/.local/bin/orbit`
- Update icon cache and desktop database

### Manual Install

1. Copy the desktop file:
   ```bash
   cp src-tauri/orbit.desktop ~/.local/share/applications/
   ```

2. Install icons:
   ```bash
   mkdir -p ~/.local/share/icons/hicolor/{32x32,128x128,256x256,512x512}/apps
   cp src-tauri/icons/32x32.png ~/.local/share/icons/hicolor/32x32/apps/orbit.png
   cp src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/orbit.png
   cp src-tauri/icons/256x256.png ~/.local/share/icons/hicolor/256x256/apps/orbit.png
   cp src-tauri/icons/512x512.png ~/.local/share/icons/hicolor/512x512/apps/orbit.png
   ```

3. Update databases:
   ```bash
   update-desktop-database ~/.local/share/applications/
   gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor/
   ```

## Building App Bundles

To create distributable packages:

```bash
cd src-tauri
cargo tauri build
```

This creates:
- `.AppImage` - Portable Linux application
- `.deb` - Debian/Ubuntu package
- `.rpm` - Fedora/RHEL package

## Icons

The source icon was converted from the provided logo image to standard sizes:
- 32x32 - Small icons, notifications
- 128x128 - Medium icons, menus
- 256x256 - Large icons, high-DPI displays
- 512x512 - Very large icons, about dialogs

All icons maintain the same visual appearance at different resolutions.
