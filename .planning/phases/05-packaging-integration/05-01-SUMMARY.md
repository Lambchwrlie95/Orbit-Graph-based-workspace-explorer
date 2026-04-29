---
phase: 5
plan: 05-01
name: Desktop Entries and Linux Integration
subsystem: packaging
tags: [linux, desktop-integration, icons, packaging]
requires: []
provides: [PKG-01, PKG-02, PKG-04]
affects: [src-tauri/icons/, src-tauri/tauri.conf.json]
tech-stack:
  added: [ImageMagick, freedesktop.org Desktop Entry]
  patterns: [multi-size icons, desktop entry templates]
key-files:
  created:
    - src-tauri/icons/32x32.png
    - src-tauri/icons/128x128.png
    - src-tauri/icons/128x128@2x.png
    - src-tauri/icons/256x256.png
    - src-tauri/icons/512x512.png
    - src-tauri/orbit.desktop
    - src-tauri/orbit-folder.desktop
    - scripts/generate-icons.sh
  modified:
    - src-tauri/tauri.conf.json
decisions:
  - "Use standard Tauri icon naming convention for compatibility"
  - "Include all icon sizes from 32x32 to 512x512 for optimal display"
  - "Create separate desktop entry for folder quick-launcher (NoDisplay=true)"
  - "Support ImageMagick v6/v7 via 'convert' and v7+ via 'magick convert'"
  - "Add appimage target as primary distribution format"
metrics:
  duration: "23 minutes"
  completed: "2026-04-29"
  tasks: 5
  files_created: 8
  files_modified: 1
---

# Phase 5 Plan 05-01: Desktop Entries and Linux Integration Summary

## Overview

Created icon assets and desktop entry files to enable proper Linux desktop integration for Orbit, making it discoverable and launchable as a native Linux application.

## What Was Built

### Icon Assets (6 files)

| Size | File | Purpose |
|------|------|---------|
| 32x32 | `icons/32x32.png` | Menu items, small toolbars |
| 128x128 | `icons/128x128.png` | Standard application icon |
| 256x256 | `icons/128x128@2x.png` | High DPI displays (2x) |
| 256x256 | `icons/256x256.png` | Large displays, app stores |
| 512x512 | `icons/512x512.png` | Maximum quality source |
| 128x128 | `icons/icon.png` | Tauri default/fallback |

All icons generated from the existing `icon.png` using ImageMagick.

### Desktop Entry Files (2 files)

#### Main Entry: `src-tauri/orbit.desktop`
- **Name**: Orbit
- **Purpose**: Primary application menu entry
- **Exec**: `orbit %F` (accepts files/folders)
- **Categories**: System;FileTools;FileManager;Development;IDE
- **Features**:
  - StartupWMClass for taskbar grouping
  - MimeType support for directories
  - Keywords for launcher search
  - Startup notification

#### Folder Launcher: `src-tauri/orbit-folder.desktop`
- **Name**: Open Folder in Orbit
- **Purpose**: Right-click context menu for folders
- **Exec**: `orbit --folder %f`
- **Key attributes**:
  - `NoDisplay=true` (hidden from main menu)
  - `OnlyShowIn` restricts to major desktop environments
  - Specific to `inode/directory` MIME type

### Icon Generation Script: `scripts/generate-icons.sh`

Reproducible script for regenerating icons from any source image:
- Auto-detects ImageMagick version (v6/v7 via `convert`, v7+ via `magick`)
- Generates all required sizes
- Provides clear error messages and platform guidance
- Usage: `./scripts/generate-icons.sh [source-icon.png]`

### Tauri Configuration Updates

Updated `src-tauri/tauri.conf.json` bundle section:
- Added `appimage` target alongside `deb` and `rpm`
- Expanded icon list to include all generated sizes
- Added `category: "System"` for package manager categorization
- Added `shortDescription` and `longDescription`
- Configured `desktopTemplate` for DEB and RPM packages

## Requirements Fulfilled

| Requirement | Status | Notes |
|-------------|--------|-------|
| PKG-01 | ✅ | Icon assets at all required sizes |
| PKG-02 | ✅ | Main desktop entry with proper fields |
| PKG-04 | ✅ | Folder quick-launcher with NoDisplay |

## Technical Details

### Icon Naming Convention
Following Tauri defaults ensures compatibility:
- `32x32.png` - Toolbar/menu size
- `128x128.png` - Standard application size
- `128x128@2x.png` - High DPI variant (256x256 source)
- `icon.png` - Default fallback (128x128 copy)

### Desktop Entry Specification
Both entries follow freedesktop.org Desktop Entry Specification:
- Version 1.4+ compliant
- Proper MIME type associations
- Category-based menu placement
- Desktop environment hints (OnlyShowIn)

### Build Integration
The configuration enables:
1. **AppImage**: Automatic .desktop integration
2. **DEB**: desktopTemplate references `orbit.desktop`
3. **RPM**: desktopTemplate references `orbit.desktop`

## Commits

| Commit | Task | Description |
|--------|------|-------------|
| `b3391ff` | Task 1 | Generate icon assets at all required sizes |
| `83a40df` | Task 2 | Create main desktop entry file |
| `1dd671e` | Task 3 | Create folder quick-launcher desktop entry |
| `6e575f3` | Task 4 | Update Tauri configuration for Linux packaging |
| `31e4904` | Task 5 | Create icon generation script for future updates |

## Verification

All verification steps passed:
- ✅ 6 PNG icon files generated (32x32 through 512x512)
- ✅ Desktop entry contains required fields (Name, Exec, Icon, Categories, MimeType)
- ✅ Folder entry has NoDisplay=true and proper Exec command
- ✅ Tauri config includes appimage, all icons, and desktop template
- ✅ Icon generation script is executable and properly structured

## Deviations from Plan

None. All tasks executed exactly as specified in the plan.

## Future Considerations

1. **Custom Icon Design**: Current icons are resized from placeholder. A custom-designed icon set would improve branding.
2. **SVG Icon**: Consider adding `icons/icon.svg` for scalable display.
3. **Windows/macOS Icons**: Future plans may need `.ico` and `.icns` formats.
4. **Desktop Entry Validation**: Can use `desktop-file-validate` (desktop-file-utils package) for stricter validation.

## Self-Check: PASSED

- [x] All created files exist and are tracked in git
- [x] All commits present with proper messages
- [x] Icon files in src-tauri/icons/ (6 PNG files)
- [x] Desktop entries in src-tauri/ (2 .desktop files)
- [x] Icon generation script in scripts/ (executable)
- [x] Tauri configuration updated with bundle settings
