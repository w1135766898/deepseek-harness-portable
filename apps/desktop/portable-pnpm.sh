#!/usr/bin/env bash
set -euo pipefail

app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_exe="$app_root/runtime/DeepSeek Harness"
pnpm_entry="$app_root/runtime/resources/app/node_modules/pnpm/bin/pnpm.cjs"

if [[ ! -x "$runtime_exe" ]]; then
  printf 'DeepSeek Harness runtime was not found or is not executable: %s\n' "$runtime_exe" >&2
  exit 1
fi
if [[ ! -f "$pnpm_entry" ]]; then
  printf 'Embedded pnpm was not found: %s\n' "$pnpm_entry" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
exec "$runtime_exe" "$pnpm_entry" "$@"
