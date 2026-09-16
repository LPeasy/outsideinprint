#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
hugo_bin="$repo_dir/.tools/hugo-0.164.0/hugo"
preview_port="${OIP_V2_PORT:-1314}"

if [ ! -x "$hugo_bin" ]; then
  printf '%s\n' "Missing Hugo 0.164.0 at $hugo_bin" >&2
  printf '%s\n' "Install the pinned local runtime before starting the v2 preview." >&2
  exit 1
fi

exec "$hugo_bin" server \
  -D \
  --config "$repo_dir/hugo.toml,$repo_dir/hugo.v2.toml" \
  --bind 127.0.0.1 \
  --port "$preview_port" \
  --baseURL "http://127.0.0.1:$preview_port/" \
  --disableFastRender
