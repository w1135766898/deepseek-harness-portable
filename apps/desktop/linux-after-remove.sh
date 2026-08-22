#!/bin/sh
set -eu

target='/opt/DeepSeek Harness/deepseek-harness'
link='/usr/local/bin/dsh'

if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
  rm -f "$link"
fi
