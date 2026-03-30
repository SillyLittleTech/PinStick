#!/usr/bin/env bash
set -euo pipefail

PROJECT_ZIP="${PROJECT_ZIP:-Jot.xcodeproj.zip}"
PROJECT_DIR="Jot.xcodeproj"
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t jotproj)"
trap 'rm -rf "$TMP_DIR"' EXIT

unzip -o "$PROJECT_ZIP" "$PROJECT_DIR/project.pbxproj" -d "$TMP_DIR" >/dev/null
PBXPROJ="$TMP_DIR/$PROJECT_DIR/project.pbxproj"

VERSION=$(grep -m1 'MARKETING_VERSION = ' "$PBXPROJ" | awk -F ' = ' '{ gsub(/;/,"",$2); print $2; exit }')
if [ -z "$VERSION" ]; then
  echo "Could not extract MARKETING_VERSION" >&2
  exit 1
fi

echo "v$VERSION"
