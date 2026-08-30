#!/usr/bin/env bash
# Export passive skills, expertise rank skills, tokusei corrections, and SItem
# tokusei ids for offline armory stat calculation.
#
# Usage:
#   scripts/wiki-export-armory-stats.sh
#
# Writes:
#   website/content/armory/passive-skills.json
#   website/content/armory/expertise-rank-skills.json
#   website/content/armory/tokusei-corrections.json
#   website/content/armory/sitem-tokusei.json
#   website/content/armory/equipment-sets.json
#   website/content/armory/enchant-sets.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-$ROOT/../comp_hack/build-localdeps-v31/bin}"
if [[ ! -x "$BIN/comp_bdpatch" ]]; then
  BIN="$ROOT/../comp_hack/build-current/bin"
fi
SBIN="${BINARYDATA_SHIELD:-$ROOT/../comp_hack/runtime/datastore/BinaryData/Shield}"
TOKUSEI_DIR="${TOKUSEI_DIR:-$ROOT/../comp_hack/runtime/datastore/data/tokusei}"
WORKDIR="${WORKDIR:-/tmp/smt-armory-stats-extract}"
OUT_DIR="$ROOT/website/content/armory"

mkdir -p "$WORKDIR" "$OUT_DIR"

for tool in comp_decrypt comp_bdpatch; do
  if [[ ! -x "$BIN/$tool" ]]; then
    echo "error: missing $BIN/$tool" >&2
    exit 1
  fi
done

echo "Decrypt + flatten Skill / Expert / SItem / EquipmentSet data…"
"$BIN/comp_decrypt" "$SBIN/SkillData.sbin" "$WORKDIR/SkillData.plain.bin"
"$BIN/comp_bdpatch" flatten skill "$WORKDIR/SkillData.plain.bin" "$WORKDIR/SkillData.tsv"
"$BIN/comp_decrypt" "$SBIN/ExpertClassData.sbin" "$WORKDIR/ExpertClassData.plain.bin"
"$BIN/comp_bdpatch" flatten expert "$WORKDIR/ExpertClassData.plain.bin" "$WORKDIR/ExpertClassData.tsv"
"$BIN/comp_decrypt" "$SBIN/SItemData.sbin" "$WORKDIR/SItemData.plain.bin"
"$BIN/comp_bdpatch" flatten sitem "$WORKDIR/SItemData.plain.bin" "$WORKDIR/SItemData.tsv"
"$BIN/comp_decrypt" "$SBIN/EquipmentSetData.sbin" "$WORKDIR/EquipmentSetData.plain.bin"
"$BIN/comp_bdpatch" flatten equipset "$WORKDIR/EquipmentSetData.plain.bin" "$WORKDIR/EquipmentSetData.tsv"

ENCHANT_SET_XML="${ENCHANT_SET_XML:-$ROOT/../comp_hack/datastore/data/enchantset.xml}"

python3 - "$WORKDIR" "$TOKUSEI_DIR" "$OUT_DIR" "$ENCHANT_SET_XML" <<'PY'
import csv, json, re, sys
from datetime import datetime, timezone
from pathlib import Path

workdir, tokusei_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ENCHANT_SET_XML = Path(sys.argv[4]) if len(sys.argv) > 4 else None
if ENCHANT_SET_XML is None:
    ENCHANT_SET_XML = (
        Path(__file__).resolve().parents[2]
        / "../comp_hack/datastore/data/enchantset.xml"
    ).resolve()


def parse_correct(raw: str) -> list[dict]:
    out = []
    for m in re.finditer(
        r"ID:\s*([A-Z0-9_]+),\s*Type:\s*(-?\d+),\s*Value:\s*(-?\d+)", raw or ""
    ):
        out.append({"id": m.group(1), "type": int(m.group(2)), "value": int(m.group(3))})
    return out


def parse_tokusei_ids(raw: str) -> list[int]:
    ids = []
    for part in re.findall(r"\{?\s*(-?\d+)\s*\}?", raw or ""):
        val = int(part)
        if val > 0:
            ids.append(val)
    return ids


def load_tokusei_corrections(tokusei_root: Path) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for path in sorted(tokusei_root.glob("tokusei_*.xml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r'<object name="Tokusei">\s*<member name="ID">(\d+)</member>(.*?)(?=<object name="Tokusei">|\Z)',
            text,
            re.S,
        ):
            tid = m.group(1)
            body = m.group(2)
            rows: list[dict] = []
            for cm in re.finditer(
                r'<member name="ID">([A-Z0-9_]+)</member>\s*<member name="Type">(-?\d+)</member>\s*<member name="Value">(-?\d+)</member>',
                body,
                re.S,
            ):
                rows.append({"id": cm.group(1), "type": int(cm.group(2)), "value": int(cm.group(3))})
            for cm in re.finditer(
                r'<member name="ID">([A-Z0-9_]+)</member>\s*<member name="Value">(-?\d+)</member>',
                body,
                re.S,
            ):
                sid = cm.group(1)
                if sid.isdigit():
                    continue
                if any(r["id"] == sid for r in rows):
                    continue
                rows.append({"id": sid, "type": 0, "value": int(cm.group(2))})
            for am in re.finditer(
                r'<member name="Type">([A-Z0-9_]+)</member>\s*<member name="Value">(-?\d+)</member>',
                body,
                re.S,
            ):
                rows.append({"id": am.group(1), "type": 101, "value": int(am.group(2))})
            if rows:
                index[tid] = rows
    return index


passive_skills: dict[str, dict] = {}
with (workdir / "SkillData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        sid = (row.get("id") or "").strip()
        if not sid.isdigit():
            continue
        main_cat = (row.get("mainCategory") or "").strip()
        if main_cat not in ("0", "2"):
            continue
        correct = parse_correct(row.get("correctTbl") or "")
        if not correct:
            continue
        passive_skills[sid] = {
            "id": int(sid),
            "mainCategory": int(main_cat),
            "correctTbl": correct,
        }

expertise_ranks: dict[str, list[dict]] = {}
with (workdir / "ExpertClassData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        eid = (row.get("ID") or "").strip()
        if not eid.isdigit():
            continue
        class_blob = row.get("classData") or ""
        ranks: list[dict] = []
        rank_idx = 0
        for class_m in re.finditer(r"\{ ID: (\d+),(.*?)\}(?=, \{ ID:|\s*$)", class_blob, re.S):
            rank_blob = class_m.group(2)
            for rank_m in re.finditer(
                r"skillCount: (\d+), \{ ([0-9, ]+) \}", rank_blob
            ):
                skill_raw = rank_m.group(2)
                skills = [int(s) for s in re.findall(r"\d+", skill_raw) if int(s) > 0]
                ranks.append({"rank": rank_idx, "skills": skills})
                rank_idx += 1
        if ranks:
            expertise_ranks[eid] = ranks

sitem_tokusei: dict[str, list[int]] = {}
with (workdir / "SItemData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        iid = (row.get("ID") or "").strip()
        if iid.isdigit():
            ids = parse_tokusei_ids(row.get("tokusei") or "")
            if ids:
                sitem_tokusei[iid] = ids

equipment_sets: dict[str, dict] = {}
with (workdir / "EquipmentSetData.tsv").open(newline="", encoding="utf-8", errors="replace") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        sid = (row.get("ID") or "").strip()
        if not sid.isdigit():
            continue
        equip = [int(x) for x in re.findall(r"-?\d+", row.get("equipment") or "")][:15]
        toks = [int(x) for x in re.findall(r"-?\d+", row.get("tokusei") or "") if int(x) > 0]
        if not any(equip) or not toks:
            continue
        equipment_sets[sid] = {"id": int(sid), "equipment": equip, "tokuseiIds": toks}

enchant_sets: dict[str, dict] = {}
if ENCHANT_SET_XML.is_file():
    import xml.etree.ElementTree as ET

    root = ET.parse(ENCHANT_SET_XML).getroot()
    for obj in root.findall("object"):
        sid_el = obj.find("member[@name='ID']")
        if sid_el is None or not (sid_el.text or "").isdigit():
            continue
        sid = sid_el.text
        eff_el = obj.find("member[@name='effects']")
        tok_el = obj.find("member[@name='tokusei']")
        if eff_el is None or tok_el is None:
            continue
        effects = [int(e.text) for e in eff_el.findall("element") if (e.text or "").isdigit()]
        toks = [int(e.text) for e in tok_el.findall("element") if (e.text or "").lstrip("-").isdigit() and int(e.text) > 0]
        if not effects or not toks:
            continue
        conditions = []
        cond_el = obj.find("member[@name='conditions']")
        if cond_el is not None:
            for el in cond_el.findall("element"):
                o = el.find("object")
                if o is None:
                    continue
                t_el = o.find("member[@name='type']")
                p_el = o.find("member[@name='params']")
                tok_c_el = o.find("member[@name='tokusei']")
                if t_el is None:
                    continue
                params = [int(e.text) for e in (p_el.findall("element") if p_el is not None else [])][:2]
                while len(params) < 2:
                    params.append(0)
                tok_ids = [
                    int(e.text)
                    for e in (tok_c_el.findall("element") if tok_c_el is not None else [])
                    if (e.text or "").isdigit() and int(e.text) > 0
                ]
                conditions.append({"type": int(t_el.text), "params": params, "tokuseiIds": tok_ids})
        enchant_sets[sid] = {
            "id": int(sid),
            "effects": effects,
            "tokuseiIds": toks,
            "conditions": conditions,
        }

tokusei_corrections = load_tokusei_corrections(tokusei_dir)
generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

for name, payload in [
    (
        "passive-skills.json",
        {
            "source": "BinaryData/Shield/SkillData.sbin",
            "generatedAt": generated,
            "skills": passive_skills,
        },
    ),
    (
        "expertise-rank-skills.json",
        {
            "source": "BinaryData/Shield/ExpertClassData.sbin",
            "generatedAt": generated,
            "expertises": expertise_ranks,
        },
    ),
    (
        "tokusei-corrections.json",
        {
            "source": str(tokusei_dir),
            "generatedAt": generated,
            "tokusei": tokusei_corrections,
        },
    ),
    (
        "sitem-tokusei.json",
        {
            "source": "BinaryData/Shield/SItemData.sbin",
            "generatedAt": generated,
            "items": sitem_tokusei,
        },
    ),
    (
        "equipment-sets.json",
        {
            "source": "BinaryData/Shield/EquipmentSetData.sbin",
            "generatedAt": generated,
            "sets": equipment_sets,
        },
    ),
    (
        "enchant-sets.json",
        {
            "source": str(ENCHANT_SET_XML),
            "generatedAt": generated,
            "sets": enchant_sets,
        },
    ),
]:
    path = out_dir / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {path}")

print(
    f"passive={len(passive_skills)} expertise={len(expertise_ranks)} "
    f"tokusei={len(tokusei_corrections)} sitem={len(sitem_tokusei)} "
    f"equipSets={len(equipment_sets)} enchantSets={len(enchant_sets)}"
)
PY
