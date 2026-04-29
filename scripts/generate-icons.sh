#!/bin/bash
# Generate Orbit icons at all required sizes
# Usage: ./scripts/generate-icons.sh [source-icon.png]

set -e

SOURCE="${1:-src-tauri/icons/icon.png}"
OUTPUT_DIR="src-tauri/icons"

echo "Generating Orbit icons from: $SOURCE"
echo "Output directory: $OUTPUT_DIR"

# Check if source exists
if [ ! -f "$SOURCE" ]; then
    echo "Error: Source icon not found: $SOURCE"
    exit 1
fi

# Check for ImageMagick - try 'magick' first (IMv7), then 'convert'
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick convert"
    echo "Using ImageMagick v7 (magick convert)"
elif command -v convert &> /dev/null; then
    CONVERT_CMD="convert"
    echo "Using ImageMagick v6/v7 (convert)"
else
    echo "Error: ImageMagick not found. Install with:"
    echo "  Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "  Fedora: sudo dnf install imagemagick"
    exit 1
fi

# Generate sizes
echo "Generating 32x32..."
$CONVERT_CMD "$SOURCE" -resize 32x32 "$OUTPUT_DIR/32x32.png"

echo "Generating 128x128..."
$CONVERT_CMD "$SOURCE" -resize 128x128 "$OUTPUT_DIR/128x128.png"

echo "Generating 128x128@2x..."
$CONVERT_CMD "$SOURCE" -resize 256x256 "$OUTPUT_DIR/128x128@2x.png"

echo "Generating 256x256..."
$CONVERT_CMD "$SOURCE" -resize 256x256 "$OUTPUT_DIR/256x256.png"

echo "Generating 512x512..."
$CONVERT_CMD "$SOURCE" -resize 512x512 "$OUTPUT_DIR/512x512.png"

# Ensure icon.png is 128x128 (Tauri default)
if [ "$SOURCE" != "$OUTPUT_DIR/icon.png" ]; then
    echo "Copying to icon.png..."
    cp "$OUTPUT_DIR/128x128.png" "$OUTPUT_DIR/icon.png"
fi

echo ""
echo "Icon generation complete!"
echo "Generated files:"
ls -la "$OUTPUT_DIR"/*.png
