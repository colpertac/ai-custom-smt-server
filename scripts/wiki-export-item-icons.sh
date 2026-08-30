#!/usr/bin/env bash
# Extract UI icons for wiki items (client TGA → public PNG, deduped by asset name).
#
# Requires: ImageMagick `convert`, items.json from wiki-export-items.sh,
#           Reimagine client Interface/tga/ (+ tga2/ fallback for newer assets)
#
# Usage:
#   scripts/wiki-export-item-icons.sh
#
# Env:
#   CLIENT_TGA   — primary TGA dir (default: …/Interface/tga)
#   CLIENT_TGA2  — secondary TGA dir (default: sibling tga2/)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_TGA="${CLIENT_TGA:-/home/cat/software/smt/game/reimagine/Interface/tga}"
CLIENT_TGA2="${CLIENT_TGA2:-$(dirname "$CLIENT_TGA")/tga2}"
JSON="$ROOT/website/content/wiki/items.json"
OUT_DIR="$ROOT/website/public/wiki/icons"

mkdir -p "$OUT_DIR"

if [[ ! -f "$JSON" ]]; then
  echo "Missing $JSON — run wiki-export-items.sh first" >&2
  exit 1
fi
if [[ ! -d "$CLIENT_TGA" && ! -d "$CLIENT_TGA2" ]]; then
  echo "Missing client TGA dirs: $CLIENT_TGA and $CLIENT_TGA2" >&2
  exit 1
fi
if ! command -v convert >/dev/null 2>&1; then
  echo "Missing ImageMagick convert" >&2
  exit 1
fi

python3 - "$CLIENT_TGA" "$CLIENT_TGA2" "$JSON" "$OUT_DIR" <<'PY'
import json, subprocess, sys
from pathlib import Path

tga_dir, tga2_dir, json_path, out_dir = (
    Path(sys.argv[1]),
    Path(sys.argv[2]),
    Path(sys.argv[3]),
    Path(sys.argv[4]),
)

def resolve_tga(asset: str) -> Path | None:
    for base in (tga_dir, tga2_dir):
        if not base.is_dir():
            continue
        candidate = base / f"icon_{asset}.tga"
        if candidate.is_file():
            return candidate
    return None

data = json.loads(json_path.read_text(encoding="utf-8"))
assets: set[str] = set()
for item in data["items"]:
    asset = item.get("iconAsset")
    if asset:
        assets.add(asset)

ok = 0
skip = 0
from_tga2 = 0
for asset in sorted(assets):
    png = out_dir / f"{asset}.png"
    if png.is_file():
        ok += 1
        continue
    tga = resolve_tga(asset)
    if tga is None:
        print(f"SKIP missing TGA: icon_{asset}.tga", file=sys.stderr)
        skip += 1
        continue
    if tga.parent.resolve() == tga2_dir.resolve():
        from_tga2 += 1
    subprocess.run(
        ["convert", str(tga), "-transparent", "black", "-alpha", "on", str(png)],
        check=True,
    )
    ok += 1
    if ok % 500 == 0:
        print(f"… {ok} icons", flush=True)

patched = 0
for item in data["items"]:
    asset = item.get("iconAsset")
    if not asset:
        item["iconSrc"] = None
        continue
    png = out_dir / f"{asset}.png"
    item["iconSrc"] = f"/wiki/icons/{asset}.png" if png.is_file() else None
    if item["iconSrc"]:
        patched += 1

data["iconsSource"] = (
    "reimagine/Interface/{tga,tga2}/icon_{CIconData_Item.value}.tga"
)
json_path.write_text(
    json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print(
    f"Icons: {ok} assets on disk ({from_tga2} from tga2), "
    f"{skip} missing TGA, {patched} items with iconSrc"
)
PY
