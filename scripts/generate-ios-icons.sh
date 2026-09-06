#!/bin/bash
# Script to generate iOS icon files at required sizes from the 1024x1024 source

SOURCE_ICON="ios/ActivePortland/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
OUTPUT_DIR="ios/ActivePortland/Images.xcassets/AppIcon.appiconset"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "❌ Source icon not found: $SOURCE_ICON"
    exit 1
fi

echo "🖼️  Generating iOS icon files at required sizes..."
echo ""

# Check if sips (macOS image tool) is available
if ! command -v sips &> /dev/null; then
    echo "❌ sips command not found. This script requires macOS."
    exit 1
fi

# Generate icons at specific sizes Apple requires
echo "Generating icon-120.png (120x120 for iPhone)..."
sips -z 120 120 "$SOURCE_ICON" --out "$OUTPUT_DIR/icon-120.png" > /dev/null 2>&1

echo "Generating icon-180.png (180x180 for iPhone @3x)..."
sips -z 180 180 "$SOURCE_ICON" --out "$OUTPUT_DIR/icon-180.png" > /dev/null 2>&1

echo "Generating icon-152.png (152x152 for iPad)..."
sips -z 152 152 "$SOURCE_ICON" --out "$OUTPUT_DIR/icon-152.png" > /dev/null 2>&1

echo "Generating icon-167.png (167x167 for iPad Pro)..."
sips -z 167 167 "$SOURCE_ICON" --out "$OUTPUT_DIR/icon-167.png" > /dev/null 2>&1

echo "Generating icon-1024.png (1024x1024 for App Store)..."
sips -z 1024 1024 "$SOURCE_ICON" --out "$OUTPUT_DIR/icon-1024.png" > /dev/null 2>&1

echo ""
echo "✅ Icon files generated!"
echo ""
echo "Updating Contents.json to reference these files..."

