#!/bin/sh
set -eu

projectDirectory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
applicationPath="$projectDirectory/dist/linux-unpacked/disk-analyzer"
if [ ! -x "$applicationPath" ]; then
  echo 'The Linux build is missing. Build it with npm run build:linux first.'
  exit 1
fi
exec "$applicationPath" "$@"
