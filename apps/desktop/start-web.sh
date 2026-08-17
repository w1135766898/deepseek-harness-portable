#!/usr/bin/env bash
set -euo pipefail

app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_exe="$app_root/runtime/DeepSeek Harness"
packaged_web="$app_root/runtime/resources/app/lib/packaged-bin.js"

if [[ ! -x "$runtime_exe" ]]; then
  printf 'DeepSeek Harness runtime was not found or is not executable: %s\n' "$runtime_exe" >&2
  exit 1
fi
if [[ ! -f "$packaged_web" ]]; then
  printf 'Packaged Web entry was not found: %s\n' "$packaged_web" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
exec "$runtime_exe" "$packaged_web" "$@"
