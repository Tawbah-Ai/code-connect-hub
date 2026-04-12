#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android-agent"
BUILDS_DIR="$SCRIPT_DIR/builds"
GRADLE_PROPS="$ANDROID_DIR/app/build.gradle.kts"

get_version() {
    grep 'versionName = ' "$GRADLE_PROPS" | sed 's/.*versionName = "\(.*\)".*/\1/'
}

get_version_code() {
    grep 'versionCode = ' "$GRADLE_PROPS" | sed 's/.*versionCode = \([0-9]*\).*/\1/'
}

bump_version_code() {
    local current_code
    current_code=$(get_version_code)
    local new_code=$((current_code + 1))
    sed -i "s/versionCode = $current_code/versionCode = $new_code/" "$GRADLE_PROPS"
    echo "$new_code"
}

mkdir -p "$BUILDS_DIR"

echo "========================================"
echo "  HybridControl APK Build Script"
echo "========================================"

VERSION=$(get_version)
OLD_CODE=$(get_version_code)

echo ""
echo "Current version : $VERSION (code $OLD_CODE)"
echo ""

read -rp "Bump version code? [y/N]: " BUMP
if [[ "$BUMP" =~ ^[Yy]$ ]]; then
    NEW_CODE=$(bump_version_code)
    echo "Version code bumped: $OLD_CODE -> $NEW_CODE"
else
    NEW_CODE=$OLD_CODE
fi

VERSION=$(get_version)
echo ""
echo "Building release APK v$VERSION (code $NEW_CODE)..."
echo ""

cd "$ANDROID_DIR"
./gradlew assembleRelease --no-daemon 2>&1

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"

if [ ! -f "$APK_SRC" ]; then
    echo ""
    echo "ERROR: APK not found at expected path:"
    echo "  $APK_SRC"
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
APK_NAME="HybridControl-Agent-v${VERSION}-${TIMESTAMP}.apk"
APK_DEST="$BUILDS_DIR/$APK_NAME"

cp "$APK_SRC" "$APK_DEST"

LATEST_LINK="$BUILDS_DIR/HybridControl-Agent-latest.apk"
ln -sf "$APK_NAME" "$LATEST_LINK" 2>/dev/null || cp "$APK_SRC" "$LATEST_LINK"

APK_SIZE=$(du -h "$APK_DEST" | cut -f1)

echo ""
echo "========================================"
echo "  BUILD SUCCESSFUL"
echo "========================================"
echo "  File    : builds/$APK_NAME"
echo "  Size    : $APK_SIZE"
echo "  Latest  : builds/HybridControl-Agent-latest.apk"
echo "========================================"
echo ""
