# Omarchy CLI Commands Reference

> Generated from `omarchy commands --json` on 2026-05-16.
> Total commands: ~220+ across 40+ groups.
> **Legend:** `🔒` = requires sudo, `🙈` = hidden/internal

---

## ac

| Command | Description |
|---------|-------------|
| `omarchy ac present` | Returns true if AC power is connected |

## audio

| Command | Description |
|---------|-------------|
| `omarchy audio input mute` | Toggle microphone mute (drives hardware mic-mute LED) |
| `omarchy audio output switch` | Switch between audio outputs (preserves mute status) |

## battery

| Command | Description |
|---------|-------------|
| `omarchy battery capacity` | Returns battery full capacity in Wh |
| `omarchy battery present` | Returns true if a battery is present |
| `omarchy battery remaining` | Returns battery percentage as integer |
| `omarchy battery remaining time` | Returns battery time remaining (compact format) |
| `omarchy battery status` | Formatted battery status with percentage and power draw |

## branch

| Command | Description |
|---------|-------------|
| `omarchy branch set <master\|rc\|dev>` | Set branch for Omarchy's git repository |

## branding

| Command | Description |
|---------|-------------|
| `omarchy branding about <image\|text\|reset>` | Edit, set, or reset About branding |
| `omarchy branding screensaver <image\|text\|reset>` | Edit, set, or reset screensaver branding |

## brightness

| Command | Description |
|---------|-------------|
| `omarchy brightness display <+N%\|N%-\|N%\|off\|on>` | Adjust display brightness |
| `omarchy brightness display apple <+N%\|N%-\|N%>` | Adjust Apple Studio/XDR Display brightness |
| `omarchy brightness keyboard <up\|down\|cycle\|off\|restore>` | Adjust keyboard backlight brightness |
| `omarchy brightness keyboard mute <on\|off>` | Set mic-mute indicator LED |

## capture

| Command | Description |
|---------|-------------|
| `omarchy capture screenshot [smart\|region\|windows\|fullscreen] [slurp\|copy\|save] [--editor=<name>]` | Take a screenshot |
| `omarchy capture screenrecording [--with-desktop-audio] [--with-microphone-audio] [--with-webcam] [--resolution=<size>] [--stop-recording]` | Start or stop screen recording |
| `omarchy capture text extraction` | Extract text from screenshot region with OCR |

## channel

| Command | Description |
|---------|-------------|
| `omarchy channel set <stable\|rc\|edge\|dev>` 🔒 | Set Omarchy channel (branch + package repo) |

## cmd

| Command | Description |
|---------|-------------|
| `omarchy cmd missing` | Check whether any required commands are missing |
| `omarchy cmd present` | Check whether all required commands are available |

## config

| Command | Description |
|---------|-------------|
| `omarchy config direct boot` 🔒 | Add/remove EFI boot entry for Omarchy UKI |

## debug

| Command | Description |
|---------|-------------|
| `omarchy debug [--no-sudo] [--print]` 🔒 | Print debugging information |

## default

| Command | Description |
|---------|-------------|
| `omarchy default browser [chromium\|chrome\|brave\|brave-origin\|edge\|firefox\|zen]` | Set default browser for Omarchy and XDG handlers |
| `omarchy default editor [code\|cursor\|zed\|sublime_text\|helix\|vim\|emacs\|nvim]` | Set default editor for `$EDITOR` |
| `omarchy default terminal [alacritty\|foot\|ghostty\|kitty]` | Set default terminal for `xdg-terminal-exec` |

## dev

| Command | Description |
|---------|-------------|
| `omarchy dev add migration` | Create a new Omarchy migration |
| `omarchy dev benchmark [--repeat=<count>]` | Measure Omarchy CLI response times |
| `omarchy dev bin metadata [--json]` | Show Omarchy bin metadata fields and defaults |

## drive

| Command | Description |
|---------|-------------|
| `omarchy drive info <drive>` | Print drive information (size, model, mount) |
| `omarchy drive password` 🔒 | Set new encryption password for a selected drive |
| `omarchy drive select` | Select a drive from a list with info |

## first

| Command | Description |
|---------|-------------|
| `omarchy first run` 🔒 | Finish Omarchy installation after login |

## font

| Command | Description |
|---------|-------------|
| `omarchy font current` | Show current monospace font |
| `omarchy font list` | List available monospace fonts |
| `omarchy font set <font-name>` | Set system monospace font |

## hibernation

| Command | Description |
|---------|-------------|
| `omarchy hibernation available` | Check if hibernation is supported |
| `omarchy hibernation remove` 🔒 | Remove hibernation setup (swap + boot resume) |
| `omarchy hibernation setup [--force] [--no-rebuild]` 🔒 | Set up hibernation with swap and boot resume |

## hook

| Command | Description |
|---------|-------------|
| `omarchy hook [name] [args...]` | Run a named hook from `~/.config/omarchy/hooks/` |
| `omarchy hook install <type> <file>` | Install a hook into `~/.config/omarchy/hooks/<type>.d/` |

## hw (Hardware Detection)

| Command | Description |
|---------|-------------|
| `omarchy hw asus rog` | Detect ASUS ROG machine |
| `omarchy hw asus expertbook b9406` | Detect ASUS ExpertBook B9406 (Intel Panther Lake) |
| `omarchy hw asus zenbook ux5406aa` | Detect ASUS Zenbook UX5406AA |
| `omarchy hw dell xps haptic touchpad` | Match Dell XPS with Synaptics haptic touchpad |
| `omarchy hw dell xps oled` | Match Dell XPS with LG OLED panel (Panther Lake) |
| `omarchy hw external monitors` | Returns true when external monitor is connected |
| `omarchy hw framework16` | Detect Framework Laptop 16 |
| `omarchy hw hybrid gpu` | Detect active hybrid GPU configuration |
| `omarchy hw intel` | Detect Intel CPU |
| `omarchy hw intel ptl` | Detect Intel Panther Lake GPU |
| `omarchy hw match <pattern>` | Match DMI product name/family (case-insensitive) |
| `omarchy hw nvidia gsp` | Detect NVIDIA GPU with GSP firmware (Turing+) |
| `omarchy hw nvidia without gsp` | Detect NVIDIA GPU without GSP (Maxwell/Pascal/Volta) |
| `omarchy hw recover internal monitor` | Clear internal-monitor-disable toggle if no external display |
| `omarchy hw surface` | Detect Microsoft Surface device |
| `omarchy hw touchpad` | Print detected touchpad/trackpad device name |
| `omarchy hw touchscreen` | Print detected touchscreen/tablet device name |
| `omarchy hw vulkan` | Detect whether Vulkan is available |

## hyprland

| Command | Description |
|---------|-------------|
| `omarchy hyprland monitor focused` | Print currently focused Hyprland monitor name |
| `omarchy hyprland monitor focused apple` | Return success if focused monitor is Apple display |
| `omarchy hyprland monitor internal <on\|off\|toggle\|recover>` | Enable/disable/toggle/recover internal laptop display |
| `omarchy hyprland monitor internal mirror <on\|off\|toggle\|recover>` | Enable/disable/toggle/recover display mirroring |
| `omarchy hyprland monitor scaling cycle` | Cycle focused monitor scaling (1x → 1.25x → 1.6x → 2x → 3x → 4x) |
| `omarchy hyprland monitor watch` | Watch monitor events and recover toggles on monitor removal |
| `omarchy hyprland toggle <flag-name> [--enabled-notification <text>] [--disabled-notification <text>]` | Toggle permanent Hyprland flags |
| `omarchy hyprland toggle enabled <flag-name>` | Check if Hyprland toggle is enabled |
| `omarchy hyprland toggle disabled <flag-name>` | Check if Hyprland toggle is disabled |
| `omarchy hyprland window close all` | Close all open windows |
| `omarchy hyprland window gaps toggle` | Toggle window gaps on/off |
| `omarchy hyprland window pop [width height x y]` | Pop-out a tile to stay fixed (display basis) |
| `omarchy hyprland window single square aspect toggle` | Toggle single-window square aspect ratio |
| `omarchy hyprland window transparency toggle` | Toggle transparency for focused window |
| `omarchy hyprland workspace layout toggle` | Toggle workspace layout (dwindle ↔ scrolling) |

## install

| Command | Description |
|---------|-------------|
| `omarchy install browser <chrome\|brave\|brave-origin\|edge\|firefox\|zen>` | Install a supported browser |
| `omarchy install chromium google account` | Allow Chromium to sign in to Google accounts |
| `omarchy install dev-env <ruby\|node\|bun\|deno\|go\|laravel\|symfony\|php\|python\|elixir\|phoenix\|rust\|java\|zig\|ocaml\|dotnet\|clojure\|scala>` 🔒 | Install a development environment |
| `omarchy install docker dbs` 🔒 | Install databases in Docker containers |
| `omarchy install dropbox` | Install and start Dropbox service |
| `omarchy install gaming geforce now` | Install and launch GeForce NOW |
| `omarchy install gaming gpu lib32` 🔒 | Install lib32 graphics drivers for detected GPUs |
| `omarchy install gaming heroic` 🔒 | Install Heroic Games Launcher (Epic, GOG, Amazon) |
| `omarchy install gaming lutris` 🔒 | Install Lutris with Wine + DXVK |
| `omarchy install gaming moonlight` 🔒 | Install Moonlight (streaming client) |
| `omarchy install gaming retroarch` | Install RetroArch with full libretro core set |
| `omarchy install gaming steam` 🔒 | Install Steam with graphics drivers |
| `omarchy install gaming xbox cloud` | Install Xbox Cloud Gaming web app |
| `omarchy install gaming xbox controllers` 🔒 | Install Xbox controller support |
| `omarchy install helix` | Install Helix editor with current Omarchy theme |
| `omarchy install nordvpn` 🔒 | Install NordVPN with optional GUI |
| `omarchy install once` 🔒 | Install ONCE service and TUI |
| `omarchy install tailscale` 🔒 | Install Tailscale VPN with web app |
| `omarchy install terminal <alacritty\|foot\|ghostty\|kitty>` 🔒 | Install terminal and set as default |
| `omarchy install vscode` | Install VS Code with Omarchy defaults |
| `omarchy install zed` | Install Zed Editor with current Omarchy theme |

## launch

| Command | Description |
|---------|-------------|
| `omarchy launch about` | Launch system info TUI (fastfetch) |
| `omarchy launch audio` | Launch audio controls TUI (wiremix) |
| `omarchy launch bluetooth` | Launch bluetooth controls TUI (bluetui) |
| `omarchy launch browser [url]` | Launch default browser |
| `omarchy launch editor <path>` | Launch default editor |
| `omarchy launch floating terminal with presentation <command>` | Launch floating terminal with presentation wrapper |
| `omarchy launch or focus <window-pattern> <launch-command>` | Launch or focus existing window matching pattern |
| `omarchy launch or focus tui <command> [args...]` | Launch or focus TUI terminal |
| `omarchy launch or focus webapp <window-pattern> <url-and-flags...>` | Launch or focus web app |
| `omarchy launch screensaver` | Launch Omarchy screensaver |
| `omarchy launch tui <command> [args...]` | Launch TUI in default terminal with Omarchy styling |
| `omarchy launch walker` | Launch Walker (with Elephant data provider) |
| `omarchy launch webapp <url>` | Launch URL as web app |
| `omarchy launch wifi` | Launch wifi controls (Impala TUI) |

## menu

| Command | Description |
|---------|-------------|
| `omarchy menu` | Launch Omarchy Menu (or jump to submenu) |
| `omarchy menu file label paths formats [walker args...]` | Pick a file with Walker |
| `omarchy menu input prompt [walker args...]` | Prompt for text input with Walker |
| `omarchy menu keybindings` | Display Hyprland keybindings via Walker |
| `omarchy menu select prompt option... [-- walker args...]` | Pick one option with Walker |

## migrate

| Command | Description |
|---------|-------------|
| `omarchy migrate` | Run all pending migrations |

## notification

| Command | Description |
|---------|-------------|
| `omarchy notification dismiss <summary>` | Dismiss a mako notification by summary |
| `omarchy notification send <glyph> <headline> [description] [options]` | Send desktop notification with Omarchy styling |

## npx

| Command | Description |
|---------|-------------|
| `omarchy npx install <package> [command-name]` | Install npx wrapper for an npm package |

## pkg (Package Management)

| Command | Description |
|---------|-------------|
| `omarchy pkg add <packages...>` 🔒 | Install Arch packages if missing |
| `omarchy pkg aur accessible` | Returns true if AUR is available |
| `omarchy pkg aur add <packages...>` | Install AUR packages if missing |
| `omarchy pkg aur install` 🔒 | Fuzzy-finder TUI for picking AUR packages |
| `omarchy pkg drop <packages...>` 🔒 | Remove named packages if installed |
| `omarchy pkg install` 🔒 | Fuzzy-finder TUI for picking Arch/OPR packages |
| `omarchy pkg missing <packages...>` | Returns true if any named packages are missing |
| `omarchy pkg present <packages...>` | Returns true if all named packages are installed |
| `omarchy pkg remove` 🔒 | Fuzzy-finder TUI for picking packages to remove |

## plymouth

| Command | Description |
|---------|-------------|
| `omarchy plymouth preview <bg-hex> <text-hex> <logo.png> <output>` | Preview Plymouth boot screen |
| `omarchy plymouth reset` 🔒 | Restore default Plymouth boot theme |
| `omarchy plymouth set <bg-hex> <text-hex> <logo.png>` 🔒 | Set Plymouth boot theme colors and logo |
| `omarchy plymouth set by theme <theme-name>` 🔒 | Set Plymouth theme from Omarchy theme |

## powerprofiles

| Command | Description |
|---------|-------------|
| `omarchy powerprofiles init` | Set power profile on boot (AC/battery based) |
| `omarchy powerprofiles list` | List available power profiles |
| `omarchy powerprofiles set [autodetect\|ac\|battery]` | Set power profile |

## refresh

| Command | Description |
|---------|-------------|
| `omarchy refresh applications` | Ensure all default .desktop, web apps, TUIs, npx wrappers are installed |
| `omarchy refresh chromium` | Refresh Chromium flags from defaults |
| `omarchy refresh config <config-path>` | Copy named config from Omarchy defaults → `~/.config/` |
| `omarchy refresh fastfetch` | Reset fastfetch config to default |
| `omarchy refresh hypridle` | Reset hypridle config to default and restart |
| `omarchy refresh hyprland` | Reset all Hyprland configs to default |
| `omarchy refresh hyprlock` | Reset hyprlock config to default |
| `omarchy refresh hyprsunset` | Reset hyprsunset config to default and restart |
| `omarchy refresh limine` 🔒 | Reset Limine bootloader config and rebuild |
| `omarchy refresh pacman` 🔒 | Reset pacman config to Omarchy mirrors/repos, update |
| `omarchy refresh plymouth` 🔒 | Reset Plymouth drive decryption + boot sequence to default |
| `omarchy refresh sddm` 🔒 | Refresh SDDM theme from default |
| `omarchy refresh swayosd` | Reset swayosd configs to default and restart |
| `omarchy refresh tmux` | Reset tmux config to default and reload |
| `omarchy refresh walker` | Reset Walker configs to default and restart |
| `omarchy refresh waybar` | Reset Waybar config to default |

## reinstall

| Command | Description |
|---------|-------------|
| `omarchy reinstall` 🔒 | Reinstall Omarchy packages and reset configs |
| `omarchy reinstall configs` 🔒 | Reset all Omarchy user configs to defaults |
| `omarchy reinstall git` | Reinstall Omarchy source from git |
| `omarchy reinstall pkgs` 🔒 | Reinstall all default Omarchy packages |

## reminder

| Command | Description |
|---------|-------------|
| `omarchy reminder <minutes> [message]` | Set a desktop notification reminder |
| `omarchy reminder show` | Show all pending reminders |
| `omarchy reminder clear` | Clear all reminders |

## remove

| Command | Description |
|---------|-------------|
| `omarchy remove browser <chrome\|brave\|brave-origin\|edge\|firefox\|zen>` 🔒 | Remove browser and clean up defaults |
| `omarchy remove dev env <name>` 🔒 | Remove installed dev environment |
| `omarchy remove gaming geforce now` | Remove GeForce NOW Flatpak |
| `omarchy remove gaming heroic` 🔒 | Remove Heroic Games Launcher + data |
| `omarchy remove gaming lutris` 🔒 | Remove Lutris, Wine, umu-launcher + data |
| `omarchy remove gaming minecraft` 🔒 | Remove Minecraft launcher + worlds/mods |
| `omarchy remove gaming moonlight` 🔒 | Remove Moonlight + configs |
| `omarchy remove gaming retroarch` 🔒 | Remove RetroArch, cores, configs/saves |
| `omarchy remove gaming steam` 🔒 | Remove Steam + game libraries |
| `omarchy remove gaming xbox cloud` | Remove Xbox Cloud Gaming web app |
| `omarchy remove gaming xbox controllers` 🔒 | Remove xpadneo driver + config |
| `omarchy remove preinstalls` | Remove preinstalled web apps, TUIs, packages |
| `omarchy remove security fido2` 🔒 | Remove FIDO2 auth from sudo/polkit |
| `omarchy remove security fingerprint` 🔒 | Remove fingerprint auth from sudo/polkit/lock |

## restart

| Command | Description |
|---------|-------------|
| `omarchy restart app <name> [args...]` | Restart an application via uwsm |
| `omarchy restart bluetooth` | Unblock and restart bluetooth service |
| `omarchy restart btop` | Reload btop configuration |
| `omarchy restart helix` | Reload Helix configuration |
| `omarchy restart hyprctl` | Reload Hyprland configuration |
| `omarchy restart hypridle` | Restart hypridle service |
| `omarchy restart hyprsunset` | Restart hyprsunset (night light) |
| `omarchy restart mako` | Reload mako configuration |
| `omarchy restart opencode` | Reload opencode configuration |
| `omarchy restart pipewire` | Restart PipeWire audio service |
| `omarchy restart swayosd` | Restart SwayOSD server |
| `omarchy restart terminal` | Reload terminal emulators after config changes |
| `omarchy restart tmux` | Restart tmux with latest config |
| `omarchy restart trackpad` 🔒 | Reset trackpad by rebinding driver |
| `omarchy restart walker` | Restart Walker and related services |
| `omarchy restart waybar` | Restart Waybar |
| `omarchy restart wifi` | Unblock and restart Wi-Fi service |
| `omarchy restart xcompose` | Restart fcitx5 (compose key/input method) |

## screensaver

| Command | Description |
|---------|-------------|
| `omarchy screensaver` | Run Omarchy screensaver with random TTE effects |

## setup

| Command | Description |
|---------|-------------|
| `omarchy setup dns [Cloudflare\|Google\|DHCP\|Custom]` 🔒 | Configure system DNS provider |
| `omarchy setup security fido2` 🔒 | Set up FIDO2 auth for sudo/polkit |
| `omarchy setup security fingerprint` 🔒 | Set up fingerprint auth for sudo/polkit/lock |

## share

| Command | Description |
|---------|-------------|
| `omarchy share <clipboard\|file\|folder> [path...]` | Share clipboard, files, or folders with LocalSend |

## show

| Command | Description |
|---------|-------------|
| `omarchy show done` | Display "Done!" message with spinner |
| `omarchy show logo` | Display Omarchy logo in terminal (green) |

## snapshot

| Command | Description |
|---------|-------------|
| `omarchy snapshot <create\|restore>` 🔒 | Create or restore system snapshots (snapper) |

## sudo

| Command | Description |
|---------|-------------|
| `omarchy sudo keepalive` 🔒 | Prompt for sudo once, keep alive in background |
| `omarchy sudo passwordless [MINUTES]` 🔒 | Toggle passwordless sudo |
| `omarchy sudo reset` | Reset sudo lockout/faillock |

## swayosd

| Command | Description |
|---------|-------------|
| `omarchy swayosd brightness <0-100>` | Display brightness level via SwayOSD |
| `omarchy swayosd client <args...>` | SwayOSD client wrapper (targets focused monitor) |
| `omarchy swayosd kbd brightness <0-100>` | Display keyboard brightness via SwayOSD |

## system

| Command | Description |
|---------|-------------|
| `omarchy system lock` | Lock computer and turn off display |
| `omarchy system logout` | Log out after closing windows |
| `omarchy system reboot` | Reboot after closing windows |
| `omarchy system shutdown` | Shut down after closing windows |
| `omarchy system wake` | Wake displays and restore brightness |

## theme

| Command | Description |
|---------|-------------|
| `omarchy theme bg install` | Open current theme's background folder |
| `omarchy theme bg next` | Cycle to next background |
| `omarchy theme bg set <path>` | Set current background image |
| `omarchy theme current` | Show current theme name |
| `omarchy theme install [git-repo-url]` | Install theme from git repository |
| `omarchy theme list` | List available themes |
| `omarchy theme refresh` | Refresh current theme from templates |
| `omarchy theme remove [theme-name]` | Remove a user-installed theme |
| `omarchy theme set <theme-name>` | Apply an Omarchy theme |
| `omarchy theme update` | Update user-installed git themes |

## toggle

| Command | Description |
|---------|-------------|
| `omarchy toggle enabled <flag-name>` | Check if a toggle is enabled |
| `omarchy toggle` | Toggle Omarchy features on/off |
| `omarchy toggle hybrid gpu` 🔒 | Toggle dedicated ↔ integrated GPU |
| `omarchy toggle idle` | Toggle hypridle idle locking |
| `omarchy toggle nightlight` | Toggle night light screen temperature |
| `omarchy toggle notification silencing` | Toggle do-not-disturb mode |
| `omarchy toggle screensaver` | Toggle screensaver availability |
| `omarchy toggle suspend` | Toggle suspend in system menu |
| `omarchy toggle touchpad [on\|off\|toggle]` | Enable/disable/toggle touchpad |
| `omarchy toggle touchscreen [on\|off\|toggle]` | Enable/disable/toggle touchscreen |
| `omarchy toggle waybar` | Toggle Waybar visibility |

## transcode

| Command | Description |
|---------|-------------|
| `omarchy transcode [--path path] [input] [format] [resolution]` | Transcode pictures and videos for sharing |
| `omarchy transcode ascii <input> <output> [--width] [--height] [--mode <braille\|block>] [--threshold] [--invert]` | Transcode image to ASCII/Unicode art |

## tui

| Command | Description |
|---------|-------------|
| `omarchy tui install [name command window-style icon-url]` | Create a desktop launcher for a TUI app |
| `omarchy tui remove [name...]` | Remove TUI desktop launchers |
| `omarchy tui remove all` | Remove all TUIs installed via `omarchy tui install` |

## tz

| Command | Description |
|---------|-------------|
| `omarchy tz select` 🔒 | Select and set system timezone |

## update

| Command | Description |
|---------|-------------|
| `omarchy update [-y]` 🔒 | Update Omarchy and system packages |
| `omarchy update analyze logs` | Check update log for known failures |
| `omarchy update aur pkgs` | Update AUR packages if installed |
| `omarchy update available` | Get remote tag (check for updates) |
| `omarchy update available reset` | Remove Waybar update-available icon |
| `omarchy update branch <branch>` | Switch Omarchy branch and update |
| `omarchy update confirm` | Prompt before starting update |
| `omarchy update firmware` 🔒 | Update system firmware (fwupd) |
| `omarchy update git` | Pull latest Omarchy git changes |
| `omarchy update keyring` 🔒 | Ensure Omarchy + Arch keyrings are installed |
| `omarchy update orphan pkgs` 🔒 | Remove orphaned packages after updates |
| `omarchy update perform` 🔒 | Run full Omarchy update pipeline |
| `omarchy update restart` | Prompt for reboot/service restarts after updates |
| `omarchy update system pkgs` 🔒 | Update system packages with pacman |
| `omarchy update time` 🔒 | Restart system time sync |

## version

| Command | Description |
|---------|-------------|
| `omarchy version` | Print installed Omarchy version |
| `omarchy version branch` | Print current Omarchy git branch |
| `omarchy version channel` | Print active mirror and package channel |
| `omarchy version pkgs` | Print when system packages were last upgraded |

## voxtype

| Command | Description |
|---------|-------------|
| `omarchy voxtype config` | Open Voxtype configuration file |
| `omarchy voxtype install` 🔒 | Install and configure Voxtype dictation |
| `omarchy voxtype model` | Open Voxtype AI model setup |
| `omarchy voxtype remove` 🔒 | Remove Voxtype dictation and config |
| `omarchy voxtype status` | Clean up voxtype child process (Waybar reload) |

## weather

| Command | Description |
|---------|-------------|
| `omarchy weather icon` | Return weather condition icon (adjusted for sunrise/sunset) |
| `omarchy weather status` | Return formatted weather string (temperature + wind) |

## webapp

| Command | Description |
|---------|-------------|
| `omarchy webapp handler hey [url]` | Open HEY webmail, translate mailto links |
| `omarchy webapp handler zoom [url]` | Open Zoom meetings from protocol links |
| `omarchy webapp install [name url icon custom-exec mime-types]` | Create a desktop launcher for a web app |
| `omarchy webapp remove [name...]` | Remove web app desktop launchers |
| `omarchy webapp remove all` | Remove all web apps installed via `omarchy webapp install` |

## wifi

| Command | Description |
|---------|-------------|
| `omarchy wifi powersave <on\|off>` | Set Wi-Fi power save mode |

## windows

| Command | Description |
|---------|-------------|
| `omarchy windows vm <install\|remove\|launch\|stop\|status> [options]` 🔒 | Manage Windows VM |

---

## Quick Reference: Most Used Commands

```
omarchy update            # Full system update
omarchy theme list        # List themes
omarchy theme set "Name"  # Apply theme
omarchy theme bg next     # Cycle wallpaper
omarchy system lock       # Lock screen
omarchy system logout     # Log out
omarchy system reboot     # Reboot
omarchy system shutdown   # Shut down
omarchy pkg add <pkg>     # Install package
omarchy menu              # Launch Omarchy Menu
omarchy capture screenshot # Take screenshot
omarchy toggle nightlight # Toggle night light
omarchy toggle waybar     # Toggle top bar
omarchy font list         # List fonts
omarchy font set <name>   # Set monospace font
omarchy debug --print     # Debug info
omarchy reminder 15 "msg" # Set reminder
```
