#!/usr/bin/env bash
# Export full ItemData + CItemData catalog for the website wiki.
#
# Usage:
#   scripts/wiki-export-items.sh
#
# Writes: website/content/wiki/items.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-$ROOT/../comp_hack/build-localdeps-v31/bin}"
if [[ ! -x "$BIN/comp_bdpatch" ]]; then
  BIN="$ROOT/../comp_hack/build-current/bin"
fi
SBIN="${BINARYDATA_SHIELD:-$ROOT/../comp_hack/runtime/datastore/BinaryData/Shield}"
TOKUSEI_DIR="${TOKUSEI_DIR:-$ROOT/../comp_hack/runtime/datastore/data/tokusei}"
CICON_BIN="${CICON_BIN:-$ROOT/../comp_hack/runtime/datastore/BinaryData/Client/CIconData_Item.bin}"
CITEM_XML="${CITEM_XML:-$ROOT/client-source/BinaryData/Shield/CItemData.xml}"
if [[ ! -f "$CITEM_XML" ]]; then
  CITEM_XML="$ROOT/translation/extract/reimagine/CItemData.xml"
fi
WORKDIR="${WORKDIR:-/tmp/smt-wiki-extract}"
OUT="$ROOT/website/content/wiki/items.json"

mkdir -p "$WORKDIR" "$(dirname "$OUT")"

for tool in comp_decrypt comp_bdpatch; do
  if [[ ! -x "$BIN/$tool" ]]; then
    echo "error: missing $BIN/$tool" >&2
    exit 1
  fi
done
for f in ItemData.sbin CItemData.sbin SItemData.sbin; do
  if [[ ! -f "$SBIN/$f" ]]; then
    echo "error: missing $SBIN/$f" >&2
    exit 1
  fi
done
if [[ ! -d "$TOKUSEI_DIR" ]]; then
  echo "error: missing tokusei dir $TOKUSEI_DIR" >&2
  exit 1
fi
if [[ ! -f "$CICON_BIN" ]]; then
  echo "error: missing $CICON_BIN" >&2
  exit 1
fi
if [[ ! -f "$CITEM_XML" ]]; then
  echo "error: missing CItemData.xml (needed for description newlines)" >&2
  exit 1
fi

echo "Decrypt + flatten ItemData / CItemData / SItemData…"
"$BIN/comp_decrypt" "$SBIN/ItemData.sbin" "$WORKDIR/ItemData.plain.bin"
"$BIN/comp_bdpatch" flatten item "$WORKDIR/ItemData.plain.bin" "$WORKDIR/ItemData.tsv"
"$BIN/comp_decrypt" "$SBIN/CItemData.sbin" "$WORKDIR/CItemData.plain.bin"
"$BIN/comp_bdpatch" flatten citem "$WORKDIR/CItemData.plain.bin" "$WORKDIR/CItemData.tsv"
"$BIN/comp_decrypt" "$SBIN/SItemData.sbin" "$WORKDIR/SItemData.plain.bin"
"$BIN/comp_bdpatch" flatten sitem "$WORKDIR/SItemData.plain.bin" "$WORKDIR/SItemData.tsv"

echo "Flatten CIconData_Item…"
"$BIN/comp_bdpatch" flatten cicon "$CICON_BIN" "$WORKDIR/CIconData_Item.tsv"

python3 - "$WORKDIR" "$CITEM_XML" "$TOKUSEI_DIR" "$OUT" <<'PY'
import csv, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

workdir, citem_xml, tokusei_dir, out_path = (
    Path(sys.argv[1]),
    Path(sys.argv[2]),
    Path(sys.argv[3]),
    Path(sys.argv[4]),
)

STAT_LABELS = {
    "CLSR": "Close-range", "LNGR": "Long-range", "SPELL": "Spell",
    "SUPPORT": "Support", "CRITICAL": "Critical", "PDEF": "Phys defense",
    "MDEF": "Magic defense", "STR": "STR", "MAGIC": "MAG", "VIT": "VIT",
    "INT": "INT", "SPEED": "SPD", "LUCK": "LUK",
    "COOLDOWN_TIME": "Cooldown time", "RES_STATUS": "Resist status",
    "RATE_XP": "XP rate", "RATE_MAG": "Magnetite rate", "RATE_MACCA": "Macca rate",
    "RATE_EXPERTISE": "Expertise rate", "RATE_CLSR": "Close-range damage",
    "RATE_LNGR": "Long-range damage", "RATE_SPELL": "Spell damage",
    "RATE_SUPPORT": "Support effect", "RATE_HEAL": "Healing effect",
    "RATE_CLSR_TAKEN": "Close-range damage taken", "RATE_LNGR_TAKEN": "Long-range damage taken",
    "RATE_SPELL_TAKEN": "Spell damage taken", "RATE_SUPPORT_TAKEN": "Support damage taken",
    "RATE_HEAL_TAKEN": "Healing received", "LB_CHANCE": "Limit break chance",
    "LB_DAMAGE": "Limit break power", "FINAL_CRIT_CHANCE": "Final crit chance",
    "CHANT_TIME": "Chant time",
    "RES_FIRE": "Resist Fire", "RES_ICE": "Resist Ice",
    "RES_ELEC": "Resist Elec", "RES_FORCE": "Resist Force",
    "RES_SLASH": "Resist Slash", "RES_THRUST": "Resist Thrust",
    "RES_ALMIGHTY": "Resist Almighty", "RES_EXPEL": "Resist Expel",
    "RES_CURSE": "Resist Curse", "RES_MAGICFORCE": "Resist Magic Force",
    "RES_NERVE": "Resist Nerve",
}
ASPECT_LABELS = {
    "DAMAGE_DEALT": "Damage dealt",
    "DAMAGE_TAKEN": "Damage taken",
    "SKILL_STACK_ADJUST": "Skill stack adjust",
    "STATUS_NULL": "Status null",
    "STATUS_ADD": "Status add",
    "EFFECT_POWER": "Effect power",
    "PURSUIT_RATE": "Pursuit rate",
    "PURSUIT_POWER": "Pursuit power",
}
PCT_STAT_IDS = frozenset(
    {
        "LB_CHANCE",
        "LB_DAMAGE",
        "FINAL_CRIT_CHANCE",
        "CHANT_TIME",
        "COOLDOWN_TIME",
    }
)
GENDER_LABELS = {0: "Male", 1: "Female", 2: "Any"}


def stat_label(sid: str) -> str:
    return STAT_LABELS.get(sid, sid.replace("_", " "))


def format_stat_value(sid: str, val: int) -> str:
    if sid.startswith("RATE_") or sid.startswith("BOOST_") or sid in PCT_STAT_IDS:
        return f"{val:+d}%"
    return f"{val:+d}"


def parse_correct(s: str):
    out = []
    for m in re.finditer(
        r"ID:\s*([A-Z0-9_]+),\s*Type:\s*(-?\d+),\s*Value:\s*(-?\d+)", s or ""
    ):
        sid, typ, val = m.group(1), int(m.group(2)), int(m.group(3))
        out.append(
            {
                "id": sid,
                "label": stat_label(sid),
                "type": typ,
                "value": val,
            }
        )
    return out


def split_correct(s: str):
    parsed = parse_correct(s)
    basic = [row for row in parsed if row["type"] == 0]
    characteristics = [row for row in parsed if row["type"] in (1, 2)]
    return basic, characteristics


def clean_desc(d: str) -> str:
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


def load_icons_from_xml(path: Path) -> dict[int, int]:
    text = path.read_text(encoding="utf-8", errors="replace")
    icons: dict[int, int] = {}
    for m in re.finditer(
        r'<member name="ID">(\d+)</member>.*?<member name="icon">(\d+)</member>',
        text,
        re.S,
    ):
        icons[int(m.group(1))] = int(m.group(2))
    return icons


def safe_int(raw: str | None, default: int = 0) -> int:
    s = (raw or "").strip()
    if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
        return int(s)
    return default


def parse_sitem_tokusei_ids(raw: str) -> list[int]:
    ids = []
    for part in re.findall(r"\{?\s*(-?\d+)\s*\}?", raw or ""):
        if part.isdigit() or (part.startswith("-") and part[1:].isdigit()):
            val = int(part)
            if val > 0:
                ids.append(val)
    return ids


def load_tokusei_index(tokusei_root: Path) -> dict[int, list[str]]:
    index: dict[int, list[str]] = {}
    for path in sorted(tokusei_root.glob("tokusei_*.xml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r"<object name=\"Tokusei\">\s*<member name=\"ID\">(\d+)</member>(.*?)(?=<object name=\"Tokusei\">|\Z)",
            text,
            re.S,
        ):
            tid = int(m.group(1))
            body = m.group(2)
            lines: list[str] = []
            for cm in re.finditer(
                r"<member name=\"ID\">([A-Z0-9_]+)</member>\s*<member name=\"Value\">(-?\d+)</member>",
                body,
                re.S,
            ):
                sid, val = cm.group(1), int(cm.group(2))
                if sid.isdigit():
                    continue
                lines.append(f"{stat_label(sid)} {format_stat_value(sid, val)}")
            for am in re.finditer(
                r"<member name=\"Type\">([A-Z0-9_]+)</member>\s*<member name=\"Value\">(-?\d+)</member>",
                body,
                re.S,
            ):
                atype, val = am.group(1), int(am.group(2))
                label = ASPECT_LABELS.get(atype, atype.replace("_", " "))
                lines.append(f"{label} {val:+d}")
            if lines:
                index[tid] = lines
    return index


tokusei_index = load_tokusei_index(tokusei_dir)

sitem_tokusei: dict[int, list[int]] = {}
with (workdir / "SItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("ID") or "").strip()
        if iid.isdigit():
            sitem_tokusei[int(iid)] = parse_sitem_tokusei_ids(row.get("tokusei") or "")


def resolve_set_bonus(item_id: int) -> list[str]:
    lines: list[str] = []
    for tok_id in sitem_tokusei.get(item_id, []):
        for line in tokusei_index.get(tok_id, []):
            if line not in lines:
                lines.append(line)
    return lines


icons: dict[int, str] = {}
with (workdir / "CIconData_Item.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("ID") or "").strip()
        if iid.isdigit():
            icons[int(iid)] = (row.get("value") or "").strip()

names: dict[int, dict[str, str]] = {}
with (workdir / "CItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("ID") or "").strip()
        if iid.isdigit():
            names[int(iid)] = row

xml_descs = load_descs_from_xml(citem_xml)
xml_icons = load_icons_from_xml(citem_xml)

items = []
with (workdir / "ItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("id") or "").strip()
        if not iid.isdigit():
            continue
        item_id = int(iid)
        c = names.get(item_id, {})
        wt = row.get("weaponType") or ""
        g = gender_fields(row.get("gender") or "2")
        icon_id = safe_int(c.get("icon"))
        if icon_id == 0:
            icon_id = xml_icons.get(item_id, 0)
        icon_asset = icons.get(icon_id) or None
        raw_desc = xml_descs.get(item_id, c.get("desc") or "")
        name = (c.get("name") or "").strip() or f"Item {item_id}"
        basic_features, characteristics = split_correct(row.get("correctTbl") or "")
        set_bonus = resolve_set_bonus(item_id)
        items.append(
            {
                "id": item_id,
                "name": name,
                "description": clean_desc(raw_desc),
                "icon": icon_id,
                "iconAsset": icon_asset,
                "iconSrc": None,
                "equipType": row.get("equipType") or "",
                "equipSlot": slot_label(row.get("equipType") or ""),
                "weaponType": None if not wt or wt == "0" or wt == "NONE" else wt,
                "gender": g["gender"],
                "genderLabel": g["genderLabel"],
                "buyPrice": int(row.get("buyPrice") or 0),
                "sellPrice": int(row.get("sellPrice") or 0),
                "level": int(row.get("level") or 0),
                "durability": int(row.get("durability") or 0),
                "stackSize": int(row.get("stackSize") or 0),
                "setBonus": set_bonus,
                "basicFeatures": basic_features,
                "characteristics": characteristics,
                "stats": basic_features,
            }
        )

items.sort(key=lambda i: i["id"])

payload = {
    "source": "BinaryData/Shield/{ItemData,CItemData}.sbin",
    "namesSource": "BinaryData/Shield/CItemData.sbin (flatten)",
    "descsSource": str(citem_xml.as_posix()),
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "Full BinaryData item catalog.",
    "items": items,
}
out_path.write_text(
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print(f"Wrote {out_path} ({len(items)} items)")
PY
