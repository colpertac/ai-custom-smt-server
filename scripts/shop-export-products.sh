#!/usr/bin/env bash
# Flatten ShopProductData (+ item names / CP flag) → website/content/shops/shop-products.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${SHOP_PRODUCTS_OUT:-$ROOT/website/content/shops/shop-products.json}"
BIN="${COMP_BIN:-$ROOT/../comp_hack/build-localdeps-v31/bin}"
SBIN="${BINARYDATA_SHIELD:-$ROOT/../comp_hack/runtime/datastore/BinaryData/Shield}"
WORKDIR="${SHOP_EXTRACT_WORKDIR:-/tmp/smt-shop-extract}"
ITEM_FLAG_CP=64

for tool in comp_decrypt comp_bdpatch; do
  if [[ ! -x "$BIN/$tool" ]]; then
    echo "error: missing $BIN/$tool" >&2
    exit 1
  fi
done

for f in ShopProductData.sbin CItemData.sbin ItemData.sbin; do
  if [[ ! -f "$SBIN/$f" ]]; then
    echo "error: missing $SBIN/$f" >&2
    exit 1
  fi
done

mkdir -p "$WORKDIR" "$(dirname "$OUT")"

echo "Decrypt + flatten ShopProductData…"
"$BIN/comp_decrypt" "$SBIN/ShopProductData.sbin" "$WORKDIR/ShopProductData.plain.bin"
"$BIN/comp_bdpatch" flatten shopproduct "$WORKDIR/ShopProductData.plain.bin" \
  "$WORKDIR/ShopProductData.tsv"

echo "Decrypt + flatten CItemData / ItemData…"
"$BIN/comp_decrypt" "$SBIN/CItemData.sbin" "$WORKDIR/CItemData.plain.bin"
"$BIN/comp_bdpatch" flatten citem "$WORKDIR/CItemData.plain.bin" "$WORKDIR/CItemData.tsv"
"$BIN/comp_decrypt" "$SBIN/ItemData.sbin" "$WORKDIR/ItemData.plain.bin"
"$BIN/comp_bdpatch" flatten item "$WORKDIR/ItemData.plain.bin" "$WORKDIR/ItemData.tsv"

python3 - "$WORKDIR" "$OUT" "$ITEM_FLAG_CP" <<'PY'
import csv, json, sys
from pathlib import Path

workdir, out_path, flag_cp = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])

names = {}
with (workdir / "CItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        pid = (row.get("ID") or "").strip()
        if pid.isdigit():
            names[int(pid)] = (row.get("name") or "").strip()

flags = {}
with (workdir / "ItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("id") or "").strip()
        if iid.isdigit():
            try:
                flags[int(iid)] = int(row.get("flags") or 0)
            except ValueError:
                flags[int(iid)] = 0

products = {}
with (workdir / "ShopProductData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        pid = (row.get("ID") or "").strip()
        if not pid.isdigit():
            continue
        product_id = int(pid)
        try:
            item_id = int(row.get("item") or 0)
        except ValueError:
            item_id = 0
        try:
            stack = int(row.get("stack") or 1)
        except ValueError:
            stack = 1
        is_cp = bool(flags.get(item_id, 0) & flag_cp)
        entry = {
            "itemId": item_id,
            "stack": stack,
            "isCp": is_cp,
        }
        name = names.get(item_id)
        if name:
            entry["name"] = name
        products[str(product_id)] = entry

out_path.write_text(
    json.dumps({"version": 1, "products": products}, ensure_ascii=False, separators=(",", ":"))
    + "\n",
    encoding="utf-8",
)
print(f"Wrote {len(products)} products → {out_path}")
PY
