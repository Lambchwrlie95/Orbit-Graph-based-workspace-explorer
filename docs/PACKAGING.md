# Packaging Orbit

This document describes how to build and distribute Orbit as an AppImage.

## Prerequisites

- Linux system (Ubuntu 20.04+ recommended for broad compatibility)
- Rust and Cargo
- Node.js and npm
- ImageMagick (for icon generation)

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libfuse2 libfuse3-dev imagemagick

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
```

## Quick Build

```bash
# Clone and setup
git clone <repository-url>
cd orbit
npm install

# Build AppImage
npm run build:appimage
```

The AppImage will be created at:
```
src-tauri/target/release/bundle/appimage/orbit_*.AppImage
```

## Build Options

### Debug Build
```bash
npm run build:appimage:debug
```
Faster build, includes dev tools, larger file size.

### Clean Build
```bash
npm run build:appimage:clean
```
Removes previous build artifacts before building.

### Manual Build
```bash
./scripts/build-appimage.sh [options]
```

## Testing the AppImage

```bash
# Run validation tests
./scripts/test-appimage.sh

# Run the AppImage
./src-tauri/target/release/bundle/appimage/orbit_*.AppImage

# Open a specific folder
./src-tauri/target/release/bundle/appimage/orbit_*.AppImage --folder /path/to/folder
```

## Distribution

### GitHub Releases (Recommended)

1. Create a new release on GitHub
2. Attach the AppImage as a binary asset
3. Include checksums for verification:

```bash
sha256sum orbit_*.AppImage > orbit_*.AppImage.sha256
```

### Direct Download

Host the AppImage file on your website with clear download instructions:

```bash
# Download
wget https://example.com/orbit-x86_64.AppImage

# Make executable
chmod +x orbit-x86_64.AppImage

# Run
./orbit-x86_64.AppImage
```

### AppImageHub (Optional)

Submit to [AppImageHub](https://appimage.github.io/) for discoverability:
1. Fork the AppImageHub repository
2. Add an orbit.md file with metadata
3. Submit a pull request

## Desktop Integration

The AppImage includes desktop integration via the orbit.desktop file. Users can:

1. Install [appimaged](https://github.com/probonopd/go-appimage) for automatic integration
2. Use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) for easy management
3. Manually integrate by copying the .desktop file and icon

## Troubleshooting

### "FUSE not found" error
Install FUSE libraries:
```bash
# Ubuntu/Debian
sudo apt-get install libfuse2

# Fedora
sudo dnf install fuse
```

### AppImage won't run
Try extracting and running:
```bash
./orbit.AppImage --appimage-extract
./squashfs-root/AppRun
```

### Build fails with icon errors
Regenerate icons:
```bash
./scripts/generate-icons.sh
```

## Configuration

### tauri.conf.json

Key bundle settings:

```json
{
  "bundle": {
    "targets": ["appimage"],
    "category": "System",
    "identifier": "local.orbit.file-intelligence",
    "publisher": "Orbit",
    "copyright": "Copyright (c) 2026",
    "homepage": "https://orbit-app.dev"
  }
}
```

### Icon Sizes

Required icon sizes:
- 32x32: Menu items
- 128x128: Standard display
- 256x256: High DPI
- 512x512: Source quality

## Versioning

AppImage filenames include the version from `tauri.conf.json`:
```
orbit_0.1.0_amd64.AppImage
```

Update the version field before building releases.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/build-appimage.sh` | Main build script with options |
| `scripts/test-appimage.sh` | Validate built AppImage |
| `scripts/generate-icons.sh` | Generate icon files from source |

## Security Considerations

- AppImages run with user permissions
- Always verify checksums when downloading
- The AppImage is built with `bundleMediaFramework: false` for security
- Desktop file and icons are embedded for proper integration
