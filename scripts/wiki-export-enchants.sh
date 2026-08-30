#!/usr/bin/env bash
# Export EnchantData (tarot / soul fusion stats) for wiki + armory.
#
# Usage:
#   scripts/wiki-export-enchants.sh
#
# Writes: website/content/wiki/enchants.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-$ROOT/../comp_hack/build-localdeps-v31/bin}"
if [[ ! -x "$BIN/comp_bdpatch" ]]; then
  BIN="$ROOT/../comp_hack/build-current/bin"
fi
SBIN="${BINARYDATA_SHIELD:-$ROOT/../comp_hack/runtime/datastore/BinaryData/Shield}"
TOKUSEI_DIR="${TOKUSEI_DIR:-$ROOT/../comp_hack/runtime/datastore/data/tokusei}"
WORKDIR="${WORKDIR:-/tmp/smt-wiki-enchant-extract}"
OUT="$ROOT/website/content/wiki/enchants.json"
ITEMS_TSV="${ITEMS_TSV:-}"

mkdir -p "$WORKDIR" "$(dirname "$OUT")"

for tool in comp_decrypt comp_bdpatch; do
  if [[ ! -x "$BIN/$tool" ]]; then
    echo "error: missing $BIN/$tool" >&2
    exit 1
  fi
done
if [[ ! -f "$SBIN/EnchantData.sbin" ]]; then
  echo "error: missing $SBIN/EnchantData.sbin" >&2
  exit 1
fi
if [[ ! -d "$TOKUSEI_DIR" ]]; then
  echo "error: missing tokusei dir $TOKUSEI_DIR" >&2
  exit 1
fi

echo "Decrypt + flatten EnchantData…"
"$BIN/comp_decrypt" "$SBIN/EnchantData.sbin" "$WORKDIR/EnchantData.plain.bin"
"$BIN/comp_bdpatch" flatten enchant "$WORKDIR/EnchantData.plain.bin" "$WORKDIR/EnchantData.tsv"

if [[ -z "$ITEMS_TSV" ]]; then
  if [[ -f /tmp/smt-wiki-extract/CItemData.tsv ]]; then
    ITEMS_TSV=/tmp/smt-wiki-extract/CItemData.tsv
  elif [[ -f "$WORKDIR/CItemData.tsv" ]]; then
    ITEMS_TSV="$WORKDIR/CItemData.tsv"
  else
  echo "Flatten CItemData for crystal / tarot names…"
  "$BIN/comp_decrypt" "$SBIN/CItemData.sbin" "$WORKDIR/CItemData.plain.bin"
  "$BIN/comp_bdpatch" flatten citem "$WORKDIR/CItemData.plain.bin" "$WORKDIR/CItemData.tsv"
    ITEMS_TSV="$WORKDIR/CItemData.tsv"
  fi
fi

python3 - "$WORKDIR" "$TOKUSEI_DIR" "$ITEMS_TSV" "$OUT" <<'PY'
import csv, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

workdir, tokusei_dir, citem_tsv, out_path = (
    Path(sys.argv[1]),
    Path(sys.argv[2]),
    Path(sys.argv[3]),
    Path(sys.argv[4]),
)

ENCHANT_ENABLE_EFFECT = 0x7FFF

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
    "MP_MAX": "MAX MP", "HP_MAX": "MAX HP",
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


def stat_label(sid: str) -> str:
    return STAT_LABELS.get(sid, sid.replace("_", " "))


def format_stat_value(sid: str, val: int) -> str:
    if sid.startswith("RATE_") or sid.startswith("BOOST_") or sid in PCT_STAT_IDS:
        return f"{val:+d}%"
    return f"{val:+d}"


def parse_tokusei_ids(raw: str) -> list[int]:
    ids = []
    for part in re.findall(r"\{?\s*(-?\d+)\s*\}?", raw or ""):
        val = int(part)
        if val > 0:
            ids.append(val)
    return ids


def parse_conditions(raw: str) -> list[dict]:
    out: list[dict] = []
    for m in re.finditer(
        r"\{ type: (\d+), \{ (\d+) \}, \{ (\d+) \}, \{ (\d+) \}, \{ (\d+) \} \}",
        raw or "",
    ):
        t1, t2 = int(m.group(4)), int(m.group(5))
        tokusei_ids = [x for x in (t1, t2) if x > 0]
        if int(m.group(1)) == 0 and not tokusei_ids:
            continue
        out.append(
            {
                "type": int(m.group(1)),
                "params": [int(m.group(2)), int(m.group(3))],
                "tokuseiIds": tokusei_ids,
            }
        )
    return out


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


def clean_text(s: str) -> str:
    s = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\*+", " ", s)
    return re.sub(r"[ \t]+", " ", s).strip()


def split_desc_lines(desc: str) -> list[str]:
    s = clean_text(desc)
    if not s:
        return []
    chunks = re.split(r"(?=If Player )", s)
    lines: list[str] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        if chunk.startswith("-") or chunk.startswith("If Player"):
            lines.append(chunk)
            continue
        stat_parts = re.findall(
            r"(?:[+−-]\d+%?(?:\.\d+)?%?\s*(?:[A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)*))",
            chunk,
        )
        if len(stat_parts) >= 2:
            lines.extend(part.strip() for part in stat_parts if part.strip())
        else:
            lines.append(chunk)
    return lines


def resolve_tokusei_lines(tokusei_index: dict[int, list[str]], raw: str) -> list[str]:
    lines: list[str] = []
    for tok_id in parse_tokusei_ids(raw):
        for line in tokusei_index.get(tok_id, []):
            if line not in lines:
                lines.append(line)
    return lines


def parse_charastic(
    fields: list[str],
    start: int,
    tokusei_index: dict[int, list[str]],
    *,
    allow_desc_spill: bool = False,
):
    name = fields[start] if start < len(fields) else ""
    desc = fields[start + 1] if start + 1 < len(fields) else ""
    tok_raw = fields[start + 5] if start + 5 < len(fields) else ""
    cond_raw = fields[start + 6] if start + 6 < len(fields) else ""
    if allow_desc_spill and start + 7 < len(fields):
        extra = fields[start + 7].strip()
        if extra and not extra.isdigit() and "type:" not in extra and not extra.startswith("{"):
            desc = f"{desc} {extra}".strip()
    tok_lines = resolve_tokusei_lines(tokusei_index, tok_raw)
    desc_lines = split_desc_lines(desc)
    lines: list[str] = []
    for line in tok_lines:
        if line not in lines:
            lines.append(line)
    for line in desc_lines:
        if line in lines:
            continue
        if (
            not tok_lines
            or line.startswith("-")
            or line.startswith("If Player")
            or "%" in line
        ):
            lines.append(line)
    return {
        "name": clean_text(name),
        "desc": clean_text(desc),
        "tokuseiIds": parse_tokusei_ids(tok_raw),
        "conditions": parse_conditions(cond_raw),
        "lines": lines,
    }


tokusei_index = load_tokusei_index(tokusei_dir)

item_names: dict[int, str] = {}
with Path(citem_tsv).open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("ID") or "").strip()
        if iid.isdigit():
            item_names[int(iid)] = (row.get("name") or "").strip()

tsv_text = (workdir / "EnchantData.tsv").read_text(encoding="utf-8", errors="replace")
parts = re.split(r"(?m)^(\d+)\t", tsv_text)

enchants: dict[str, dict] = {}
by_crystal_item: dict[str, int] = {}

for i in range(1, len(parts), 2):
    eid = int(parts[i])
    fields = parts[i + 1].split("\t")
    if len(fields) < 11:
        continue
    crystal_item_id = int(fields[1]) if fields[1].isdigit() else 0
    usage = int(fields[3]) if fields[3].isdigit() else 0
    tarot = parse_charastic(fields, 4, tokusei_index)
    soul = parse_charastic(fields, 11, tokusei_index, allow_desc_spill=True)
    source_name = item_names.get(crystal_item_id) or None
    enchants[str(eid)] = {
        "id": eid,
        "demonId": int(fields[0]) if fields[0].isdigit() else 0,
        "crystalItemId": crystal_item_id,
        "sourceName": source_name,
        "usage": usage,
        "tarot": tarot,
        "soul": soul,
    }
    if crystal_item_id > 0:
        by_crystal_item[str(crystal_item_id)] = eid

payload = {
    "source": "BinaryData/Shield/EnchantData.sbin",
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "Tarot / soul fusion stats keyed by enchant ID (stored on equipped items).",
    "enchantEnableEffect": ENCHANT_ENABLE_EFFECT,
    "enchants": enchants,
    "byCrystalItemId": by_crystal_item,
}
out_path.write_text(
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print(f"Wrote {out_path} ({len(enchants)} enchants)")
PY
