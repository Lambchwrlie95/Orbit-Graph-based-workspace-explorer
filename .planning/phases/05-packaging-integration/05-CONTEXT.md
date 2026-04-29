# Phase 5: Packaging & Desktop Integration

**Phase**: 5  
**Milestone**: v2.0 — Desktop Experience  
**Status**: Planning  
**Dependencies**: Phase 4 (Complete)

---

## Purpose

Phase 5 transforms Orbit from a development project into a proper desktop application that users can discover, install, and launch like any other Linux application. This phase establishes the packaging foundation and desktop integration that makes Orbit feel native to the Linux desktop environment.

---

## Scope

### In Scope

1. **Desktop Entry Files** — Create/update two `.desktop` files:
   - Main application entry (opens Orbit)
   - Quick-launcher entry (opens Orbit to a specific folder)

2. **AppImage Packaging Setup** — Configure Tauri for AppImage bundling:
   - AppImage configuration
   - Icon assets at required sizes
   - Category and metadata

3. **Icon Assets** — Generate/provide icons:
   - 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 PNGs
   - SVG source for scalable icon
   - Desktop icon integration

4. **Linux Integration** — Ensure proper desktop behavior:
   - Correct Exec path
   - MIME type associations (optional v2.1)
   - Startup notification
   - Window class matching

### Out of Scope (Deferred)

- DEB/RPM packaging (can be added post-v2.0)
- Flatpak/Snap packaging (community can contribute)
- macOS/Windows packaging (future milestones)
- App store submissions

---

## Desktop Entry Requirements

### Entry 1: Main Application

```
File: /usr/share/applications/orbit.desktop
Name: Orbit
Comment: Graph-first file intelligence IDE
Exec: /usr/bin/orbit
Icon: orbit
Type: Application
Categories: System;FileTools;FileManager;Development;
StartupNotify: true
Terminal: false
MimeType: inode/directory;
```

### Entry 2: Quick Launcher (Open Folder in Orbit)

```
File: /usr/share/applications/orbit-folder.desktop
Name: Open Folder in Orbit
Comment: Open selected folder in Orbit
Exec: /usr/bin/orbit --folder %f
Icon: orbit
Type: Application
Categories: System;FileTools;FileManager;Development;
Terminal: false
MimeType: inode/directory;
NoDisplay: true  # Don't show in main app menu
```

---

## AppImage Packaging

### Tauri Configuration

```json
{
  "tauri": {
    "bundle": {
      "targets": ["appimage"],
      "category": "System",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "deb": {
        "desktopTemplate": "./src-tauri/orbit.desktop"
      }
    }
  }
}
```

### Build Requirements

- Linux host with `appimagetool` or Tauri bundle command
- Icons in `src-tauri/icons/`
- Desktop template file
- Category and metadata configuration

---

## User Decisions Required

None — Phase 5 implements standard Linux desktop integration patterns.

---

## Dependencies & Pre-requisites

- **Phase 1-4 Complete**: Application must be functional before packaging
- **Tauri build configured**: `cargo tauri build` must work
- **Icon design**: Need a recognizable Orbit icon

---

## Success Criteria

1. **Desktop Entry Works**: User can find Orbit in application menu
2. **Launch Works**: Clicking Orbit opens the application
3. **Folder Integration**: Right-clicking a folder shows "Open in Orbit" option
4. **AppImage Builds**: `cargo tauri build` produces working AppImage
5. **Icon Displays**: Orbit has proper icon in taskbar/app menu
6. **Categories Correct**: Orbit appears in System/Development/File Manager categories

---

## Artifacts

- `src-tauri/icons/` — Icon files at all required sizes
- `src-tauri/orbit.desktop` — Main desktop entry template
- `src-tauri/orbit-folder.desktop` — Quick-launcher desktop entry
- Updated `tauri.conf.json` — Bundle configuration
- `.planning/phases/05-packaging-integration/05-CONTEXT.md` — This document

---

## Research Notes

### Desktop Entry Spec

Reference: https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html

Key fields:
- `Name`: Display name
- `Exec`: Command to execute
- `Icon`: Icon name (searched in icon paths)
- `Type`: Must be `Application`
- `Categories`: Semicolon-separated list
- `StartupNotify`: Show busy cursor during launch
- `MimeType`: File types this app can open
- `NoDisplay`: Don't show in menus (for secondary entries)

### AppImage Best Practices

- Single file, no installation required
- Must include all dependencies
- Update mechanism via AppImageUpdate (optional)
- Desktop integration via appimaged (user-side)

### Tauri Bundle Targets

```bash
# Build AppImage
cargo tauri build --target x86_64-unknown-linux-gnu

# Output: src-tauri/target/release/bundle/appimage/orbit_*.AppImage
```

---

## Phase 5 Plan Structure

### Plan 05-01: Icon Assets and Desktop Entries
- Create icon assets at all required sizes
- Design/provide SVG source
- Create main `.desktop` entry
- Create folder quick-launcher entry
- Test desktop entries locally

### Plan 05-02: AppImage Packaging Configuration
- Configure Tauri bundle settings
- Test AppImage build process
- Verify AppImage runs correctly
- Document build process

---

*Phase 5 Context created: 2026-04-29*  
*Milestone: v2.0 — Desktop Experience*
