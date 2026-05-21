# Orbit ↔ Omarchy theme integration (Method A).
#
# Install: copy this file to ~/.config/omarchy/themed/orbit.toml.tpl
# Run:     omarchy theme set <current-theme>   (regenerates everything)
# Output:  ~/.config/omarchy/current/theme/orbit.toml
#
# Orbit reads `orbit.toml` from the omarchy theme directory if present and
# uses these values directly. If it isn't present, Orbit falls back to
# parsing colors.toml. See `~/.config/omarchy/current/theme/colors.toml`
# for the template variable list.

[palette]
background = "{{ background }}"
foreground = "{{ foreground }}"
accent     = "{{ accent }}"
cursor     = "{{ cursor }}"
selection_background = "{{ selection_background }}"
selection_foreground = "{{ selection_foreground }}"

# ANSI 16-color palette — Orbit consumes color0..color15 directly.
color0 = "{{ color0 }}"
color1 = "{{ color1 }}"
color2 = "{{ color2 }}"
color3 = "{{ color3 }}"
color4 = "{{ color4 }}"
color5 = "{{ color5 }}"
color6 = "{{ color6 }}"
color7 = "{{ color7 }}"
color8 = "{{ color8 }}"
color9 = "{{ color9 }}"
color10 = "{{ color10 }}"
color11 = "{{ color11 }}"
color12 = "{{ color12 }}"
color13 = "{{ color13 }}"
color14 = "{{ color14 }}"
color15 = "{{ color15 }}"

# Graph edge category colors — Orbit picks these up via CSS vars
# (--orbit-edge-*). Mapping each onto an ANSI slot keeps Orbit visually
# consistent with terminal, btop, helix, etc.
[graph]
edge_hierarchy = "{{ color4 }}"   # folder containment  — blue
edge_code      = "{{ color5 }}"   # imports/dependencies — magenta
edge_docs      = "{{ color6 }}"   # markdown/wikilinks   — cyan
edge_symlink   = "{{ color3 }}"   # filesystem aliases   — yellow/orange
edge_semantic  = "{{ color2 }}"   # similarity           — green
edge_tags      = "{{ color13 }}"  # tag relationships    — bright magenta
edge_other     = "{{ color8 }}"   # uncategorized        — gray
canvas         = "{{ background }}"
node_default   = "{{ color7 }}"
