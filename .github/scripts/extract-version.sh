#!/usr/bin/env bash
set -euo pipefail

PROJECT_ZIP="${PROJECT_ZIP:-Jot.xcodeproj.zip}"
PROJECT_DIR="Jot.xcodeproj"

# Unzip only if needed
if [ ! -d "$PROJECT_DIR" ]; then
  unzip -o "$PROJECT_ZIP" "$PROJECT_DIR/project.pbxproj" >/dev/null
fi

VERSION=$(grep -m1 'MARKETING_VERSION = ' "$PROJECT_DIR/project.pbxproj" | awk -F ' = ' '{ gsub(/;/,"",$2); print $2; exit }')
if [ -z "$VERSION" ]; then
  echo "Could not extract MARKETING_VERSION" >&2
  exit 1
fi

echo "v$VERSION"
