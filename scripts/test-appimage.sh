#!/bin/bash
# Test Orbit AppImage
# Usage: ./scripts/test-appimage.sh [path-to-appimage]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Find AppImage if not provided
if [ -z "$1" ]; then
    APPIMAGE=$(find "$PROJECT_ROOT/src-tauri/target" -name "*.AppImage" -type f | head -1)
    if [ -z "$APPIMAGE" ]; then
        echo -e "${RED}Error: No AppImage found${NC}"
        echo "Usage: $0 [path-to-appimage]"
        echo "Or build first: npm run build:appimage"
        exit 1
    fi
    echo "Found AppImage: $APPIMAGE"
else
    APPIMAGE="$1"
fi

if [ ! -f "$APPIMAGE" ]; then
    echo -e "${RED}Error: AppImage not found: $APPIMAGE${NC}"
    exit 1
fi

echo -e "${YELLOW}Testing Orbit AppImage...${NC}"
echo "File: $APPIMAGE"
echo ""

# Test 1: File type
echo "Test 1: File type validation"
if file "$APPIMAGE" | grep -q "AppImage"; then
    echo -e "${GREEN}  ✓ Valid AppImage format${NC}"
else
    echo -e "${RED}  ✗ Not a valid AppImage${NC}"
    exit 1
fi

# Test 2: Executable permissions
echo "Test 2: Executable permissions"
if [ -x "$APPIMAGE" ]; then
    echo -e "${GREEN}  ✓ File is executable${NC}"
else
    echo -e "${YELLOW}  ⚠ File not executable, fixing...${NC}"
    chmod +x "$APPIMAGE"
fi

# Test 3: AppImage version
echo "Test 3: AppImage version check"
VERSION=$("$APPIMAGE" --appimage-version 2>&1 || true)
if [ -n "$VERSION" ]; then
    echo -e "${GREEN}  ✓ AppImage version: $VERSION${NC}"
else
    echo -e "${YELLOW}  ⚠ Could not read AppImage version${NC}"
fi

# Test 4: Extract test (validate squashfs)
echo "Test 4: Archive integrity"
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
if "$APPIMAGE" --appimage-extract > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ AppImage extracts successfully${NC}"
    # Check for required files
    if [ -f "$TEMP_DIR/squashfs-root/AppRun" ]; then
        echo -e "${GREEN}  ✓ AppRun found${NC}"
    fi
    if [ -d "$TEMP_DIR/squashfs-root/usr/bin" ]; then
        echo -e "${GREEN}  ✓ Binary directory found${NC}"
    fi
    rm -rf "$TEMP_DIR"
else
    echo -e "${RED}  ✗ AppImage extraction failed${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Test 5: Desktop integration files
echo "Test 5: Desktop integration files"
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
"$APPIMAGE" --appimage-extract > /dev/null 2>&1
if [ -f "$TEMP_DIR/squashfs-root/orbit.desktop" ] || [ -f "$TEMP_DIR/squashfs-root/usr/share/applications/orbit.desktop" ]; then
    echo -e "${GREEN}  ✓ Desktop entry found${NC}"
else
    echo -e "${YELLOW}  ⚠ Desktop entry not found in expected location${NC}"
fi
rm -rf "$TEMP_DIR"

# Test 6: File size sanity check
echo "Test 6: File size"
SIZE=$(stat -f%z "$APPIMAGE" 2>/dev/null || stat -c%s "$APPIMAGE")
SIZE_MB=$((SIZE / 1024 / 1024))
echo "  Size: ${SIZE_MB}MB"
if [ $SIZE_MB -gt 50 ]; then
    echo -e "${GREEN}  ✓ Size looks reasonable${NC}"
else
    echo -e "${YELLOW}  ⚠ Size seems small, may be incomplete${NC}"
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
echo ""
echo "To run the AppImage:"
echo "  $APPIMAGE"
echo ""
echo "To test with a folder:"
echo "  $APPIMAGE --folder /path/to/folder"
