#!/bin/bash
set -e

SCHEME="Summar Installer"
DERIVED_DATA="./dist"
APP_NAME="Summar Installer"

# Paths
APP_BUNDLE_NAME="$APP_NAME.app"
APP_BUILD_PATH="$DERIVED_DATA/Build/Products/Release/$APP_BUNDLE_NAME"
APP_DEST="./dist/$APP_BUNDLE_NAME"
DMG_NAME=""
DMG_VOLNAME="Summar Installer"

# Optional: fetch version from manifest.json
VERSION=$(curl -s https://github.com/mcgabby/Summar/releases/latest/download/manifest.json | grep '"version"' | head -1 | cut -d '"' -f4)
if [[ -n "$VERSION" ]]; then
  DMG_NAME="$APP_NAME $VERSION.dmg"
else
  DMG_NAME="$APP_NAME.dmg"
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

echo "✅ Build complete. Copying .app to ./dist..."

# Clean old app and dmg
rm -rf "$APP_DEST"
rm -f "./dist/$DMG_NAME"

cp -R "$APP_BUILD_PATH" "$APP_DEST"

echo "📦 Creating .dmg: ./dist/$DMG_NAME"

# Create DMG using hdiutil
hdiutil create -volname "$DMG_VOLNAME" \
  -srcfolder "$APP_DEST" \
  -ov -format UDZO "./dist/$DMG_NAME"

echo "🎉 Done! DMG created at: ./dist/$DMG_NAME"