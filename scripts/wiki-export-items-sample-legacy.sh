#!/usr/bin/env bash
# Export a small ItemData+CItemData sample for the website wiki prototype.
#
# Usage:
#   scripts/wiki-export-items-sample.sh
#
# Writes: website/content/wiki/items-sample.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-/home/cat/repos/smt/comp_hack/build-localdeps-v31/bin}"
# Prefer localdeps bdpatch; fall back to build-current if present later
if [[ ! -x "$BIN/comp_bdpatch" ]]; then
  BIN=/home/cat/repos/smt/comp_hack/build-current/bin
fi
DATASTORE="${DATASTORE:-/home/cat/repos/smt/comp_hack/runtime/datastore/BinaryData/Shield}"
CITEM_TSV="${CITEM_TSV:-$ROOT/translation/extract/reimagine/CItemData.tsv}"
# XML keeps soft-wrap newlines that flatten TSV drops (tochopping → to chopping).
CITEM_XML="${CITEM_XML:-$ROOT/client-source/BinaryData/Shield/CItemData.xml}"
if [[ ! -f "$CITEM_XML" ]]; then
  CITEM_XML="$ROOT/translation/extract/reimagine/CItemData.xml"
fi
WORKDIR="${WORKDIR:-/tmp/smt-wiki-extract}"
OUT="$ROOT/website/content/wiki/items-sample.json"

mkdir -p "$WORKDIR" "$(dirname "$OUT")"

if [[ ! -x "$BIN/comp_decrypt" || ! -x "$BIN/comp_bdpatch" ]]; then
  echo "Need comp_decrypt + comp_bdpatch under $BIN" >&2
  exit 1
fi
if [[ ! -f "$DATASTORE/ItemData.sbin" ]]; then
  echo "Missing $DATASTORE/ItemData.sbin" >&2
  exit 1
fi
if [[ ! -f "$CITEM_TSV" ]]; then
  echo "Missing $CITEM_TSV — run translation-extract-table.sh citem Shield/CItemData.sbin" >&2
  exit 1
fi
if [[ ! -f "$CITEM_XML" ]]; then
  echo "Missing CItemData.xml (needed for description newlines)" >&2
  exit 1
fi

"$BIN/comp_decrypt" "$DATASTORE/ItemData.sbin" "$WORKDIR/ItemData.plain.bin"
"$BIN/comp_bdpatch" flatten item "$WORKDIR/ItemData.plain.bin" "$WORKDIR/ItemData.tsv"

python3 - "$WORKDIR/ItemData.tsv" "$CITEM_TSV" "$CITEM_XML" "$OUT" <<'PY'
import csv, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

item_path, citem_tsv, citem_xml, out_path = sys.argv[1:5]
SAMPLE_IDS = [1, 2, 1201, 1202, 1206, 3004, 3007, 3101, 3102, 3104]
STAT_LABELS = {
    "CLSR": "Close-range", "LNGR": "Long-range", "SPELL": "Spell",
    "SUPPORT": "Support", "CRITICAL": "Critical", "PDEF": "Phys defense",
    "MDEF": "Magic defense", "STR": "STR", "MAGIC": "MAG", "VIT": "VIT",
    "INT": "INT", "SPEED": "SPD", "LUCK": "LUK",
    "RES_FIRE": "Resist Fire", "RES_ICE": "Resist Ice",
    "RES_ELEC": "Resist Elec", "RES_FORCE": "Resist Force",
    "RES_SLASH": "Resist Slash", "RES_THRUST": "Resist Thrust",
    "RES_ALMIGHTY": "Resist Almighty", "RES_EXPEL": "Resist Expel",
    "RES_CURSE": "Resist Curse", "RES_MAGICFORCE": "Resist Magic Force",
    "RES_NERVE": "Resist Nerve",
}
# COMP Constants.h: GENDER_MALE=0, GENDER_FEMALE=1, GENDER_NA=2
GENDER_LABELS = {0: "Male", 1: "Female", 2: "Any"}

def parse_correct(s: str):
    out = []
    for m in re.finditer(r"ID:\s*([A-Z0-9_]+),\s*Type:\s*(-?\d+),\s*Value:\s*(-?\d+)", s or ""):
        sid, typ, val = m.group(1), int(m.group(2)), int(m.group(3))
        out.append({"id": sid, "label": STAT_LABELS.get(sid, sid), "type": typ, "value": val})
    return out

def clean_desc(d: str) -> str:
    """Normalize CItemData soft wraps: newlines and * are breaks, not word glue."""
    s = (d or "").replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\n", " ")
    s = re.sub(r"\*+", " ", s)
    return re.sub(r"[ \t]+", " ", s).strip()

def slot_label(equip: str) -> str:
    return equip.replace("EQUIP_TYPE_", "").replace("_", " ").title() if equip else "None"

def gender_fields(raw: str):
    code = int(raw or 2)
    return {"gender": code, "genderLabel": GENDER_LABELS.get(code, f"Unknown({code})")}

def load_descs_from_xml(path: Path) -> dict[int, str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    descs: dict[int, str] = {}
    for m in re.finditer(
        r'<member name="ID">(\d+)</member>.*?<member name="desc"><!\[CDATA\[(.*?)\]\]></member>',
        text,
        re.S,
    ):
        descs[int(m.group(1))] = m.group(2)
    return descs

names = {}
with open(citem_tsv, newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        names[int(row["ID"])] = row

xml_descs = load_descs_from_xml(Path(citem_xml))

items_by_id = {}
with open(item_path, newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        items_by_id[int(row["id"])] = row

items = []
for iid in SAMPLE_IDS:
    r = items_by_id[iid]
    c = names[iid]
    wt = r["weaponType"]
    g = gender_fields(r.get("gender") or "2")
    raw_desc = xml_descs.get(iid, c.get("desc") or "")
    items.append({
        "id": iid,
        "name": c["name"],
        "description": clean_desc(raw_desc),
        "icon": int(c["icon"] or 0),
        "equipType": r["equipType"],
        "equipSlot": slot_label(r["equipType"]),
        "weaponType": None if not wt or wt == "0" else wt,
        "gender": g["gender"],
        "genderLabel": g["genderLabel"],
        "buyPrice": int(r["buyPrice"] or 0),
        "sellPrice": int(r["sellPrice"] or 0),
        "level": int(r["level"] or 0),
        "durability": int(r["durability"] or 0),
        "stackSize": int(r["stackSize"] or 0),
        "stats": parse_correct(r.get("correctTbl") or ""),
    })

payload = {
    "source": "comp_hack/runtime/datastore/BinaryData/Shield/{ItemData,CItemData}.sbin",
    "namesSource": "translation/extract/reimagine/CItemData.tsv",
    "descsSource": str(Path(citem_xml).as_posix()),
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "Phase 16B prototype sample — not the full catalog.",
    "items": items,
}
Path(out_path).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote {out_path} ({len(items)} items)")
for i in items:
    if i["id"] in (1201, 3104, 3004):
        print(f"  {i['id']}: {i['description'][:90]}...")
PY
