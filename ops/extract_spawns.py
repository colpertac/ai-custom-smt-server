"""Scan zone XML for Spawn records → website/content/wiki/spawns.json.

Builds demon/enemy type → zone reverse index for 16B / 16F Ask retrieval.
XML-only; primary source is comp_hack/datastore (not deploy mirror).
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from wiki_export import _atomic_write_json, _now_iso

NAMED_OBJECT_MARKERS = {
    "Spawn": '<object name="Spawn">',
    "PlasmaSpawn": '<object name="PlasmaSpawn">',
    "DropSet": '<object name="DropSet">',
}
ZONE_OBJ_START_RE = re.compile(r'<object name="ServerZone(?:Partial)?">')
ZONE_FILE_RE = re.compile(r"zone[-_](\d+)(?:_|\.xml)")
SPAWN_DATA_FILE_RE = re.compile(r"SpawnData_(\d+)")


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _server_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _wiki_dir() -> Path:
    return _server_root() / "website" / "content" / "wiki"


def _default_datastore() -> Path:
    return _repo_root() / "comp_hack" / "datastore"


def _parse_member_int(body: str, name: str) -> int | None:
    hit = re.search(rf'<member name="{name}">([^<]+)</member>', body)
    if not hit:
        return None
    raw = hit.group(1).strip()
    try:
        return int(raw)
    except ValueError:
        return None


def _parse_member_str(body: str, name: str) -> str | None:
    hit = re.search(rf'<member name="{name}">([^<]*)</member>', body)
    return hit.group(1).strip() if hit else None


def iter_named_object_bodies(text: str, object_name: str):
    """Yield (start_offset, inner_xml) for each named object (nested-safe)."""
    marker = NAMED_OBJECT_MARKERS.get(object_name, f'<object name="{object_name}">')
    pos = 0
    while pos < len(text):
        start = text.find(marker, pos)
        if start < 0:
            return
        body_start = start + len(marker)
        depth = 1
        i = body_start
        while i < len(text) and depth > 0:
            next_open = text.find("<object", i)
            next_close = text.find("</object>", i)
            if next_close < 0:
                return
            if 0 <= next_open < next_close:
                depth += 1
                i = next_open + 7
                continue
            depth -= 1
            if depth == 0:
                yield start, text[body_start:next_close]
                pos = next_close + len("</object>")
                break
            i = next_close + len("</object>")
        else:
            return


def _extract_member_content(body: str, name: str) -> str | None:
    """Return inner XML of <member name="NAME">…</member>, allowing nested members."""
    marker = f'<member name="{name}">'
    start = body.find(marker)
    if start < 0:
        return None
    pos = start + len(marker)
    depth = 1
    while pos < len(body) and depth > 0:
        next_open = body.find("<member", pos)
        next_close = body.find("</member>", pos)
        if next_close < 0:
            return None
        if 0 <= next_open < next_close:
            depth += 1
            pos = next_open + 7
            continue
        depth -= 1
        if depth == 0:
            return body[start + len(marker) : next_close]
        pos = next_close + 9
    return None


def _parse_member_list_ints(body: str, name: str) -> list[int]:
    block = _extract_member_content(body, name)
    if not block:
        return []
    return [int(x) for x in re.findall(r"<element>(\d+)</element>", block)]


def _parse_item_drops(body: str, list_name: str) -> list[dict[str, Any]]:
    block = _extract_member_content(body, list_name)
    if not block:
        return []
    drops: list[dict[str, Any]] = []
    for obj in re.finditer(r"<object>([\s\S]*?)</object>", block):
        chunk = obj.group(1)
        item_type = _parse_member_int(chunk, "ItemType")
        if item_type is None:
            continue
        entry: dict[str, Any] = {"itemId": item_type}
        rate = _parse_member_str(chunk, "Rate")
        if rate is not None:
            try:
                entry["rate"] = float(rate)
            except ValueError:
                entry["rate"] = rate
        for key in ("MinStack", "MaxStack"):
            val = _parse_member_int(chunk, key)
            if val is not None:
                entry[key[0].lower() + key[1:]] = val
        drops.append(entry)
    return drops


def _zone_ids_from_filename(path: Path) -> list[int]:
    ids: list[int] = []
    for m in ZONE_FILE_RE.finditer(path.name):
        ids.append(int(m.group(1)))
    m = SPAWN_DATA_FILE_RE.search(path.name)
    if m:
        val = int(m.group(1))
        if val not in ids:
            ids.append(val)
    return ids


def _zone_context_before(text: str, pos: int) -> tuple[int | None, str | None]:
    """Return (zoneId, zoneObjectKind) from nearest enclosing ServerZone block."""
    window = text[max(0, pos - 16000) : pos]
    starts = list(ZONE_OBJ_START_RE.finditer(window))
    if not starts:
        return None, None
    last = starts[-1]
    chunk = window[last.start() :]
    kind = "ServerZonePartial" if "Partial" in last.group(0) else "ServerZone"
    zone_id = _parse_member_int(chunk, "ID")
    return zone_id, kind


@dataclass
class SpawnRecord:
    spawn_id: int
    enemy_type: int
    zone_id: int
    source_file: str
    category: str | None = None
    level: int | None = None
    variant_type: int | None = None
    drop_set_ids: list[int] = field(default_factory=list)
    gift_set_ids: list[int] = field(default_factory=list)
    inline_drops: list[dict[str, Any]] = field(default_factory=list)
    inline_gifts: list[dict[str, Any]] = field(default_factory=list)
    inherit_drops: bool | None = None
    zone_kind: str | None = None


@dataclass
class PlasmaRecord:
    zone_id: int
    drop_set_id: int
    source_file: str


def iter_zone_xml_files(datastore_root: Path) -> list[Path]:
    files: set[Path] = set()
    zones_dir = datastore_root / "zones"
    if zones_dir.is_dir():
        files.update(zones_dir.glob("**/*.xml"))
    partials = datastore_root / "partials"
    if partials.is_dir():
        files.update(partials.glob("**/zones/**/*.xml"))
    return sorted(files)


def parse_spawn_body(body: str) -> dict[str, Any] | None:
    spawn_id = _parse_member_int(body, "ID")
    enemy_type = _parse_member_int(body, "EnemyType")
    if spawn_id is None or enemy_type is None:
        return None
    inherit_raw = _parse_member_str(body, "InheritDrops")
    inherit_drops: bool | None = None
    if inherit_raw is not None:
        inherit_drops = inherit_raw.lower() in ("true", "1")
    return {
        "spawnId": spawn_id,
        "enemyType": enemy_type,
        "category": _parse_member_str(body, "Category"),
        "level": _parse_member_int(body, "Level"),
        "variantType": _parse_member_int(body, "VariantType"),
        "dropSetIds": _parse_member_list_ints(body, "DropSetIDs"),
        "giftSetIds": _parse_member_list_ints(body, "GiftSetIDs"),
        "inlineDrops": _parse_item_drops(body, "Drops"),
        "inlineGifts": _parse_item_drops(body, "Gifts"),
        "inheritDrops": inherit_drops,
    }


def scan_zone_file(path: Path) -> tuple[list[SpawnRecord], list[PlasmaRecord]]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return [], []

    rel = path.name
    fallback_zone_ids = _zone_ids_from_filename(path)
    spawns: list[SpawnRecord] = []
    plasmas: list[PlasmaRecord] = []

    for start, body in iter_named_object_bodies(text, "Spawn"):
        parsed = parse_spawn_body(body)
        if not parsed:
            continue
        zone_id, zone_kind = _zone_context_before(text, start)
        if zone_id is None and fallback_zone_ids:
            zone_id = fallback_zone_ids[-1]
        if zone_id is None:
            continue
        spawns.append(
            SpawnRecord(
                spawn_id=parsed["spawnId"],
                enemy_type=parsed["enemyType"],
                zone_id=zone_id,
                source_file=rel,
                category=parsed["category"],
                level=parsed["level"],
                variant_type=parsed["variantType"],
                drop_set_ids=parsed["dropSetIds"],
                gift_set_ids=parsed["giftSetIds"],
                inline_drops=parsed["inlineDrops"],
                inline_gifts=parsed["inlineGifts"],
                inherit_drops=parsed["inheritDrops"],
                zone_kind=zone_kind,
            )
        )

    for start, body in iter_named_object_bodies(text, "PlasmaSpawn"):
        drop_set_id = _parse_member_int(body, "DropSetID")
        if drop_set_id is None:
            continue
        zone_id, _ = _zone_context_before(text, start)
        if zone_id is None and fallback_zone_ids:
            zone_id = fallback_zone_ids[-1]
        if zone_id is None:
            continue
        plasmas.append(
            PlasmaRecord(zone_id=zone_id, drop_set_id=drop_set_id, source_file=rel)
        )

    return spawns, plasmas


def scan_all_spawns(datastore_root: Path) -> tuple[list[SpawnRecord], list[PlasmaRecord], int]:
    all_spawns: list[SpawnRecord] = []
    all_plasmas: list[PlasmaRecord] = []
    files = iter_zone_xml_files(datastore_root)
    for path in files:
        spawns, plasmas = scan_zone_file(path)
        all_spawns.extend(spawns)
        all_plasmas.extend(plasmas)
    return all_spawns, all_plasmas, len(files)


def build_spawns_payload(
    datastore_root: Path,
    source_note: str,
    spawns: list[SpawnRecord] | None = None,
    plasmas: list[PlasmaRecord] | None = None,
    files_scanned: int | None = None,
) -> dict[str, Any]:
    if spawns is None or plasmas is None or files_scanned is None:
        spawns, plasmas, files_scanned = scan_all_spawns(datastore_root)

    by_enemy: dict[int, dict[str, Any]] = {}
    zone_ids_seen: set[int] = set()

    for rec in spawns:
        zone_ids_seen.add(rec.zone_id)
        bucket = by_enemy.setdefault(
            rec.enemy_type,
            {
                "enemyType": rec.enemy_type,
                "zoneIds": set(),
                "spawns": [],
            },
        )
        bucket["zoneIds"].add(rec.zone_id)
        spawn_entry: dict[str, Any] = {
            "spawnId": rec.spawn_id,
            "zoneId": rec.zone_id,
            "sourceFile": rec.source_file,
        }
        if rec.category:
            spawn_entry["category"] = rec.category
        if rec.level is not None and rec.level >= 0:
            spawn_entry["level"] = rec.level
        if rec.variant_type is not None:
            spawn_entry["variantType"] = rec.variant_type
        if rec.drop_set_ids:
            spawn_entry["dropSetIds"] = rec.drop_set_ids
        if rec.gift_set_ids:
            spawn_entry["giftSetIds"] = rec.gift_set_ids
        if rec.inline_drops:
            spawn_entry["inlineDrops"] = rec.inline_drops
        if rec.inline_gifts:
            spawn_entry["inlineGifts"] = rec.inline_gifts
        if rec.inherit_drops is not None:
            spawn_entry["inheritDrops"] = rec.inherit_drops
        if rec.zone_kind:
            spawn_entry["zoneKind"] = rec.zone_kind
        bucket["spawns"].append(spawn_entry)

    by_enemy_out: dict[str, Any] = {}
    for enemy_type, data in sorted(by_enemy.items()):
        zone_ids = sorted(data["zoneIds"])
        spawns_list = sorted(
            data["spawns"],
            key=lambda s: (s["zoneId"], s["spawnId"]),
        )
        by_enemy_out[str(enemy_type)] = {
            "enemyType": enemy_type,
            "zoneIds": zone_ids,
            "zoneCount": len(zone_ids),
            "spawnCount": len(spawns_list),
            "spawns": spawns_list,
        }

    plasma_by_zone: dict[str, list[dict[str, Any]]] = defaultdict(list)
    plasma_drop_sets: set[int] = set()
    for p in plasmas:
        zone_ids_seen.add(p.zone_id)
        plasma_drop_sets.add(p.drop_set_id)
        plasma_by_zone[str(p.zone_id)].append(
            {"dropSetId": p.drop_set_id, "sourceFile": p.source_file}
        )

    return {
        "source": source_note,
        "generatedAt": _now_iso(),
        "note": (
            "Enemy/demon type → zone spawn index from ServerZone XML. "
            "Does not resolve InheritDrops devil defaults or spot-level "
            "SpawnLocationGroups. Plasma field nodes included under plasmaByZone."
        ),
        "stats": {
            "filesScanned": files_scanned,
            "spawnEntries": len(spawns),
            "enemyTypes": len(by_enemy_out),
            "zonesWithSpawns": len(zone_ids_seen),
            "plasmaNodes": len(plasmas),
            "plasmaDropSetIds": len(plasma_drop_sets),
        },
        "byEnemyType": by_enemy_out,
        "plasmaByZone": dict(sorted(plasma_by_zone.items(), key=lambda kv: int(kv[0]))),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract spawn reverse index from zone XML")
    parser.add_argument(
        "--datastore",
        type=Path,
        default=None,
        help="comp_hack/datastore root",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_wiki_dir() / "spawns.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--verify-enemy",
        type=int,
        default=4422,
        help="EnemyType to print sample zones for (default: 4422)",
    )
    args = parser.parse_args(argv)

    datastore = args.datastore or _default_datastore()
    if not datastore.is_dir():
        print(f"Datastore not found: {datastore}")
        return 1

    try:
        ds_label = datastore.relative_to(_repo_root()).as_posix()
    except ValueError:
        ds_label = str(datastore)
    source_note = (
        f"{ds_label}/zones/** + partials/**/zones + zones/partial/spawns"
    )
    payload = build_spawns_payload(datastore, source_note)
    _atomic_write_json(args.output, payload)

    stats = payload["stats"]
    print(f"Wrote spawns.json → {args.output}")
    print(
        f"  spawn entries: {stats['spawnEntries']} | "
        f"enemy types: {stats['enemyTypes']} | "
        f"zones: {stats['zonesWithSpawns']} | "
        f"plasma nodes: {stats['plasmaNodes']} | "
        f"files: {stats['filesScanned']}"
    )
    if args.verify_enemy is not None:
        hit = payload["byEnemyType"].get(str(args.verify_enemy))
        if hit:
            print(
                f"  verify enemy {args.verify_enemy}: "
                f"{hit['spawnCount']} spawns in zones {hit['zoneIds'][:8]}"
                f"{'…' if len(hit['zoneIds']) > 8 else ''}"
            )
        else:
            print(f"  verify enemy {args.verify_enemy}: not found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
