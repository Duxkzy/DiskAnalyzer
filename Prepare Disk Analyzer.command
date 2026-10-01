#!/bin/sh
set -eu

# Apply a local development signature to this app bundle on macOS.
# This changes only the adjacent application, not system security settings.
scriptDirectory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
applicationPath="$scriptDirectory/Disk Analyzer.app"

if [ "$(uname -s)" != "Darwin" ]; then
  echo 'This preparation command is for macOS only.'
  exit 1
fi
if [ ! -d "$applicationPath" ]; then
  echo 'Keep this command next to the extracted Disk Analyzer.app bundle.'
  exit 1
fi

echo 'Preparing the local Disk Analyzer development build…'
/usr/bin/codesign --force --deep --sign - --preserve-metadata=entitlements,flags,runtime "$applicationPath"
/usr/bin/codesign --verify --deep --strict "$applicationPath"
echo 'Local signature verified. Opening Disk Analyzer…'
/usr/bin/open "$applicationPath"
