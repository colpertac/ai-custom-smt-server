#!/usr/bin/env bash
# Regenerate deploy/seed/updater (minimal empty overlay manifest for fresh installs).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
DEST="$DEPLOY_DIR/seed/updater"
REHASH="${OPS_REHASH:-${BIN_DIR:-$REPO_ROOT/../comp_hack/build-current/bin}/comp_rehash}"

if [[ ! -x "$REHASH" ]]; then
  echo "error: comp_rehash not found at $REHASH (build comp_hack or set OPS_REHASH)" >&2
  exit 1
fi

mkdir -p "$DEST/base" "$DEST/overlay" "$DEST/site"
stamp="$(date +%Y%m%d%H%M%S)"
{
  printf 'EXE : .\\ImagineClient.exe \r\n'
  printf 'VERSION : %s\r\n' "$stamp"
} >"$DEST/base/hashlist.dat"

rm -f "$DEST/overlay"/hashlist.*
"$REHASH" --base "$DEST/base" --overlay "$DEST/overlay"

if [[ -f "$REPO_ROOT/updater/site/index.html" ]]; then
  cp -a "$REPO_ROOT/updater/site/index.html" "$DEST/site/index.html"
fi

echo "staged updater seed -> $DEST"
ls -la "$DEST/overlay/hashlist.ver" "$DEST/overlay/hashlist.dat"
