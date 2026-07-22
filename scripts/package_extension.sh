#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
extension_dir="$project_dir/chrome-extension"
dist_dir="$project_dir/dist"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$extension_dir/manifest.json")"
archive="$dist_dir/signalscope-$version.zip"

mkdir -p "$dist_dir"
rm -f "$archive"
(
  cd "$extension_dir"
  zip -qr "$archive" . -x '*.DS_Store' -x '__pycache__/*' -x 'icons/icon-master-v2.png'
)
printf '%s\n' "$archive"
