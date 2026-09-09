#!/usr/bin/env bash
# Refresh deploy/seed/server-content for install bundles.
# - shops: working CP shops from server-content/shops (override with COMP_SHOPS_SRC)
# - payouts + report-rewards: working copies from server-content/ (gitignored dev tree)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
WORKING_SRC="$REPO_ROOT/server-content"
COMP_SHOPS_SRC="${COMP_SHOPS_SRC:-$WORKING_SRC/shops}"
DEST="$DEPLOY_DIR/seed/server-content"

if [[ ! -d "$COMP_SHOPS_SRC" ]]; then
  echo "error: shops dir not found at $COMP_SHOPS_SRC" >&2
  exit 1
fi
if [[ ! -d "$WORKING_SRC/payouts" || ! -d "$WORKING_SRC/report-rewards" ]]; then
  echo "error: expected $WORKING_SRC/{payouts,report-rewards}" >&2
  exit 1
fi

mkdir -p "$DEST/shops"
shopt -s nullglob
shop_files=("$COMP_SHOPS_SRC"/compshop-*.xml)
if [[ ${#shop_files[@]} -eq 0 ]]; then
  echo "error: no compshop-*.xml in $COMP_SHOPS_SRC" >&2
  exit 1
fi
rm -f "$DEST/shops"/compshop-*.xml "$DEST/shops"/shop-order.json
cp -a "${shop_files[@]}" "$DEST/shops/"
if [[ -f "$COMP_SHOPS_SRC/shop-order.json" ]]; then
  cp -a "$COMP_SHOPS_SRC/shop-order.json" "$DEST/shops/"
fi
echo "staged ${#shop_files[@]} COMP shops from $COMP_SHOPS_SRC"

for sub in payouts report-rewards; do
  mkdir -p "$DEST/$sub"
  rsync -a --delete "$WORKING_SRC/$sub/" "$DEST/$sub/"
  echo "staged server-content/$sub -> deploy/seed/server-content/$sub"
done

"$SCRIPT_DIR/apply-install-payout-defaults.py" "$DEST"
