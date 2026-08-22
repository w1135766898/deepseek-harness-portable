#!/usr/bin/env bash
set -euo pipefail

app_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_exe="$app_root/runtime/deepseek-harness"

if [[ ! -x "$runtime_exe" ]]; then
  printf 'DeepSeek Harness runtime was not found or is not executable: %s\n' "$runtime_exe" >&2
  exit 1
fi

exec "$runtime_exe" "$@"
