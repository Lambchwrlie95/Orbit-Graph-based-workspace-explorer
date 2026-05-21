#!/usr/bin/env bash
# Install Orbit's Omarchy theme template (Method A from the omarchy docs).
#
# After installing, run `omarchy theme set <current-theme>` to regenerate
# everything, then verify ~/.config/omarchy/current/theme/orbit.toml.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src-tauri/themes/orbit.toml.tpl"
DEST_DIR="$HOME/.config/omarchy/themed"
DEST="$DEST_DIR/orbit.toml.tpl"

if [[ ! -f "$SRC" ]]; then
  echo "error: template not found at $SRC" >&2
  exit 1
fi

if [[ ! -d "$HOME/.config/omarchy" ]]; then
  echo "error: ~/.config/omarchy not found — is Omarchy installed?" >&2
  exit 2
fi

mkdir -p "$DEST_DIR"
install -m 0644 "$SRC" "$DEST"
echo "installed: $DEST"

CURRENT_LINK="$HOME/.config/omarchy/current/theme"
if [[ -L "$CURRENT_LINK" ]]; then
  CURRENT_THEME="$(basename "$(readlink "$CURRENT_LINK")")"
  echo "current omarchy theme: $CURRENT_THEME"
  echo "run:  omarchy theme set $CURRENT_THEME"
  echo "then: cat ~/.config/omarchy/current/theme/orbit.toml"
else
  echo "tip: run 'omarchy theme set <name>' to regenerate orbit.toml"
fi
