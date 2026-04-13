#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/android-agent"
BUILDS_DIR="$SCRIPT_DIR/builds"
GRADLE_PROPS="$ANDROID_DIR/app/build.gradle.kts"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$SCRIPT_DIR/.android-sdk}}"
LOCAL_PROPERTIES="$ANDROID_DIR/local.properties"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

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

ensure_android_sdk() {
    export ANDROID_HOME="$SDK_DIR"
    export ANDROID_SDK_ROOT="$SDK_DIR"
    export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/build-tools/34.0.0:$PATH"

    if [ ! -x "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
        echo "Android SDK command-line tools not found. Installing into $ANDROID_SDK_ROOT..."
        mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" "$SCRIPT_DIR/.tmp"
        curl -L "$CMDLINE_TOOLS_URL" -o "$SCRIPT_DIR/.tmp/android-commandlinetools.zip"
        rm -rf "$ANDROID_SDK_ROOT/cmdline-tools/latest" "$SCRIPT_DIR/.tmp/cmdline-tools"
        unzip -q "$SCRIPT_DIR/.tmp/android-commandlinetools.zip" -d "$SCRIPT_DIR/.tmp"
        mv "$SCRIPT_DIR/.tmp/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
    fi

    yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
    "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
        "platform-tools" \
        "platforms;android-34" \
        "build-tools;34.0.0"

    python3 - "$LOCAL_PROPERTIES" "$ANDROID_SDK_ROOT" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
sdk = sys.argv[2]
lines = []
if path.exists():
    lines = [line for line in path.read_text().splitlines() if not line.startswith("sdk.dir=")]
lines.append(f"sdk.dir={sdk}")
path.write_text("\n".join(lines) + "\n")
PY
}

mkdir -p "$BUILDS_DIR"
ensure_android_sdk

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
ANDROID_HOME="$SDK_DIR" ANDROID_SDK_ROOT="$SDK_DIR" ./gradlew assembleRelease --no-daemon 2>&1

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
