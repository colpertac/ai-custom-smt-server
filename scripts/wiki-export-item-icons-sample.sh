#!/usr/bin/env bash
# Extract UI icons for wiki sample items (client TGA → public PNG).
#
# Requires: ImageMagick `convert`, items-sample.json already generated,
#           Reimagine client Interface/tga/, CIconData_Item.bin
#
# Usage:
#   scripts/wiki-export-item-icons-sample.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-/home/cat/repos/smt/comp_hack/build-localdeps-v31/bin}"
CLIENT_TGA="${CLIENT_TGA:-/home/cat/software/smt/game/reimagine/Interface/tga}"
CICON_BIN="${CICON_BIN:-/home/cat/repos/smt/comp_hack/runtime/datastore/BinaryData/Client/CIconData_Item.bin}"
JSON="$ROOT/website/content/wiki/items-sample.json"
OUT_DIR="$ROOT/website/public/wiki/icons"
WORKDIR="${WORKDIR:-/tmp/smt-wiki-icons}"

mkdir -p "$WORKDIR" "$OUT_DIR"

if [[ ! -f "$JSON" ]]; then
  echo "Missing $JSON — run wiki-export-items-sample.sh first" >&2
  exit 1
fi
if [[ ! -d "$CLIENT_TGA" ]]; then
  echo "Missing client TGA dir: $CLIENT_TGA" >&2
  exit 1
fi

"$BIN/comp_bdpatch" flatten cicon "$CICON_BIN" "$WORKDIR/CIconData_Item.tsv"

python3 - "$WORKDIR/CIconData_Item.tsv" "$CLIENT_TGA" "$JSON" "$OUT_DIR" <<'PY'
import csv, json, subprocess, sys
from pathlib import Path

cicon_path, tga_dir, json_path, out_dir = map(Path, sys.argv[1:5])
icons = {}
with cicon_path.open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        icons[int(row["ID"])] = row["value"].strip()

data = json.loads(json_path.read_text(encoding="utf-8"))
for item in data["items"]:
    icon_id = int(item["icon"])
    asset = icons.get(icon_id)
    item["iconAsset"] = asset
    item["iconSrc"] = None
    if not asset:
        print(f"SKIP {item['id']}: no CIconData for icon {icon_id}", file=sys.stderr)
        continue
    tga = tga_dir / f"icon_{asset}.tga"
    if not tga.is_file():
        print(f"SKIP {item['id']}: missing {tga}", file=sys.stderr)
        continue
    png = out_dir / f"{item['id']}.png"
    subprocess.run(
        ["convert", str(tga), "-transparent", "black", "-alpha", "on", str(png)],
        check=True,
    )
    item["iconSrc"] = f"/wiki/icons/{item['id']}.png"
    print(f"OK {item['id']} {asset} -> {png.name}")

data["iconsSource"] = "reimagine/Interface/tga/icon_{CIconData_Item.value}.tga"
json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
