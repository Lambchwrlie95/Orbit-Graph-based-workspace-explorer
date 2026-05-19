# Orbit — graph-native wiki for the filesystem
# Run `just` (no args) to list every recipe.

set shell := ["bash", "-cu"]

_default:
    @just --list --unsorted

# ── Dev ───────────────────────────────────────────────────────────────

# Launch Tauri dev (Wayland)
dev:
    npm run dev

# Launch Tauri dev (X11 fallback)
dev-x11:
    npm run dev:x11

# Vite dev server only (no Tauri shell) — http://127.0.0.1:1420
frontend-dev:
    npm run frontend:dev

# ── Build ─────────────────────────────────────────────────────────────

# Production frontend build (tsc + Vite)
build:
    npm run frontend:build

# Full Tauri release build (frontend + Rust)
build-tauri:
    npm run tauri:build

# AppImage (release)
appimage:
    npm run build:appimage

# AppImage (debug build, faster compile)
appimage-debug:
    npm run build:appimage:debug

# AppImage from a clean target/ tree
appimage-clean:
    npm run build:appimage:clean

# ── Verify ────────────────────────────────────────────────────────────

# Type-check + production build (the "is it green?" gate)
check: commands-check build smoke

# Confirm frontend TAURI_COMMANDS matches Rust generate_handler!
commands-check:
    npm run commands:check

# Headless Chromium smoke — does the workbench shell render?
smoke:
    npm run frontend:smoke

# Cargo clippy with warnings as errors
clippy:
    cd src-tauri && cargo clippy --all-targets -- -D warnings

# Cargo unit tests
test:
    cd src-tauri && cargo test

# Cargo compile-only (no link)
cargo-check:
    cd src-tauri && cargo check

# ── Install / packaging ───────────────────────────────────────────────

# Install dev desktop entry so Orbit shows up in app launchers
install-desktop:
    ./scripts/install-desktop-entry.sh

# Regenerate app icons from source SVG
icons:
    ./scripts/generate-icons.sh

# ── Housekeeping ──────────────────────────────────────────────────────

# Install / refresh frontend deps
install:
    npm install --prefix frontend
    npm install

# Wipe build outputs (keeps node_modules)
clean:
    rm -rf frontend/dist
    cd src-tauri && cargo clean

# Tail Orbit's runtime log
log:
    tail -f ~/.local/share/orbit/app.log

# Open the SQLite index in the default app
open-db:
    xdg-open ~/.local/share/orbit/orbit.db
