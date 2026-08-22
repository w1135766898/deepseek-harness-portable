#!/usr/bin/env bash
set -euo pipefail

app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_exe="$app_root/runtime/deepseek-harness"
packaged_web="$app_root/runtime/resources/app/lib/packaged-bin.js"
dsh_cli="$app_root/runtime/resources/app/node_modules/@deepseek-ai/dsh/lib/bin.js"

if [[ ! -x "$runtime_exe" ]]; then
  printf 'DeepSeek Harness runtime was not found or is not executable: %s\n' "$runtime_exe" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
if [[ $# -eq 0 || "$1" == 'web' || "$1" == -* ]]; then
  if [[ ! -f "$packaged_web" ]]; then
    printf 'Packaged Web entry was not found: %s\n' "$packaged_web" >&2
    exit 1
  fi
  if [[ $# -gt 0 && "$1" == 'web' ]]; then shift; fi
  exec "$runtime_exe" "$packaged_web" "$@"
fi

if [[ "$1" == 'desktop' ]]; then
  shift
  unset ELECTRON_RUN_AS_NODE
  exec "$runtime_exe" "$@"
fi

if [[ ! -f "$dsh_cli" ]]; then
  printf 'Embedded dsh CLI was not found: %s\n' "$dsh_cli" >&2
  exit 1
fi
exec "$runtime_exe" "$dsh_cli" "$@"
