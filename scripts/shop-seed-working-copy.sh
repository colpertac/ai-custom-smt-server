#!/usr/bin/env bash
# Copy stock COMP shop XML into the website working-copy tree.
# Does not touch live runtime/datastore.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${COMP_SHOPS_SRC:-$ROOT/../comp_hack/datastore/shops}"
DEST="${COMP_SHOPS_DIR:-$ROOT/server-content/shops}"

if [[ ! -d "$SRC" ]]; then
  echo "error: shop source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST"
shopt -s nullglob
files=("$SRC"/compshop-*.xml)
if ((${#files[@]} == 0)); then
  echo "error: no compshop-*.xml under $SRC" >&2
  exit 1
fi

cp -f "${files[@]}" "$DEST/"
echo "Seeded ${#files[@]} COMP shops into $DEST"
ls -1 "$DEST"/compshop-*.xml
