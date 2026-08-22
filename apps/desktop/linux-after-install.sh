#!/bin/sh
set -eu

target='/opt/DeepSeek Harness/deepseek-harness'
link='/usr/local/bin/dsh'

if [ ! -x "$target" ]; then
  echo "DeepSeek Harness: installed Linux runtime is missing or not executable: $target" >&2
  exit 1
fi

ln -sfn "$target" "$link"
