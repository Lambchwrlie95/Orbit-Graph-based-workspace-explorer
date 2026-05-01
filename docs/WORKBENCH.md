# Orbit Workbench

Updated: 2026-05-01

Orbit's app shell is graph-first. The center pane belongs to the graph; file browsing, search, asset browsing, inspection, and code editing are side-panel tools around that graph.

## Layout Contract

- Top menu: thin desktop-style menu inspired by `graph-file-manager`, with File, View, Run, and Panels popovers.
- Left sidebar: Explorer, Search, Assets, and Status.
- Center pane: Graph only.
- Right sidebar: Inspector and Code.
- Bottom status bar: active graph state, active left panel, status, selection, cache, and log path.

## Routing Rules

- Explorer, Search, Assets, and Status must never replace the center graph.
- Code opens in the right sidebar Code tab.
- File and folder selection opens the right Inspector unless explicitly opening externally.
- Folder focus from graph nodes opens the Explorer left sidebar and keeps the center graph visible.
- Search folder open routes to the Explorer left sidebar.
- Preview, code analysis, and image analysis live in the right Inspector.

## Bookmarks

- Workspace bookmarks use localStorage key `orbit:bookmarks`.
- The list is capped at 12 entries.
- UI labels use the basename only; full paths stay stored internally for opening but are not rendered in bookmark rows or tooltips.
- Opening a bookmark switches the active workspace and returns the left sidebar to Explorer.

## Preview And Analysis

- Text/code preview renders line-numbered rows in the right Inspector.
- Image preview renders in the right Inspector.
- Image analysis shows dimensions, aspect ratio, format, file size, and dominant colors.
- Dominant color chips copy their hex value when clicked.
- Code analysis shows imports, exports, git status, and related files when available.

## Command Boundary

- Frontend Tauri calls go through `frontend/src/lib/tauriCommands.ts`.
- `TAURI_COMMANDS` must stay aligned with `tauri::generate_handler![...]` in `src-tauri/src/main.rs`.
- Command argument and result types live in the frontend type layer so command names, payloads, and result shapes are checked by TypeScript before runtime.
- Run `npm run commands:check` after adding or removing a Tauri command.

## Current Gaps

- Markdown split preview, heading outline, links, and backlinks are still pending.
- Similar-image grouping is still pending beyond thumbnail schema groundwork.
- Baseline browser smoke coverage exists for the workbench shell.
- Deeper smoke coverage is still needed for menu actions, bookmark persistence, graph selection routing, scan/load with real data, image commands, and code editor save flows.

## Verification

Current verified baseline after the workbench refactor and command-boundary pass:

```bash
npm run commands:check
npm run frontend:smoke
npm run frontend:build
cargo test
cargo clippy --all-targets -- -D warnings
```

A 1440x900 headless Chromium screenshot was also checked manually to confirm the top menu, left sidebar, graph-only center, right sidebar, and bottom status bar render together.
