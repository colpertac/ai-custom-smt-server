"""Export live wiki item/enchant catalogs from uploaded BinaryData.

Writes {runtime}/wiki/{items,enchants}.json for the website to prefer over
baked website/content/wiki/*.json. When the website tree is available, also
mirrors those files into the baked catalog so the gear builder client stays
in sync after admin wiki regen.
"""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from encrypt_tools import find_comp_tool

STAT_LABELS = {
    "CLSR": "Close-range",
    "LNGR": "Long-range",
    "SPELL": "Spell",
    "SUPPORT": "Support",
    "CRITICAL": "Critical",
    "PDEF": "Phys defense",
    "MDEF": "Magic defense",
    "STR": "STR",
    "MAGIC": "MAG",
    "VIT": "VIT",
    "INT": "INT",
    "SPEED": "SPD",
    "LUCK": "LUK",
    "COOLDOWN_TIME": "Skill cooldown",
    "RES_STATUS": "Resist status",
    "RATE_XP": "XP rate",
    "RATE_MAG": "Magnetite rate",
    "RATE_MACCA": "Macca rate",
    "RATE_EXPERTISE": "Expertise rate",
    "RATE_CLSR": "Close-range damage",
    "RATE_LNGR": "Long-range damage",
    "RATE_SPELL": "Magic damage",
    "RATE_SUPPORT": "Support effect",
    "RATE_HEAL": "Healing effect",
    "RATE_CLSR_TAKEN": "Close-range damage taken",
    "RATE_LNGR_TAKEN": "Long-range damage taken",
    "RATE_SPELL_TAKEN": "Spell damage taken",
    "RATE_SUPPORT_TAKEN": "Support damage taken",
    "RATE_HEAL_TAKEN": "Healing received",
    "LB_CHANCE": "Limit break chance",
    "LB_DAMAGE": "Limit break power",
    "FINAL_CRIT_CHANCE": "Final crit chance",
    "CHANT_TIME": "Chant time",
    "RES_FIRE": "Resist Fire",
    "RES_ICE": "Resist Ice",
    "RES_ELEC": "Resist Elec",
    "RES_FORCE": "Resist Force",
    "RES_SLASH": "Resist Slash",
    "RES_THRUST": "Resist Thrust",
    "RES_ALMIGHTY": "Resist Almighty",
    "RES_EXPEL": "Resist Expel",
    "RES_CURSE": "Resist Curse",
    "RES_MAGICFORCE": "Resist Magic Force",
    "RES_NERVE": "Resist Nerve",
    "MP_MAX": "MAX MP",
    "HP_MAX": "MAX HP",
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
ENCHANT_ENABLE_EFFECT = 0x7FFF
CORRECT_RX = re.compile(
    r"ID:\s*([A-Z0-9_]+),\s*Type:\s*(-?\d+),\s*Value:\s*(-?\d+)"
)


def wiki_dir(runtime: Path) -> Path:
    return Path(runtime) / "wiki"


def wiki_items_path(runtime: Path) -> Path:
    return wiki_dir(runtime) / "items.json"


def wiki_enchants_path(runtime: Path) -> Path:
    return wiki_dir(runtime) / "enchants.json"


def _baked_wiki_dir() -> Path | None:
    """Repo website/content/wiki when present (local / mounted ops)."""
    candidate = Path(__file__).resolve().parent.parent / "website" / "content" / "wiki"
    return candidate if candidate.is_dir() else None


def _sync_baked_wiki_catalogs(
    items_payload: dict[str, Any],
    enchants_payload: dict[str, Any],
) -> bool:
    """Mirror runtime wiki JSON into the Next.js bundled catalog when possible.

    Builder client code imports `@/content/wiki` for combat/display fallbacks.
    Without this sync, admin wiki regen updates live wiki pages but leaves the
    builder on stale bundled names/stats until a manual content rebuild.
    """
    baked = _baked_wiki_dir()
    if baked is None:
        return False
    _atomic_write_json(baked / "items.json", items_payload)
    _atomic_write_json(baked / "enchants.json", enchants_payload)
    return True


def binarydata_ready(runtime: Path) -> bool:
    shield = Path(runtime) / "datastore" / "BinaryData" / "Shield"
    return (shield / "ItemData.sbin").is_file() and (
        shield / "CItemData.sbin"
    ).is_file()


def wiki_catalog_ready(runtime: Path) -> bool:
    items = wiki_items_path(runtime)
    if not items.is_file():
        return False
    try:
        data = json.loads(items.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return isinstance(data.get("items"), list) and len(data["items"]) > 0


def destinations_include_binarydata(
    destinations: list[str] | None, *, kind: str = ""
) -> bool:
    if kind in {"binarydata"}:
        return True
    for dest in destinations or []:
        name = Path(dest).name.lower()
        if name == "binarydata":
            return True
        lowered = str(dest).replace("\\", "/").lower()
        if "/binarydata" in lowered or lowered.endswith("binarydata"):
            return True
    return False


def _find_decrypt() -> Path | None:
    return find_comp_tool("comp_decrypt", "OPS_DECRYPT")


def _find_bdpatch() -> Path | None:
    return find_comp_tool("comp_bdpatch", "OPS_BDPATCH")


def _run(cmd: list[str], *, timeout: int = 600) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return False, f"timed out: {' '.join(cmd[:3])}"
    except OSError as e:
        return False, str(e)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
        return False, detail[-1200:] or "command failed"
    return True, ""


def _stat_label(sid: str) -> str:
    return STAT_LABELS.get(sid, sid.replace("_", " "))


def _format_stat_value(sid: str, val: int) -> str:
    if sid.startswith("RATE_") or sid.startswith("BOOST_") or sid in PCT_STAT_IDS:
        return f"{val:+d}%"
    return f"{val:+d}"


def _parse_correct(raw: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    basic: list[dict[str, Any]] = []
    characteristics: list[dict[str, Any]] = []
    for m in CORRECT_RX.finditer(raw or ""):
        sid, typ, val = m.group(1), int(m.group(2)), int(m.group(3))
        row = {
            "id": sid,
            "label": _stat_label(sid),
            "type": typ,
            "value": val,
        }
        if typ == 0:
            basic.append(row)
        elif typ in (1, 2):
            characteristics.append(row)
    return basic, characteristics


def _clean_desc(d: str) -> str:
    s = (d or "").replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\n", " ")
    s = re.sub(r"\*+", " ", s)
    return re.sub(r"[ \t]+", " ", s).strip()


def _slot_label(equip: str) -> str:
    return (
        equip.replace("EQUIP_TYPE_", "").replace("_", " ").title() if equip else "None"
    )


def _safe_int(raw: str | None, default: int = 0) -> int:
    s = (raw or "").strip()
    if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
        return int(s)
    return default


def _parse_sitem_tokusei_ids(raw: str) -> list[int]:
    ids: list[int] = []
    for part in re.findall(r"\{?\s*(-?\d+)\s*\}?", raw or ""):
        if part.isdigit() or (part.startswith("-") and part[1:].isdigit()):
            val = int(part)
            if val > 0:
                ids.append(val)
    return ids


def _load_tokusei_index(tokusei_root: Path) -> dict[int, list[str]]:
    index: dict[int, list[str]] = {}
    if not tokusei_root.is_dir():
        return index
    for path in sorted(tokusei_root.glob("tokusei_*.xml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(
            r'<object name="Tokusei">\s*<member name="ID">(\d+)</member>(.*?)(?=<object name="Tokusei">|\Z)',
            text,
            re.S,
        ):
            tid = int(m.group(1))
            body = m.group(2)
            partner = bool(
                re.search(
                    r'<member name="TargetType">\s*PARTNER\s*</member>', body
                )
            )
            prefix = "Partner's " if partner else ""
            lines: list[str] = []
            for cm in re.finditer(
                r'<member name="ID">([A-Z0-9_]+)</member>\s*<member name="Value">(-?\d+)</member>',
                body,
                re.S,
            ):
                sid, val = cm.group(1), int(cm.group(2))
                if sid.isdigit():
                    continue
                lines.append(
                    f"{prefix}{_stat_label(sid)} {_format_stat_value(sid, val)}"
                )
            for am in re.finditer(
                r'<member name="Type">([A-Z0-9_]+)</member>\s*<member name="Value">(-?\d+)</member>',
                body,
                re.S,
            ):
                atype, val = am.group(1), int(am.group(2))
                label = ASPECT_LABELS.get(atype, atype.replace("_", " "))
                lines.append(f"{prefix}{label} {val:+d}")
            if lines:
                index[tid] = lines
    return index


def _load_descs_from_xml(path: Path) -> dict[int, str]:
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8", errors="replace")
    descs: dict[int, str] = {}
    for m in re.finditer(
        r'<member name="ID">(\d+)</member>.*?<member name="desc"><!\[CDATA\[(.*?)\]\]></member>',
        text,
        re.S,
    ):
        descs[int(m.group(1))] = m.group(2)
    return descs


def _load_icons_from_xml(path: Path) -> dict[int, int]:
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8", errors="replace")
    icons: dict[int, int] = {}
    for m in re.finditer(
        r'<member name="ID">(\d+)</member>.*?<member name="icon">(\d+)</member>',
        text,
        re.S,
    ):
        icons[int(m.group(1))] = int(m.group(2))
    return icons


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        Path(tmp_name).replace(path)
    except Exception:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def _empty_enchants(*, note: str) -> dict[str, Any]:
    return {
        "source": "BinaryData/Shield/EnchantData.sbin",
        "generatedAt": _now_iso(),
        "note": note,
        "enchantEnableEffect": ENCHANT_ENABLE_EFFECT,
        "enchants": {},
        "byCrystalItemId": {},
    }


def build_items_payload(
    workdir: Path,
    tokusei_dir: Path,
    *,
    citem_xml: Path | None = None,
) -> dict[str, Any]:
    """Assemble items.json payload from flattened TSV files in workdir."""
    tokusei_index = _load_tokusei_index(tokusei_dir)

    sitem_tokusei: dict[int, list[int]] = {}
    sitem_path = workdir / "SItemData.tsv"
    if sitem_path.is_file():
        with sitem_path.open(newline="", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                iid = (row.get("ID") or "").strip()
                if iid.isdigit():
                    sitem_tokusei[int(iid)] = _parse_sitem_tokusei_ids(
                        row.get("tokusei") or ""
                    )

    icons: dict[int, str] = {}
    cicon_path = workdir / "CIconData_Item.tsv"
    if cicon_path.is_file():
        with cicon_path.open(newline="", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                iid = (row.get("ID") or "").strip()
                if iid.isdigit():
                    icons[int(iid)] = (row.get("value") or "").strip()

    names: dict[int, dict[str, str]] = {}
    with (workdir / "CItemData.tsv").open(
        newline="", encoding="utf-8", errors="replace"
    ) as f:
        for row in csv.DictReader(f, delimiter="\t"):
            iid = (row.get("ID") or "").strip()
            if iid.isdigit():
                names[int(iid)] = row

    xml_descs = _load_descs_from_xml(citem_xml) if citem_xml else {}
    xml_icons = _load_icons_from_xml(citem_xml) if citem_xml else {}

    items: list[dict[str, Any]] = []
    with (workdir / "ItemData.tsv").open(
        newline="", encoding="utf-8", errors="replace"
    ) as f:
        for row in csv.DictReader(f, delimiter="\t"):
            iid = (row.get("id") or "").strip()
            if not iid.isdigit():
                continue
            item_id = int(iid)
            c = names.get(item_id, {})
            wt = row.get("weaponType") or ""
            gender_code = _safe_int(row.get("gender"), 2)
            icon_id = _safe_int(c.get("icon"))
            if icon_id == 0:
                icon_id = xml_icons.get(item_id, 0)
            icon_asset = icons.get(icon_id) or None
            raw_desc = xml_descs.get(item_id, c.get("desc") or "")
            name = (c.get("name") or "").strip() or f"Item {item_id}"
            basic_features, characteristics = _parse_correct(
                row.get("correctTbl") or ""
            )
            set_bonus: list[str] = []
            for tok_id in sitem_tokusei.get(item_id, []):
                for line in tokusei_index.get(tok_id, []):
                    if line not in set_bonus:
                        set_bonus.append(line)
            items.append(
                {
                    "id": item_id,
                    "name": name,
                    "description": _clean_desc(raw_desc),
                    "icon": icon_id,
                    "iconAsset": icon_asset,
                    "iconSrc": (
                        f"/wiki/icons/{icon_asset}.png" if icon_asset else None
                    ),
                    "equipType": row.get("equipType") or "",
                    "equipSlot": _slot_label(row.get("equipType") or ""),
                    "weaponType": None
                    if not wt or wt == "0" or wt == "NONE"
                    else wt,
                    "gender": gender_code,
                    "genderLabel": GENDER_LABELS.get(
                        gender_code, f"Unknown({gender_code})"
                    ),
                    "buyPrice": _safe_int(row.get("buyPrice")),
                    "sellPrice": _safe_int(row.get("sellPrice")),
                    "level": _safe_int(row.get("level")),
                    "durability": _safe_int(row.get("durability")),
                    "stackSize": _safe_int(row.get("stackSize")),
                    "setBonus": set_bonus,
                    "basicFeatures": basic_features,
                    "characteristics": characteristics,
                    "stats": basic_features,
                }
            )

    items.sort(key=lambda i: i["id"])
    return {
        "source": "BinaryData/Shield/{ItemData,CItemData}.sbin (live)",
        "namesSource": "BinaryData/Shield/CItemData.sbin (flatten)",
        "descsSource": str(citem_xml.as_posix()) if citem_xml else "",
        "generatedAt": _now_iso(),
        "note": "Generated from uploaded BinaryData on this server.",
        "items": items,
    }


def _parse_tokusei_ids(raw: str) -> list[int]:
    ids: list[int] = []
    for part in re.findall(r"\{?\s*(-?\d+)\s*\}?", raw or ""):
        val = int(part)
        if val > 0:
            ids.append(val)
    return ids


def _parse_conditions(raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
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


def _clean_text(s: str) -> str:
    s = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\*+", " ", s)
    return re.sub(r"[ \t]+", " ", s).strip()


def _split_desc_lines(desc: str) -> list[str]:
    s = _clean_text(desc)
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


def _resolve_tokusei_lines(
    tokusei_index: dict[int, list[str]], raw: str
) -> list[str]:
    lines: list[str] = []
    for tok_id in _parse_tokusei_ids(raw):
        for line in tokusei_index.get(tok_id, []):
            if line not in lines:
                lines.append(line)
    return lines


def _parse_charastic(
    fields: list[str],
    start: int,
    tokusei_index: dict[int, list[str]],
    *,
    allow_desc_spill: bool = False,
) -> dict[str, Any]:
    name = fields[start] if start < len(fields) else ""
    desc = fields[start + 1] if start + 1 < len(fields) else ""
    tok_raw = fields[start + 5] if start + 5 < len(fields) else ""
    cond_raw = fields[start + 6] if start + 6 < len(fields) else ""
    if allow_desc_spill and start + 7 < len(fields):
        extra = fields[start + 7].strip()
        if (
            extra
            and not extra.isdigit()
            and "type:" not in extra
            and not extra.startswith("{")
        ):
            desc = f"{desc} {extra}".strip()
    tok_lines = _resolve_tokusei_lines(tokusei_index, tok_raw)
    desc_lines = _split_desc_lines(desc)
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
        "name": _clean_text(name),
        "desc": _clean_text(desc),
        "tokuseiIds": _parse_tokusei_ids(tok_raw),
        "conditions": _parse_conditions(cond_raw),
        "lines": lines,
    }


def build_enchants_payload(
    workdir: Path,
    tokusei_dir: Path,
    citem_tsv: Path,
) -> dict[str, Any]:
    """Assemble enchants.json from EnchantData.tsv + CItemData names."""
    tokusei_index = _load_tokusei_index(tokusei_dir)
    item_names: dict[int, str] = {}
    if citem_tsv.is_file():
        with citem_tsv.open(newline="", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                iid = (row.get("ID") or "").strip()
                if iid.isdigit():
                    item_names[int(iid)] = (row.get("name") or "").strip()

    enchant_path = workdir / "EnchantData.tsv"
    if not enchant_path.is_file():
        return _empty_enchants(note="EnchantData.tsv missing.")

    tsv_text = enchant_path.read_text(encoding="utf-8", errors="replace")
    parts = re.split(r"(?m)^(\d+)\t", tsv_text)

    enchants: dict[str, dict[str, Any]] = {}
    by_crystal_item: dict[str, int] = {}

    for i in range(1, len(parts), 2):
        eid = int(parts[i])
        fields = parts[i + 1].split("\t")
        if len(fields) < 11:
            continue
        crystal_item_id = int(fields[1]) if fields[1].isdigit() else 0
        usage = int(fields[3]) if fields[3].isdigit() else 0
        tarot = _parse_charastic(fields, 4, tokusei_index)
        soul = _parse_charastic(
            fields, 11, tokusei_index, allow_desc_spill=True
        )
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

    return {
        "source": "BinaryData/Shield/EnchantData.sbin",
        "generatedAt": _now_iso(),
        "note": "Tarot / soul fusion stats keyed by enchant ID (stored on equipped items).",
        "enchantEnableEffect": ENCHANT_ENABLE_EFFECT,
        "enchants": enchants,
        "byCrystalItemId": by_crystal_item,
    }


def export_wiki_catalogs(runtime: Path) -> tuple[bool, str, dict[str, Any]]:
    """Decrypt/flatten Shield tables and write runtime wiki JSON.

    Return (ok, error_code, detail_info).
    """
    runtime = Path(runtime)
    decrypt = _find_decrypt()
    bdpatch = _find_bdpatch()
    if decrypt is None or bdpatch is None:
        missing = []
        if decrypt is None:
            missing.append("comp_decrypt")
        if bdpatch is None:
            missing.append("comp_bdpatch")
        return (
            False,
            "missing_tools",
            {
                "detail": (
                    f"missing {', '.join(missing)}; install under "
                    "deploy/ops-tools (BIN_DIR)"
                )
            },
        )

    shield = runtime / "datastore" / "BinaryData" / "Shield"
    item_sbin = shield / "ItemData.sbin"
    citem_sbin = shield / "CItemData.sbin"
    if not item_sbin.is_file() or not citem_sbin.is_file():
        return (
            False,
            "missing_binarydata",
            {
                "detail": f"need ItemData + CItemData under {shield}",
            },
        )

    sitem_sbin = shield / "SItemData.sbin"
    enchant_sbin = shield / "EnchantData.sbin"
    tokusei_dir = runtime / "datastore" / "data" / "tokusei"
    client_bin = (
        runtime / "datastore" / "BinaryData" / "Client" / "CIconData_Item.bin"
    )
    citem_xml_candidates = [
        shield / "CItemData.xml",
        runtime / "datastore" / "BinaryData" / "Shield" / "CItemData.xml",
    ]
    citem_xml = next((p for p in citem_xml_candidates if p.is_file()), None)

    out_dir = wiki_dir(runtime)
    work = Path(tempfile.mkdtemp(prefix="ops-wiki-export-"))
    try:
        # ItemData
        ok, detail = _run(
            [str(decrypt), str(item_sbin), str(work / "ItemData.plain.bin")]
        )
        if not ok:
            return False, "decrypt_failed", {"detail": f"ItemData: {detail}"}
        ok, detail = _run(
            [
                str(bdpatch),
                "flatten",
                "item",
                str(work / "ItemData.plain.bin"),
                str(work / "ItemData.tsv"),
            ]
        )
        if not ok:
            return False, "flatten_failed", {"detail": f"ItemData: {detail}"}

        # CItemData
        ok, detail = _run(
            [str(decrypt), str(citem_sbin), str(work / "CItemData.plain.bin")]
        )
        if not ok:
            return False, "decrypt_failed", {"detail": f"CItemData: {detail}"}
        ok, detail = _run(
            [
                str(bdpatch),
                "flatten",
                "citem",
                str(work / "CItemData.plain.bin"),
                str(work / "CItemData.tsv"),
            ]
        )
        if not ok:
            return False, "flatten_failed", {"detail": f"CItemData: {detail}"}

        # SItemData (optional — set bonuses)
        if sitem_sbin.is_file():
            ok, detail = _run(
                [
                    str(decrypt),
                    str(sitem_sbin),
                    str(work / "SItemData.plain.bin"),
                ]
            )
            if ok:
                _run(
                    [
                        str(bdpatch),
                        "flatten",
                        "sitem",
                        str(work / "SItemData.plain.bin"),
                        str(work / "SItemData.tsv"),
                    ]
                )

        # CIconData (optional)
        if client_bin.is_file():
            _run(
                [
                    str(bdpatch),
                    "flatten",
                    "cicon",
                    str(client_bin),
                    str(work / "CIconData_Item.tsv"),
                ]
            )

        items_payload = build_items_payload(
            work, tokusei_dir, citem_xml=citem_xml
        )
        _atomic_write_json(wiki_items_path(runtime), items_payload)

        enchant_note = ""
        if enchant_sbin.is_file():
            ok, detail = _run(
                [
                    str(decrypt),
                    str(enchant_sbin),
                    str(work / "EnchantData.plain.bin"),
                ]
            )
            if ok:
                ok, detail = _run(
                    [
                        str(bdpatch),
                        "flatten",
                        "enchant",
                        str(work / "EnchantData.plain.bin"),
                        str(work / "EnchantData.tsv"),
                    ]
                )
            if ok:
                enchants_payload = build_enchants_payload(
                    work, tokusei_dir, work / "CItemData.tsv"
                )
            else:
                enchant_note = (
                    f"Enchant export failed ({detail}); "
                    "wiki items still available."
                )
                enchants_payload = _empty_enchants(note=enchant_note)
        else:
            enchant_note = (
                "EnchantData.sbin not present; fusion tooltips empty."
            )
            enchants_payload = _empty_enchants(note=enchant_note)

        _atomic_write_json(wiki_enchants_path(runtime), enchants_payload)

        baked_synced = _sync_baked_wiki_catalogs(
            items_payload, enchants_payload
        )

        info = {
            "detail": enchant_note or "wiki catalogs written",
            "itemCount": len(items_payload["items"]),
            "enchantCount": len(enchants_payload["enchants"]),
            "outDir": str(out_dir),
            "bakedSynced": baked_synced,
        }
        return True, "", info
    finally:
        shutil.rmtree(work, ignore_errors=True)


def ensure_wiki_catalog(runtime: Path) -> tuple[bool, str, dict[str, Any]]:
    """Build wiki JSON if BinaryData is present and catalog is missing/stale."""
    runtime = Path(runtime)
    if wiki_catalog_ready(runtime):
        return True, "", {"detail": "catalog already present", "skipped": True}
    if not binarydata_ready(runtime):
        return (
            False,
            "missing_binarydata",
            {"detail": "BinaryData Shield ItemData/CItemData not ready"},
        )
    return export_wiki_catalogs(runtime)
