#!/bin/bash
# Build Orbit AppImage
# Usage: ./scripts/build-appimage.sh [options]
# Options:
#   --release    Build release version (default)
#   --debug      Build debug version
#   --clean      Clean before build

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_TYPE="release"
CLEAN=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        --release)
            BUILD_TYPE="release"
            shift
            ;;
        --clean)
            CLEAN=1
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --release    Build release version (default)"
            echo "  --debug      Build debug version"
            echo "  --clean      Clean before build"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${YELLOW}Building Orbit AppImage...${NC}"
echo "Build type: $BUILD_TYPE"
echo "Project root: $PROJECT_ROOT"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: cargo not found. Install Rust: https://rustup.rs/${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm not found. Install Node.js: https://nodejs.org/${NC}"
    exit 1
fi

# Check for Tauri CLI
if ! cargo tauri --version &> /dev/null; then
    echo -e "${YELLOW}Installing Tauri CLI...${NC}"
    cargo install tauri-cli
fi

# Clean if requested
if [ $CLEAN -eq 1 ]; then
    echo -e "${YELLOW}Cleaning previous builds...${NC}"
    rm -rf "$PROJECT_ROOT/src-tauri/target/release/bundle"
    rm -rf "$PROJECT_ROOT/frontend/dist"
fi

# Verify frontend dependencies
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install

# Build frontend
echo -e "${YELLOW}Building frontend...${NC}"
npm run build

# Verify icons exist
echo -e "${YELLOW}Verifying icon assets...${NC}"
ICON_DIR="$PROJECT_ROOT/src-tauri/icons"
for size in 32x32 128x128; do
    if [ ! -f "$ICON_DIR/$size.png" ]; then
        echo -e "${RED}Error: Missing icon: $size.png${NC}"
        echo "Run: ./scripts/generate-icons.sh"
        exit 1
    fi
done
echo -e "${GREEN}Icons verified ✓${NC}"

# Build AppImage
echo -e "${YELLOW}Building AppImage with Tauri...${NC}"
cd "$PROJECT_ROOT/src-tauri"

if [ "$BUILD_TYPE" = "debug" ]; then
    cargo tauri build --debug
else
    cargo tauri build
fi

# Find the built AppImage
APPIMAGE_PATH=$(find "$PROJECT_ROOT/src-tauri/target/$BUILD_TYPE/bundle/appimage" -name "*.AppImage" -type f | head -1)

if [ -z "$APPIMAGE_PATH" ]; then
    echo -e "${RED}Error: AppImage not found in build output${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}AppImage build complete!${NC}"
echo "Location: $APPIMAGE_PATH"
echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
echo ""

# Make executable (should already be, but ensure it)
chmod +x "$APPIMAGE_PATH"

# Output for CI/packaging
echo "APPIMAGE_PATH=$APPIMAGE_PATH"
echo "APPIMAGE_NAME=$(basename "$APPIMAGE_PATH")"

# Quick validation
echo -e "${YELLOW}Validating AppImage...${NC}"
if file "$APPIMAGE_PATH" | grep -q "AppImage"; then
    echo -e "${GREEN}AppImage format verified ✓${NC}"
else
    echo -e "${RED}Warning: File may not be a valid AppImage${NC}"
fi

echo ""
echo "To test:"
echo "  $APPIMAGE_PATH"
echo ""
echo "To extract contents:"
echo "  $APPIMAGE_PATH --appimage-extract"
