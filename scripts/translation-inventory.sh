#!/usr/bin/env bash
# Catalog client text-bearing assets for Phase 8.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/translation/inventory"
REI="${REI:-/home/cat/software/smt/game/reimagine}"
JP="${JP:-/home/cat/software/smt/game/smt_1666/MegaTen jp}"

mkdir -p "$OUT_DIR"

manifest() {
  local label="$1" root="$2" out="$3"
  {
    echo -e "label\tcategory\trelpath\tbytes"
    find "$root/BinaryData/Client" -type f \( -name '*.bin' -o -name '*.sbin' \) 2>/dev/null \
      | sort | while read -r f; do
          rel="${f#"$root/"}"
          echo -e "${label}\tclient\t${rel}\t$(stat -c%s "$f")"
        done
    find "$root/BinaryData/Shield" -type f -name '*.sbin' 2>/dev/null \
      | sort | while read -r f; do
          rel="${f#"$root/"}"
          echo -e "${label}\tshield\t${rel}\t$(stat -c%s "$f")"
        done
    find "$root/Event/MultiTalk" -type f -name '*.bin' 2>/dev/null \
      | sort | while read -r f; do
          rel="${f#"$root/"}"
          echo -e "${label}\tmultitalk\t${rel}\t$(stat -c%s "$f")"
        done
    find "$root/Event/PolygonMovie" -type f -name '*.bin' 2>/dev/null \
      | sort | while read -r f; do
          rel="${f#"$root/"}"
          echo -e "${label}\tpolygonmovie\t${rel}\t$(stat -c%s "$f")"
        done
  } >"$out"
}

manifest reimagine "$REI" "$OUT_DIR/manifest-reimagine.tsv"
manifest jp "$JP" "$OUT_DIR/manifest-jp.tsv"

python3 - <<'PY' "$OUT_DIR"
from collections import Counter
from pathlib import Path
import sys
out = Path(sys.argv[1])
for name in ["manifest-reimagine.tsv", "manifest-jp.tsv"]:
    rows = out.joinpath(name).read_text(encoding="utf-8").splitlines()[1:]
    c = Counter(r.split("\t")[1] for r in rows if r.strip())
    print(f"{name}: {dict(c)} total={sum(c.values())}")
PY

echo "Wrote $OUT_DIR/manifest-reimagine.tsv and manifest-jp.tsv"
echo "Narrative inventory: $OUT_DIR/sources.md"
