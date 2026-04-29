---
phase: 5
plan: 05
name: Packaging & Desktop Integration
milestone: v2.0
status: planning
dependencies: [04-02]
requirements: [PKG-01, PKG-02, PKG-03, PKG-04]
---

# Phase 5: Packaging & Desktop Integration

## Phase Overview

Phase 5 transforms Orbit from a development project into a proper Linux desktop application. This phase focuses on packaging the application so users can discover, install, and launch Orbit like any other native application.

## Phase Goal

Orbit is installable and launchable on Linux with proper desktop integration, including application menu entries, right-click folder integration, and AppImage packaging.

## Dependencies

- **Phase 4 Complete** — Performance guardrails must be in place
- **Tauri build working** — `cargo tauri build` must succeed
- **Functional application** — Core v1.0 features must work

## Plan Structure

| Plan | Objective | Requirements | Wave |
|------|-----------|--------------|------|
| 05-01 | Desktop entries, icons, and Linux integration | PKG-01, PKG-02, PKG-04 | 1 |
| 05-02 | AppImage packaging, build scripts, and distribution | PKG-03 | 2 |

## Wave Structure

```
Wave 1: Desktop Integration (05-01)
  - Icon assets at all required sizes
  - Desktop entry files (.desktop)
  - Tauri icon configuration
  
Wave 2: AppImage Packaging (05-02)
  - Tauri bundle configuration
  - AppImage build process
  - Distribution setup
```

## Cross-Cutting Concerns

### Icon Assets
- Icons must be available at: 16x16, 32x32, 48x48, 128x128, 256x256, 512x512
- SVG source for scalable rendering
- Consistent visual identity across all sizes

### Desktop Entry Standards
- Follow freedesktop.org Desktop Entry Specification
- Proper Categories for app menu placement
- MIME type associations for folder integration
- Startup notification support

### Build Integration
- Icons must be in `src-tauri/icons/` before build
- Desktop template referenced in `tauri.conf.json`
- Build scripts should validate icon presence

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Icon generation at multiple sizes | Medium | Low | Use ImageMagick or provide source files |
| Desktop entry path differences across distros | Low | Medium | Follow XDG spec, test on Ubuntu/Fedora |
| AppImage runtime dependencies | Medium | Medium | Use Tauri's built-in bundler, test on clean VM |
| MIME association conflicts | Low | Low | Use standard inode/directory type |

## Success Criteria

1. ✅ User can find Orbit in the application menu (PKG-01)
2. ✅ User can right-click a folder and select "Open in Orbit" (PKG-02)
3. ✅ AppImage builds successfully via Tauri (PKG-03)
4. ✅ Orbit displays proper icon in taskbar and app menu (PKG-04)
5. ✅ Desktop entries follow FreeDesktop specifications
6. ✅ Uninstallation leaves no orphaned desktop files

## Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Phase Plan | `.planning/phases/05-packaging/05-PLAN.md` | This document |
| Plan 05-01 | `.planning/phases/05-packaging/05-01-PLAN.md` | Desktop entries |
| Plan 05-02 | `.planning/phases/05-packaging/05-02-PLAN.md` | AppImage packaging |
| Icons | `src-tauri/icons/` | Application icons |
| Desktop Entry | `src-tauri/orbit.desktop` | Main app launcher |
| Folder Entry | `src-tauri/orbit-folder.desktop` | Folder context menu |

## Timeline

- **Wave 1**: Desktop entries and icons — Estimated 1 session
- **Wave 2**: AppImage configuration — Estimated 1 session
- **Total**: 2 sessions for complete Phase 5

## Completion Definition

Phase 5 is complete when:
- All 2 plans are executed and verified
- AppImage can be built with `cargo tauri build`
- Desktop entries are properly configured
- Application appears in system menus with correct icon
- Right-click folder integration works

---
*Phase plan created: 2026-04-29*
*Milestone: v2.0 — Desktop Experience*
