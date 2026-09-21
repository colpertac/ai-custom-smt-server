"""Export live wiki item/enchant/demon/skill catalogs from uploaded BinaryData.

Writes {runtime}/wiki/{items,enchants,devils,skills}.json for the website to
prefer over baked website content. When the website tree is available, also
mirrors those files into the baked catalog so client fallbacks stay in sync
after admin wiki regen.
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


def wiki_devils_path(runtime: Path) -> Path:
    return wiki_dir(runtime) / "devils.json"


def wiki_skills_path(runtime: Path) -> Path:
    return wiki_dir(runtime) / "skills.json"


def _baked_wiki_dir() -> Path | None:
    """Repo website/content/wiki when present (local / mounted ops)."""
    candidate = Path(__file__).resolve().parent.parent / "website" / "content" / "wiki"
    return candidate if candidate.is_dir() else None


def _baked_armory_dir() -> Path | None:
    candidate = (
        Path(__file__).resolve().parent.parent / "website" / "content" / "armory"
    )
    return candidate if candidate.is_dir() else None


def _sync_baked_wiki_catalogs(
    items_payload: dict[str, Any],
    enchants_payload: dict[str, Any],
    devils_payload: dict[str, Any] | None = None,
    skills_payload: dict[str, Any] | None = None,
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
    if skills_payload is not None:
        _atomic_write_json(baked / "skills.json", skills_payload)
    if devils_payload is not None:
        armory = _baked_armory_dir()
        if armory is not None:
            _atomic_write_json(armory / "devils.json", devils_payload)
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


# MiDCategoryData::race enum (devildata.xml). Flatten emits the name.
DEVIL_RACE_IDS = {
    "NONE": 0,
    "SERAPHIM": 1,
    "ENTITY": 2,
    "DEMON_GOD": 3,
    "VILE": 4,
    "AVIAN": 5,
    "GODDESS": 6,
    "HEAVENLY_GOD": 7,
    "RAPTOR": 8,
    "DIVINE": 9,
    "EVIL_DEMON": 10,
    "WILD_BIRD": 11,
    "YOMA": 12,
    "EARTH_ELEMENT": 13,
    "GOD_SPIRIT": 14,
    "OTHER": 15,
    "REAPER": 51,
    "HOLY_BEAST": 52,
    "BEAST": 53,
    "FAIRY": 54,
    "ELEMENTAL": 55,
    "MAJIN": 56,
    "MITAMA": 57,
    "DEMIGOD": 58,
    "WILDER": 59,
    "DRAGON_KING": 60,
    "NOCTURNE": 61,
    "GODLY_BEAST": 62,
    "INNOCENT": 63,
    "HUMAN": 64,
    "FOUL": 101,
    "BRUTE": 102,
    "HAUNT": 103,
    "DRAGON": 104,
    "FALLEN_ANGEL": 105,
    "FEMME": 106,
    "NATION_RULER": 107,
    "EARTH_MOTHER": 108,
    "EVIL_DRAGON": 109,
    "GUARDIAN": 110,
    "DESTROYER": 111,
    "TYRANT": 112,
    "GAIAN": 113,
}


# Affinity strip order mirrors megaten-fusion-tool SMTIM resistElems
# (after their resists.slice(2) drop of two unused prefix chars).
DEVIL_RESIST_ELEMS = [
    ("slash", 28, 51),  # RES_SLASH / NRA_SLASH
    ("charge", 29, 52),  # thrust
    ("blunt", 30, 53),  # strike
    ("gun", 31, 54),  # long-range / handgun
    ("pierce", 32, 55),
    ("spread", 33, 56),
    ("fire", 34, 57),
    ("ice", 35, 58),
    ("elec", 36, 59),
    ("force", 38, 61),  # RES_FORCE (37 is almighty)
    ("expel", 39, 62),
    ("death", 40, 63),  # curse / mudo
]

# CorrectTbl indices for base stats shown on the wiki.
DEVIL_STAT_IDX = {
    "str": 0,
    "magic": 1,
    "vit": 2,
    "int": 3,
    "speed": 4,
    "luck": 5,
    "hp": 6,
    "mp": 7,
}


def _parse_correct_array(raw: str) -> list[int]:
    """Parse flatten output like ``{ 5 }, { 13 }, …`` into 126 ints."""
    vals = [int(x) for x in re.findall(r"\{\s*(-?\d+)\s*\}", raw or "")]
    if len(vals) < 126:
        vals.extend([0] * (126 - len(vals)))
    return vals[:126]


def _resist_display(res: int, nra: int) -> str:
    """Affinity cell: empty, decimal multiplier, or nu/rp/dr.

    Damage multiplier ≈ ``1 - RES/100`` (RES 50 → 0.5, RES -100 → 2.0).
    NRA encodes ``chance * 10 + kind`` with kind 1=null, 2=repel, 3=drain.
    """
    if nra > 0:
        kind = nra % 10
        chance = nra // 10
        if chance > 0:
            if kind == 1:
                return "nu"
            if kind == 2:
                return "rp"
            if kind == 3:
                return "dr"
    if res == 0:
        return ""
    mult = 1.0 - (res / 100.0)
    if mult <= 0:
        return "nu"
    # Trim trailing zeros: 0.50 → 0.5, 2.00 → 2
    text = f"{mult:.2f}".rstrip("0").rstrip(".")
    return text


def _load_cicon_value_map(cicon_tsv: Path | None) -> dict[int, str]:
    """CIconData_*: icon key → asset basename (e.g. icon_SD01_0002a)."""
    if cicon_tsv is None or not cicon_tsv.is_file():
        return {}
    out: dict[int, str] = {}
    with cicon_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("ID") or "").strip()
            value = (row.get("value") or "").strip()
            if not raw_id.isdigit() or not value:
                continue
            out[int(raw_id)] = value
    return out


def _load_devil_icon_map(cicon_tsv: Path | None) -> dict[int, str]:
    """CIconData_Devil: icon key → asset basename (e.g. icon_D1_05_005a)."""
    return _load_cicon_value_map(cicon_tsv)


# Skill affinity IDs match CorrectTbl RES_* offset from RES_DEFAULT (26).
# See SkillManager.cpp RES_OFFSET and shared.xml MiCorrectTbl.
SKILL_AFFINITY: dict[int, tuple[str, str]] = {
    0: ("none", "—"),
    1: ("weapon", "Weapon"),
    2: ("slash", "Slash"),
    3: ("charge", "Thrust"),
    4: ("blunt", "Blunt"),
    5: ("gun", "Gun"),
    6: ("pierce", "Pierce"),
    7: ("spread", "Spread"),
    8: ("fire", "Fire"),
    9: ("ice", "Ice"),
    10: ("elec", "Electric"),
    11: ("almighty", "Almighty"),
    12: ("force", "Force"),
    13: ("expel", "Expel"),
    14: ("death", "Death"),
    15: ("heal", "Heal"),
    16: ("support", "Support"),
    17: ("magicforce", "Magic"),
    18: ("nerve", "Nerve"),
    19: ("mind", "Mind"),
    20: ("word", "Word"),
    21: ("special", "Special"),
    22: ("suicide", "Suicide"),
}

SKILL_CATEGORY: dict[int, str] = {
    0: "Passive",
    1: "Active",
    2: "Switch",
}

# inheritanceRestriction bit index → display (8 is the common "Impossible").
SKILL_INHERITANCE: dict[int, str] = {
    0: "Possible",
    8: "Impossible",
}

SKILL_AREA_TYPE: dict[str, str] = {
    "NONE": "—",
    "TARGET_RADIUS": "Target radius",
    "STRAIGHT_LINE": "Straight line",
    "SOURCE_RADIUS": "Surroundings",
    "FRONT_1": "Front",
    "FRONT_2": "Front",
    "FRONT_3": "Front",
    "SOURCE": "Self",
    "SOURCE_RADIUS2": "Surroundings",
}

_COST_ENTRY_RX = re.compile(
    r"type:\s*([A-Z_]+).*?cost:\s*(-?\d+)",
    re.S,
)
_STATUS_ENTRY_RX = re.compile(
    r"statusID:\s*(\d+).*?successRate:\s*(-?\d+)",
    re.S,
)
_SKILL_ID_BRACE_RX = re.compile(r"\{\s*(\d+)\s*\}")
_ACQ_ENTRY_RX = re.compile(r"ID:\s*(\d+)\s*,\s*level:\s*(\d+)")


def _affinity_fields(affinity_id: int) -> tuple[int, str | None, str | None]:
    key, label = SKILL_AFFINITY.get(affinity_id, (None, None))
    if key is None or key == "none":
        return affinity_id, None, None
    return affinity_id, key, label


def _title_enum(raw: str) -> str:
    text = (raw or "").strip()
    if not text or text == "NONE":
        return "—"
    return text.replace("_", " ").title()


def _ms_to_seconds(raw: str) -> float | None:
    try:
        ms = int((raw or "0").strip() or "0")
    except ValueError:
        return None
    if ms <= 0:
        return 0.0
    return round(ms / 1000.0, 3)


def _format_seconds(sec: float | None) -> str | None:
    if sec is None:
        return None
    if sec == 0:
        return "0 seconds"
    text = f"{sec:g}"
    return f"{text} second" if sec == 1 else f"{text} seconds"


def _parse_costs(blob: str) -> str | None:
    parts: list[str] = []
    for match in _COST_ENTRY_RX.finditer(blob or ""):
        kind = match.group(1)
        try:
            amount = int(match.group(2))
        except ValueError:
            continue
        if amount == 0 and kind == "NONE":
            continue
        if kind in {"MP", "HP", "CP"}:
            parts.append(f"{amount} {kind}")
        elif kind == "PERCENT_MP":
            parts.append(f"{amount}% MP")
        elif kind == "PERCENT_HP":
            parts.append(f"{amount}% HP")
        else:
            parts.append(f"{amount} {kind.replace('_', ' ').title()}")
    if not parts:
        return None
    return ", ".join(parts)


def _load_status_names(cstatus_tsv: Path | None) -> dict[int, str]:
    if cstatus_tsv is None or not cstatus_tsv.is_file():
        return {}
    out: dict[int, str] = {}
    with cstatus_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("ID") or row.get("id") or "").strip()
            name = (row.get("name") or "").strip()
            if raw_id.isdigit() and name:
                out[int(raw_id)] = name
    return out


def _parse_effects(
    blob: str, status_names: dict[int, str]
) -> list[dict[str, Any]]:
    effects: list[dict[str, Any]] = []
    for match in _STATUS_ENTRY_RX.finditer(blob or ""):
        status_id = int(match.group(1))
        rate = int(match.group(2))
        if status_id <= 0:
            continue
        effects.append(
            {
                "statusId": status_id,
                "name": status_names.get(status_id) or f"Status {status_id}",
                "successRate": rate,
            }
        )
    return effects


def _format_effects(effects: list[dict[str, Any]]) -> str | None:
    if not effects:
        return None
    return ", ".join(
        f"{e['name']} ({e['successRate']}%)" for e in effects
    )


def _load_skill_detail_rows(skill_tsv: Path | None) -> dict[int, dict[str, str]]:
    if skill_tsv is None or not skill_tsv.is_file():
        return {}
    out: dict[int, dict[str, str]] = {}
    with skill_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("id") or row.get("ID") or "").strip()
            if not raw_id.isdigit():
                continue
            out[int(raw_id)] = row
    return out


def _build_learned_by_index(
    devil_tsv: Path | None,
) -> dict[int, list[dict[str, Any]]]:
    """skillId → [{demonId, name, level|null}] from DevilData innate + acquisition.

    Costume clones (same name as stock baseDemonID) are dropped; named variants kept.
    """
    if devil_tsv is None or not devil_tsv.is_file():
        return {}

    # First pass: all names by id (for +10000 costume clone detection)
    names_by_id: dict[int, str] = {}
    rows: list[dict[str, str]] = []
    with devil_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("ID") or "").strip()
            name = (row.get("name") or "").strip()
            if not raw_id.isdigit() or not name:
                continue
            demon_id = int(raw_id)
            names_by_id[demon_id] = name
            rows.append(row)

    by_skill: dict[int, dict[tuple[str, int | None], dict[str, Any]]] = {}

    def add_learner(
        skill_id: int, demon_id: int, demon_name: str, level: int | None
    ) -> None:
        bucket = by_skill.setdefault(skill_id, {})
        key = (demon_name.lower(), level)
        existing = bucket.get(key)
        if existing is None or demon_id < existing["demonId"]:
            bucket[key] = {
                "demonId": demon_id,
                "name": demon_name,
                "level": level,
            }

    for row in rows:
        demon_id = int((row.get("ID") or "0").strip())
        name = (row.get("name") or "").strip()
        # Drop +10000 costume clones that mirror a lower-id form of the same name.
        mirror_id = demon_id - 10000
        if mirror_id > 0 and names_by_id.get(mirror_id) == name:
            continue

        for match in _SKILL_ID_BRACE_RX.finditer(row.get("skills") or ""):
            sid = int(match.group(1))
            if sid <= 0:
                continue
            add_learner(sid, demon_id, name, None)

        for match in _ACQ_ENTRY_RX.finditer(row.get("acquisitionSkills") or ""):
            sid = int(match.group(1))
            level = int(match.group(2))
            if sid <= 0 or level <= 0:
                continue
            add_learner(sid, demon_id, name, level)

    out: dict[int, list[dict[str, Any]]] = {}
    for sid, bucket in by_skill.items():
        learners = list(bucket.values())
        learners.sort(
            key=lambda e: (
                e["level"] is not None,
                e["level"] or 0,
                e["name"].lower(),
                e["demonId"],
            )
        )
        out[sid] = learners
    return out


def build_skills_payload(
    cskill_tsv: Path,
    *,
    cicon_tsv: Path | None = None,
    skill_tsv: Path | None = None,
    cstatus_tsv: Path | None = None,
    devil_tsv: Path | None = None,
    icons_dir: Path | None = None,
) -> dict[str, Any]:
    """Names/icons from CSkillData; combat detail from SkillData; learnedBy from DevilData."""
    icon_by_id = _load_cicon_value_map(cicon_tsv)
    detail_by_id = _load_skill_detail_rows(skill_tsv)
    status_names = _load_status_names(cstatus_tsv)
    learned_by = _build_learned_by_index(devil_tsv)
    skills: list[dict[str, Any]] = []

    with cskill_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("ID") or "").strip()
            if not raw_id.isdigit():
                continue
            name = (row.get("name") or "").strip()
            if not name:
                continue
            skill_id = int(raw_id)
            try:
                icon_id = int((row.get("iconID") or "0").strip() or "0")
            except ValueError:
                icon_id = 0
            icon_asset = icon_by_id.get(icon_id) if icon_id > 0 else None
            icon_src = (
                f"/wiki/skill-icons/{icon_asset}.png" if icon_asset else None
            )
            if (
                icon_asset
                and icons_dir is not None
                and not (icons_dir / f"{icon_asset}.png").is_file()
            ):
                icon_src = None

            detail = detail_by_id.get(skill_id, {})
            try:
                affinity_id = int((detail.get("affinity") or "0").strip() or "0")
            except ValueError:
                affinity_id = 0
            aff_id, aff_key, aff_label = _affinity_fields(affinity_id)

            try:
                main_cat = int(
                    (detail.get("mainCategory") or "0").strip() or "0"
                )
            except ValueError:
                main_cat = 0
            category_label = SKILL_CATEGORY.get(main_cat, f"Category {main_cat}")

            action_type = _title_enum(detail.get("actionType") or "")
            dependency = _title_enum(detail.get("dependencyType") or "")
            cost_label = _parse_costs(detail.get("costs") or "")

            try:
                inherit_id = int(
                    (detail.get("inheritanceRestriction") or "0").strip() or "0"
                )
            except ValueError:
                inherit_id = 0
            inheritance = SKILL_INHERITANCE.get(
                inherit_id, f"Restricted #{inherit_id}"
            )

            effects = _parse_effects(detail.get("addStatuses") or "", status_names)
            effect_label = _format_effects(effects)

            try:
                modifier = int((detail.get("modifier1") or "0").strip() or "0")
            except ValueError:
                modifier = 0

            area_raw = (detail.get("areaType") or "NONE").strip() or "NONE"
            area_label = SKILL_AREA_TYPE.get(area_raw, _title_enum(area_raw))

            try:
                aoe_range = int((detail.get("aoeRange") or "0").strip() or "0")
            except ValueError:
                aoe_range = 0

            charge_sec = _ms_to_seconds(detail.get("chargeTime") or "0")
            cooldown_sec = _ms_to_seconds(detail.get("cooldownTime") or "0")

            try:
                use_count = int((detail.get("useCount") or "0").strip() or "0")
            except ValueError:
                use_count = 0
            try:
                knockback = int((detail.get("modifier") or "0").strip() or "0")
            except ValueError:
                knockback = 0
            try:
                knockback_dist = int(
                    (detail.get("distance") or "0").strip() or "0"
                )
            except ValueError:
                knockback_dist = 0

            entry: dict[str, Any] = {
                "id": skill_id,
                "name": name,
                "description": (row.get("desc") or "").strip(),
                "affinity": aff_id,
                "affinityKey": aff_key,
                "affinityLabel": aff_label,
                "icon": icon_id,
                "iconAsset": icon_asset,
                "iconSrc": icon_src,
                "category": main_cat,
                "categoryLabel": category_label,
                "actionType": action_type if action_type != "—" else None,
                "cost": cost_label,
                "inheritance": inheritance,
                "inheritanceRestriction": inherit_id,
                "effects": effects,
                "effectLabel": effect_label,
                "modifier": modifier,
                "stat": dependency if dependency != "—" else None,
                "aoeType": area_label if area_label != "—" else None,
                "aoeRange": aoe_range,
                "incantationSec": charge_sec,
                "incantation": _format_seconds(charge_sec),
                "cooldownSec": cooldown_sec,
                "cooldown": _format_seconds(cooldown_sec),
                "stack": use_count,
                "knockback": knockback,
                "knockbackDistance": knockback_dist,
                "learnedBy": learned_by.get(skill_id, []),
            }
            skills.append(entry)

    skills.sort(key=lambda s: s["id"])
    return {
        "source": "BinaryData/Client/CSkillData.bin",
        "namesSource": "BinaryData/Client/CSkillData.bin (flatten)",
        "affinitySource": (
            "BinaryData/Shield/SkillData.sbin (flatten)"
            if skill_tsv is not None and skill_tsv.is_file()
            else ""
        ),
        "statusSource": (
            "BinaryData/Shield/CStatusData.sbin (flatten)"
            if cstatus_tsv is not None and cstatus_tsv.is_file()
            else ""
        ),
        "learnedBySource": (
            "BinaryData/Shield/DevilData.sbin (flatten)"
            if devil_tsv is not None and devil_tsv.is_file()
            else ""
        ),
        "iconsSource": "BinaryData/Client/CIconData_Skill.bin (flatten)",
        "generatedAt": _now_iso(),
        "note": "Generated from uploaded BinaryData on this server.",
        "skills": skills,
    }


def _icon_asset_from_model_name(model: str) -> str | None:
    """CModelData.model ``D2_04_007a_Base`` → ``icon_D2_04_007a``."""
    mesh = (model or "").strip()
    if not mesh:
        return None
    if mesh.endswith("_Base"):
        mesh = mesh[: -len("_Base")]
    if not mesh:
        return None
    if mesh.startswith("icon_"):
        return mesh
    return f"icon_{mesh}"


def _load_cmodel_icon_map(
    cmodel_tsvs: list[Path] | None,
) -> dict[int, tuple[str | None, int]]:
    """modelID → (icon asset from mesh name, CIcon iconID).

    Later TSV files only fill missing modelIDs (gap-fill), so a richer client
    dump can supplement an incomplete runtime CModelData without overriding.
    """
    out: dict[int, tuple[str | None, int]] = {}
    for path in cmodel_tsvs or []:
        if not path.is_file():
            continue
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            for row in reader:
                raw_id = (row.get("ID") or "").strip()
                if not raw_id.isdigit():
                    continue
                mid = int(raw_id)
                if mid in out:
                    continue
                asset = _icon_asset_from_model_name(row.get("model") or "")
                try:
                    icon_id = int((row.get("iconID") or "0").strip() or "0")
                except ValueError:
                    icon_id = 0
                out[mid] = (asset, icon_id)
    return out


def build_devils_payload(
    devil_tsv: Path,
    *,
    cicon_tsv: Path | None = None,
    cmodel_tsvs: list[Path] | None = None,
    icons_dir: Path | None = None,
) -> dict[str, Any]:
    """ID, name, race, LNC, base stats, resists, and optional icons.

    Icon lookup prefers DevilData.modelID → CModelData.model mesh name
    (``D2_04_007a_Base`` → ``icon_D2_04_007a``). Falling back to
    ``17000 + demonId`` in CIconData_Devil is wrong for most demons after the
    early ID ranges — CIcon keys track models, not DevilData IDs.
    """
    names: dict[str, str] = {}
    races: dict[str, str] = {}
    race_ids: dict[str, int] = {}
    lncs: dict[str, int] = {}
    levels: dict[str, int] = {}
    stats: dict[str, dict[str, int]] = {}
    resists: dict[str, dict[str, str]] = {}
    base_ids: dict[str, int] = {}
    model_ids: dict[str, int] = {}
    icon_assets: dict[str, str] = {}
    icon_srcs: dict[str, str] = {}
    icon_by_key = _load_devil_icon_map(cicon_tsv)
    model_by_id = _load_cmodel_icon_map(cmodel_tsvs)

    def resolve_icon(demon_id: int, model_id: int) -> str | None:
        if model_id > 0:
            entry = model_by_id.get(model_id)
            if entry:
                asset, icon_id = entry
                if asset:
                    return asset
                if icon_id > 0:
                    via_cicon = icon_by_key.get(icon_id)
                    if via_cicon:
                        return via_cicon
            # Own modelID declared but missing from CModelData — do not fall
            # back to 17000+id or base inheritance (that mislabels costumes).
            return None
        # Legacy: 17000+demonId (early ranges / no modelID only).
        if demon_id > 0:
            return icon_by_key.get(17000 + demon_id)
        return None

    pending_base_icons: list[tuple[str, int]] = []

    with devil_tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            raw_id = (row.get("ID") or "").strip()
            if not raw_id.isdigit():
                continue
            name = (row.get("name") or "").strip()
            if not name:
                continue
            race = (row.get("race") or "NONE").strip() or "NONE"
            raw_lnc = (row.get("LNC") or "0").strip()
            try:
                lnc = int(raw_lnc)
            except ValueError:
                lnc = 0
            try:
                level = int((row.get("baseLevel") or "0").strip() or "0")
            except ValueError:
                level = 0
            try:
                base_demon_id = int(
                    (row.get("baseDemonID") or "0").strip() or "0"
                )
            except ValueError:
                base_demon_id = 0
            try:
                model_id = int((row.get("modelID") or "0").strip() or "0")
            except ValueError:
                model_id = 0
            correct = _parse_correct_array(row.get("correct") or "")
            names[raw_id] = name
            races[raw_id] = race
            race_ids[raw_id] = DEVIL_RACE_IDS.get(race, 0)
            lncs[raw_id] = lnc
            levels[raw_id] = level
            base_ids[raw_id] = base_demon_id
            model_ids[raw_id] = model_id
            stats[raw_id] = {
                key: int(correct[idx]) for key, idx in DEVIL_STAT_IDX.items()
            }
            resists[raw_id] = {
                elem: _resist_display(correct[res_i], correct[nra_i])
                for elem, res_i, nra_i in DEVIL_RESIST_ELEMS
            }
            asset = resolve_icon(int(raw_id), model_id)
            if asset:
                icon_assets[raw_id] = asset
                if icons_dir is not None and (icons_dir / f"{asset}.png").is_file():
                    icon_srcs[raw_id] = f"/wiki/devil-icons/{asset}.png"
            elif (
                model_id <= 0
                and base_demon_id > 0
                and base_demon_id != int(raw_id)
            ):
                # Only inherit when this row has no model of its own.
                pending_base_icons.append((raw_id, base_demon_id))

    # Variants without their own model icon inherit the stock form's asset.
    for raw_id, base_demon_id in pending_base_icons:
        inherited = icon_assets.get(str(base_demon_id))
        if inherited:
            icon_assets[raw_id] = inherited
            if icons_dir is not None and (
                icons_dir / f"{inherited}.png"
            ).is_file():
                icon_srcs[raw_id] = f"/wiki/devil-icons/{inherited}.png"
            continue
        base_model = model_ids.get(str(base_demon_id), 0)
        asset = resolve_icon(base_demon_id, base_model)
        if asset:
            icon_assets[raw_id] = asset
            if icons_dir is not None and (icons_dir / f"{asset}.png").is_file():
                icon_srcs[raw_id] = f"/wiki/devil-icons/{asset}.png"

    return {
        "source": "BinaryData/Shield/DevilData.sbin",
        "generatedAt": _now_iso(),
        "resistElems": [elem for elem, _, _ in DEVIL_RESIST_ELEMS],
        "names": names,
        "races": races,
        "raceIds": race_ids,
        "lncs": lncs,
        "levels": levels,
        "baseDemonIds": base_ids,
        "modelIds": model_ids,
        "stats": stats,
        "resists": resists,
        "iconAssets": icon_assets,
        "iconSrcs": icon_srcs,
    }


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
    devil_icon_bin = (
        runtime / "datastore" / "BinaryData" / "Client" / "CIconData_Devil.bin"
    )
    cskill_bin = (
        runtime / "datastore" / "BinaryData" / "Client" / "CSkillData.bin"
    )
    skill_icon_bin = (
        runtime / "datastore" / "BinaryData" / "Client" / "CIconData_Skill.bin"
    )
    skill_sbin = shield / "SkillData.sbin"
    cstatus_sbin = shield / "CStatusData.sbin"
    client_dir = runtime / "datastore" / "BinaryData" / "Client"
    cmodel_bins = [
        client_dir / "CModelData1.bin",
        client_dir / "CModelData2.bin",
        client_dir / "CModelData3.bin",
    ]
    # Optional extra CModel dirs (pathsep-separated) gap-fill missing modelIDs.
    # No machine-local defaults — set OPS_CMODEL_EXTRA only when you intentionally
    # merge another Client BinaryData tree.
    extra_cmodel_dirs: list[Path] = []
    for raw in (os.environ.get("OPS_CMODEL_EXTRA") or "").split(os.pathsep):
        raw = raw.strip()
        if not raw:
            continue
        candidate = Path(raw).expanduser()
        if candidate.is_dir():
            extra_cmodel_dirs.append(candidate)
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

        devil_note = ""
        devil_count = 0
        devil_sbin = shield / "DevilData.sbin"
        devils_payload: dict[str, Any] | None = None
        if devil_sbin.is_file():
            ok, detail = _run(
                [
                    str(decrypt),
                    str(devil_sbin),
                    str(work / "DevilData.plain.bin"),
                ]
            )
            if ok:
                ok, detail = _run(
                    [
                        str(bdpatch),
                        "flatten",
                        "devil",
                        str(work / "DevilData.plain.bin"),
                        str(work / "DevilData.tsv"),
                    ]
                )
            if ok and devil_icon_bin.is_file():
                _run(
                    [
                        str(bdpatch),
                        "flatten",
                        "cicon",
                        str(devil_icon_bin),
                        str(work / "CIconData_Devil.tsv"),
                    ]
                )
            cmodel_tsvs: list[Path] = []
            if ok:
                flatten_idx = 0
                for cmodel_bin in cmodel_bins:
                    if not cmodel_bin.is_file():
                        continue
                    out_tsv = work / f"cmodel-{flatten_idx}-{cmodel_bin.name}.tsv"
                    flatten_idx += 1
                    flat_ok, _ = _run(
                        [
                            str(bdpatch),
                            "flatten",
                            "cmodel",
                            str(cmodel_bin),
                            str(out_tsv),
                        ]
                    )
                    if flat_ok:
                        cmodel_tsvs.append(out_tsv)
                for extra_dir in extra_cmodel_dirs:
                    for name in (
                        "CModelData1.bin",
                        "CModelData2.bin",
                        "CModelData3.bin",
                    ):
                        cmodel_bin = extra_dir / name
                        if not cmodel_bin.is_file():
                            continue
                        out_tsv = (
                            work / f"cmodel-extra-{flatten_idx}-{name}.tsv"
                        )
                        flatten_idx += 1
                        flat_ok, _ = _run(
                            [
                                str(bdpatch),
                                "flatten",
                                "cmodel",
                                str(cmodel_bin),
                                str(out_tsv),
                            ]
                        )
                        if flat_ok:
                            cmodel_tsvs.append(out_tsv)
            if ok:
                # Prefer website public icons when regenerating from a mounted tree;
                # runtime wiki/devil-icons is the Docker/live path.
                baked_icons = (
                    Path(__file__).resolve().parent.parent
                    / "website"
                    / "public"
                    / "wiki"
                    / "devil-icons"
                )
                runtime_icons = out_dir / "devil-icons"
                icons_dir = (
                    baked_icons
                    if baked_icons.is_dir()
                    else runtime_icons
                )
                cicon_path = work / "CIconData_Devil.tsv"
                devils_payload = build_devils_payload(
                    work / "DevilData.tsv",
                    cicon_tsv=cicon_path if cicon_path.is_file() else None,
                    cmodel_tsvs=cmodel_tsvs or None,
                    icons_dir=icons_dir if icons_dir.is_dir() else None,
                )
                devil_count = len(devils_payload["names"])
                _atomic_write_json(wiki_devils_path(runtime), devils_payload)
            else:
                devil_note = (
                    f"Devil export failed ({detail}); "
                    "wiki items still available."
                )
        else:
            devil_note = "DevilData.sbin not present; demon catalog unchanged."

        skill_note = ""
        skill_count = 0
        skills_payload: dict[str, Any] | None = None
        if cskill_bin.is_file():
            ok, detail = _run(
                [
                    str(bdpatch),
                    "flatten",
                    "cskill",
                    str(cskill_bin),
                    str(work / "CSkillData.tsv"),
                ]
            )
            if ok and skill_icon_bin.is_file():
                _run(
                    [
                        str(bdpatch),
                        "flatten",
                        "cicon",
                        str(skill_icon_bin),
                        str(work / "CIconData_Skill.tsv"),
                    ]
                )
            skill_tsv_path: Path | None = None
            if ok and skill_sbin.is_file():
                ok_skill, detail_skill = _run(
                    [
                        str(decrypt),
                        str(skill_sbin),
                        str(work / "SkillData.plain.bin"),
                    ]
                )
                if ok_skill:
                    ok_skill, detail_skill = _run(
                        [
                            str(bdpatch),
                            "flatten",
                            "skill",
                            str(work / "SkillData.plain.bin"),
                            str(work / "SkillData.tsv"),
                        ]
                    )
                if ok_skill:
                    skill_tsv_path = work / "SkillData.tsv"
                else:
                    skill_note = (
                        f"SkillData detail export failed ({detail_skill}); "
                        "names still available."
                    )
            cstatus_tsv_path: Path | None = None
            if ok and cstatus_sbin.is_file():
                ok_st, _ = _run(
                    [
                        str(decrypt),
                        str(cstatus_sbin),
                        str(work / "CStatusData.plain.bin"),
                    ]
                )
                if ok_st:
                    ok_st, _ = _run(
                        [
                            str(bdpatch),
                            "flatten",
                            "cstatus",
                            str(work / "CStatusData.plain.bin"),
                            str(work / "CStatusData.tsv"),
                        ]
                    )
                if ok_st:
                    cstatus_tsv_path = work / "CStatusData.tsv"
            devil_tsv_for_skills: Path | None = work / "DevilData.tsv"
            if devil_tsv_for_skills is not None and not devil_tsv_for_skills.is_file():
                devil_tsv_for_skills = None
            if ok:
                baked_skill_icons = (
                    Path(__file__).resolve().parent.parent
                    / "website"
                    / "public"
                    / "wiki"
                    / "skill-icons"
                )
                runtime_skill_icons = out_dir / "skill-icons"
                skill_icons_dir = (
                    baked_skill_icons
                    if baked_skill_icons.is_dir()
                    else runtime_skill_icons
                )
                cicon_skill = work / "CIconData_Skill.tsv"
                skills_payload = build_skills_payload(
                    work / "CSkillData.tsv",
                    cicon_tsv=cicon_skill if cicon_skill.is_file() else None,
                    skill_tsv=skill_tsv_path,
                    cstatus_tsv=cstatus_tsv_path,
                    devil_tsv=devil_tsv_for_skills,
                    icons_dir=(
                        skill_icons_dir if skill_icons_dir.is_dir() else None
                    ),
                )
                skill_count = len(skills_payload["skills"])
                _atomic_write_json(wiki_skills_path(runtime), skills_payload)
            else:
                skill_note = (
                    f"Skill export failed ({detail}); "
                    "wiki items still available."
                )
        else:
            skill_note = "CSkillData.bin not present; skill catalog unchanged."

        baked_synced = _sync_baked_wiki_catalogs(
            items_payload,
            enchants_payload,
            devils_payload,
            skills_payload,
        )

        notes = [n for n in (enchant_note, devil_note, skill_note) if n]
        info = {
            "detail": "; ".join(notes) or "wiki catalogs written",
            "itemCount": len(items_payload["items"]),
            "enchantCount": len(enchants_payload["enchants"]),
            "demonCount": devil_count,
            "skillCount": skill_count,
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
