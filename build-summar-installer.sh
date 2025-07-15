#!/bin/bash
set -e

echo "🚀 Starting Summar Installer build process..."

SCHEME="Summar Installer"
DERIVED_DATA="./dist"
APP_NAME="Summar Installer"

# Paths
APP_BUNDLE_NAME="$APP_NAME.app"
APP_BUILD_PATH="$DERIVED_DATA/Build/Products/Release/$APP_BUNDLE_NAME"
APP_DEST="./dist/$APP_BUNDLE_NAME"
DMG_TEMP_DIR="./dist/dmg_temp"
DMG_NAME=""
DMG_VOLNAME="Summar Installer"

# Optional: fetch version from manifest.json (with error handling)
echo "🔍 Attempting to fetch version information..."
VERSION=""
if command -v curl >/dev/null 2>&1; then
    VERSION=$(curl -s --connect-timeout 10 https://github.com/mcgabby/Summar/releases/latest/download/manifest.json 2>/dev/null | grep '"version"' | head -1 | cut -d '"' -f4 2>/dev/null || echo "")
fi

if [[ -n "$VERSION" && "$VERSION" != "" ]]; then
  DMG_NAME="$APP_NAME $VERSION.dmg"
  echo "✅ Found version: $VERSION"
else
  DMG_NAME="$APP_NAME.dmg"
  echo "⚠️  Could not fetch version, using default name"
fi

# Start
echo "📦 Building $SCHEME in Release mode..."

xcodebuild \
  -project "Summar Installer/Summar Installer.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA" \
  DEBUG_INFORMATION_FORMAT=dwarf \
  build

echo "✅ Build complete. Preparing DMG contents..."

# Clean old files
rm -rf "$APP_DEST"
rm -rf "$DMG_TEMP_DIR"
rm -f "./dist/$DMG_NAME"

# Create temporary DMG directory
mkdir -p "$DMG_TEMP_DIR"

# Copy app to temp directory
cp -R "$APP_BUILD_PATH" "$DMG_TEMP_DIR/"

# Copy troubleshooting guide file
echo "📋 Adding installation troubleshooting guide..."
cp "./Summar Installer/security-guide.html" "$DMG_TEMP_DIR/If Installation Blocked.html"

echo "📦 Creating DMG: ./dist/$DMG_NAME"

# Create DMG with better compression
hdiutil create -volname "$DMG_VOLNAME" \
  -srcfolder "$DMG_TEMP_DIR" \
  -ov -format UDZO \
  -imagekey zlib-level=9 \
  "./dist/$DMG_NAME"

# Clean up
rm -rf "$DMG_TEMP_DIR"

echo "🎉 Done! DMG created at: ./dist/$DMG_NAME"
echo ""
echo "📋 DMG Contents:"
echo "  📱 Summar Installer.app - Main installer application"
echo "  📄 If Installation Blocked.html - Troubleshooting guide (Korean/English)"
echo ""
echo "🔒 If installation is blocked, open 'If Installation Blocked.html'"
echo "🌐 The guide automatically displays in Korean or English based on browser language!"