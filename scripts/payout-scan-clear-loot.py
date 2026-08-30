#!/usr/bin/env python3
"""
Scan channel event XML for clear-loot (isBossBox) events and cross-check
admin payout stubs.

Writes machine-readable catalog used by /admin/payouts wire-status UI.

  python3 scripts/payout-scan-clear-loot.py
  python3 scripts/payout-scan-clear-loot.py --events-dir ... --payouts-dir ... --out ...

Default paths are relative to ai_custom_smt_server/.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

OBJECT_RE = re.compile(
    r'<object\s+name="(?P<name>[^"]+)"\s*>(?P<body>.*?)</object>',
    re.S,
)
MEMBER_RE = re.compile(
    r'<member\s+name="(?P<name>[^"]+)"\s*>(?P<val>.*?)</member>',
    re.S,
)
ELEMENT_RE = re.compile(r"<element>\s*([^<]+?)\s*</element>", re.S)
SPOT_RE = re.compile(
    r'<member\s+name="SpotID"\s*>\s*(\d+)\s*</member>', re.S
)
DROPSET_RE = re.compile(
    r'<member\s+name="dropSetIDs"\s*>(.*?)</member>', re.S | re.I
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def member_map(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in MEMBER_RE.finditer(body):
        # Keep first top-level-ish occurrence; nested members overwrite same keys
        # which is fine for ID/next on Event objects.
        name = m.group("name")
        val = m.group("val").strip()
        if name not in out:
            out[name] = val
    return out


def parse_bool(s: str | None) -> bool:
    return (s or "").strip().lower() in ("true", "1", "yes")


def scan_events(events_dir: Path) -> list[dict]:
    """Find EventPerformActions (etc.) that contain isBossBox=true.

    Nested <object> tags mean isBossBox sits inside ActionCreateLoot; walk
    outward until the enclosing Event / EventPerformActions / EventPlayScene.
    """
    loot_events: list[dict] = []
    seen: set[str] = set()
    wanted = {"Event", "EventPerformActions", "EventPlayScene"}

    def enclosing_object(text: str, pos: int) -> tuple[int, int, str] | None:
        """Return (start, end, objectName) for the nearest wanted ancestor."""
        search_from = pos
        while search_from > 0:
            start = text.rfind("<object", 0, search_from)
            if start < 0:
                return None
            name_m = re.match(r'<object\s+name="([^"]+)"', text[start:])
            obj_name = name_m.group(1) if name_m else ""
            # Match this object's closing tag with nesting
            i = start
            depth = 0
            end = -1
            while i < len(text):
                next_open = text.find("<object", i + 1) if depth == 0 else text.find("<object", i)
                if depth == 0:
                    # consume opening at start
                    depth = 1
                    i = start + 7
                    continue
                next_close = text.find("</object>", i)
                if next_close < 0:
                    break
                if next_open >= 0 and next_open < next_close:
                    depth += 1
                    i = next_open + 7
                else:
                    depth -= 1
                    i = next_close + 9
                    if depth == 0:
                        end = i
                        break
            if end < 0:
                return None
            if obj_name in wanted and start <= pos < end:
                return start, end, obj_name
            # Not the right type (e.g. ActionCreateLoot) — keep walking out
            search_from = start
        return None

    for path in sorted(events_dir.glob("*.xml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for bm in re.finditer(
            r'<member\s+name="isBossBox"\s*>\s*true\s*</member>', text, re.I
        ):
            found = enclosing_object(text, bm.start())
            if not found:
                continue
            start, end, obj_name = found
            block = text[start:end]
            members = member_map(block)
            event_id = members.get("ID", "").strip()
            if not event_id or event_id in seen:
                continue
            seen.add(event_id)
            next_id = members.get("next", "").strip() or None
            spots = [int(x) for x in SPOT_RE.findall(block)]
            drop_sets: list[int] = []
            for dm in DROPSET_RE.finditer(block):
                for x in ELEMENT_RE.findall(dm.group(1)):
                    x = x.strip()
                    if x.isdigit():
                        drop_sets.append(int(x))
            uid = event_id.upper()
            path_tags: list[str] = []
            if "FIEND" in uid:
                path_tags.append("fiend")
            if "NORMAL" in uid or "BOSS" in uid:
                path_tags.append("normal")
            if "BEARCAT" in uid or "_BC" in uid or uid.endswith("BC"):
                path_tags.append("bearcat")
            if "WILDCAT" in uid or "_WC" in uid:
                path_tags.append("wildcat")
            if "LOOT" in uid:
                path_tags.append("loot_named")
            if "REWARD" in uid:
                path_tags.append("reward_named")

            loot_events.append(
                {
                    "eventId": event_id,
                    "objectName": obj_name,
                    "next": next_id,
                    "spotIds": sorted(set(spots)),
                    "dropSetIds": sorted(set(drop_sets)),
                    "sourceFile": path.name,
                    "pathTags": path_tags,
                }
            )
    return loot_events


def scan_all_next_targets(events_dir: Path) -> dict[str, list[str]]:
    """Map eventId → list of stock events whose next points at it."""
    incoming: dict[str, list[str]] = defaultdict(list)
    id_re = re.compile(r'<member\s+name="ID"\s*>\s*([^<]+?)\s*</member>')
    next_re = re.compile(r'<member\s+name="next"\s*>\s*([^<]+?)\s*</member>')

    for path in sorted(events_dir.glob("*.xml")):
        text = path.read_text(encoding="utf-8", errors="replace")
        # Pair each next with the nearest preceding ID in the file (good enough
        # for stock→AFTER wiring checks).
        ids = [(m.start(), m.group(1).strip()) for m in id_re.finditer(text)]
        if not ids:
            continue
        for nm in next_re.finditer(text):
            target = nm.group(1).strip()
            if not target:
                continue
            # nearest ID before this next
            eid = None
            for pos, iid in ids:
                if pos < nm.start():
                    eid = iid
                else:
                    break
            if eid:
                incoming[target].append(eid)
    return {k: list(dict.fromkeys(v)) for k, v in incoming.items()}


def scan_zone_instances(zoneinstance_path: Path) -> list[dict]:
    if not zoneinstance_path.is_file():
        return []
    text = zoneinstance_path.read_text(encoding="utf-8", errors="replace")
    out: list[dict] = []
    for m in OBJECT_RE.finditer(text):
        if m.group("name") != "ServerZoneInstance":
            continue
        body = m.group("body")
        members = member_map(body)
        try:
            iid = int(members.get("ID", "0"))
        except ValueError:
            continue
        lobby = members.get("LobbyID")
        zones_block = re.search(
            r'<member\s+name="ZoneIDs"\s*>(.*?)</member>', body, re.S
        )
        zones: list[int] = []
        if zones_block:
            for x in ELEMENT_RE.findall(zones_block.group(1)):
                x = x.strip()
                if x.isdigit():
                    zones.append(int(x))
        out.append(
            {
                "instanceId": iid,
                "lobbyId": int(lobby) if lobby and lobby.isdigit() else None,
                "zoneIds": zones,
                "toLobbyEventId": members.get("ToLobbyEventID") or None,
            }
        )
    return out


def load_payouts(payouts_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for path in sorted(payouts_dir.glob("*.json")):
        if path.name.startswith(".") or path.name == "clear-loot-catalog.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        p = data.get("payout") or {}
        if not p.get("id"):
            continue
        hooks = p.get("hooks") or {}
        rows.append(
            {
                "id": p["id"],
                "name": p.get("name"),
                "family": p.get("family"),
                "difficulty": p.get("difficulty"),
                "enabled": bool(p.get("enabled")),
                "instanceId": p.get("instanceId"),
                "cp": p.get("cp"),
                "spotId": p.get("spotId"),
                "crateCount": p.get("crateCount"),
                "hooks": {
                    "afterNormalLootEventId": hooks.get("afterNormalLootEventId"),
                    "afterFiendLootEventId": hooks.get("afterFiendLootEventId"),
                    "bonusEventId": hooks.get("bonusEventId"),
                    "bonusFiendEventId": hooks.get("bonusFiendEventId"),
                    "resumeNormalNext": hooks.get("resumeNormalNext"),
                },
                "filename": path.name,
            }
        )
    return rows


def classify_payout(
    payout: dict,
    loot_by_id: dict[str, dict],
    incoming: dict[str, list[str]],
    instances: dict[int, dict],
) -> dict:
    hooks = payout["hooks"]
    resume = (hooks.get("resumeNormalNext") or "").strip()
    after_n = (hooks.get("afterNormalLootEventId") or "").strip()
    after_f = (hooks.get("afterFiendLootEventId") or "").strip()

    resume_todo = (not resume) or resume.upper().startswith("TODO")
    stock_pointing_normal = incoming.get(after_n, []) if after_n else []
    stock_pointing_fiend = incoming.get(after_f, []) if after_f else []
    stock_wired = bool(stock_pointing_normal or stock_pointing_fiend)

    inst = payout.get("instanceId")
    instance_exists = inst in instances if isinstance(inst, int) else False

    # Candidate clear-loot events: same source file prefix as instance id, or ID contains instance
    candidates: list[str] = []
    if isinstance(inst, int):
        needle = str(inst)
        for eid, row in loot_by_id.items():
            if needle in eid or needle in row.get("sourceFile", ""):
                candidates.append(eid)
        # also zone-based: events file dungeon_events-{zoneprefix}
        zi = instances.get(inst)
        if zi:
            for zid in zi.get("zoneIds") or []:
                zprefix = str(zid)[:5]  # e.g. 54010 from 540101
                for eid, row in loot_by_id.items():
                    if zprefix in eid or zprefix in row.get("sourceFile", ""):
                        candidates.append(eid)

    candidates = list(dict.fromkeys(candidates))[:40]

    issues: list[str] = []
    if resume_todo:
        issues.append("resumeNormalNext is TODO / empty — stock clear not linked")
    if payout["enabled"] and not stock_wired:
        issues.append(
            "enabled but no stock event nexts into AFTER_* hooks (silent no CP)"
        )
    if payout["enabled"] and resume_todo:
        issues.append("enabled with unfinished resume hook")
    if isinstance(inst, int) and not instance_exists:
        issues.append(f"instanceId {inst} not found in zoneinstance data")
    if stock_wired and resume_todo:
        issues.append("stock points at AFTER_* but resume still TODO")

    if stock_wired and not resume_todo:
        status = "wired"
    elif stock_wired:
        status = "partial"
    elif not resume_todo:
        status = "hooks_ready"  # resume filled but stock not patched
    else:
        status = "unwired_stub"

    return {
        "payoutId": payout["id"],
        "status": status,
        "enabled": payout["enabled"],
        "instanceId": inst,
        "instanceExists": instance_exists,
        "resumeTodo": resume_todo,
        "stockWired": stock_wired,
        "stockEventsPointingAtNormal": stock_pointing_normal,
        "stockEventsPointingAtFiend": stock_pointing_fiend,
        "candidateClearLootEventIds": candidates,
        "issues": issues,
        "liveEffect": (
            "clear grants CP/crates"
            if stock_wired and payout["enabled"] and not resume_todo
            else "edit-only — beating dungeon will not grant this payout"
        ),
    }


def build_catalog(
    events_dir: Path, payouts_dir: Path, zoneinstance_path: Path
) -> dict:
    loot = scan_events(events_dir)
    incoming = scan_all_next_targets(events_dir)
    instances = scan_zone_instances(zoneinstance_path)
    inst_by_id = {i["instanceId"]: i for i in instances}
    payouts = load_payouts(payouts_dir)
    loot_by_id = {e["eventId"]: e for e in loot}

    # Shared next targets: multiple loot events with same next (family splice points)
    next_groups: dict[str, list[str]] = defaultdict(list)
    for e in loot:
        if e.get("next"):
            next_groups[e["next"]].append(e["eventId"])

    wire = [
        classify_payout(p, loot_by_id, incoming, inst_by_id) for p in payouts
    ]
    status_counts: dict[str, int] = defaultdict(int)
    for w in wire:
        status_counts[w["status"]] += 1

    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "sources": {
            "eventsDir": str(events_dir),
            "payoutsDir": str(payouts_dir),
            "zoneInstanceFile": str(zoneinstance_path),
        },
        "summary": {
            "clearLootEventCount": len(loot),
            "zoneInstanceCount": len(instances),
            "payoutCount": len(payouts),
            "payoutStatusCounts": dict(status_counts),
            "enabledWired": sum(
                1
                for w in wire
                if w["enabled"] and w["status"] == "wired"
            ),
            "enabledUnwired": sum(
                1
                for w in wire
                if w["enabled"] and w["status"] != "wired"
            ),
        },
        "clearLootEvents": loot,
        "zoneInstances": instances,
        "payouts": payouts,
        "wireStatus": wire,
        "notes": [
            "Clear loot is detected via ActionCreateLoot isBossBox=true in event XML.",
            "Zone instance XML does not list clear event IDs — discovery is from events.",
            "status=wired means stock event next points at payout AFTER_* hooks.",
            "Most catalog stubs are unwired_stub until stock next is patched (Phase 13 pattern).",
            "Shared-difficulty families (e.g. Suginami 5401/2/3) share loot events; use instance branches.",
        ],
    }


def main() -> int:
    root = repo_root()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--events-dir",
        type=Path,
        default=root.parent / "comp_hack" / "runtime" / "datastore" / "events",
    )
    ap.add_argument(
        "--payouts-dir",
        type=Path,
        default=root / "server-content" / "payouts",
    )
    ap.add_argument(
        "--zoneinstance",
        type=Path,
        default=root.parent
        / "comp_hack"
        / "runtime"
        / "datastore"
        / "data"
        / "zoneinstance"
        / "00_stock.xml",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=root / "server-content" / "payouts" / "clear-loot-catalog.json",
    )
    ap.add_argument("--pretty", action="store_true", default=True)
    args = ap.parse_args()

    if not args.events_dir.is_dir():
        print(f"events dir missing: {args.events_dir}", file=sys.stderr)
        return 2

    catalog = build_catalog(args.events_dir, args.payouts_dir, args.zoneinstance)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(catalog, indent=2 if args.pretty else None) + "\n",
        encoding="utf-8",
    )

    s = catalog["summary"]
    print(
        f"Wrote {args.out} — {s['clearLootEventCount']} clear-loot events, "
        f"{s['payoutCount']} payouts, status={s['payoutStatusCounts']}"
    )
    # Verification highlights
    wire_by_id = {w["payoutId"]: w for w in catalog["wireStatus"]}
    sug = wire_by_id.get("suginami-bronze")
    if sug:
        print(
            f"verify suginami-bronze: status={sug['status']} "
            f"stock={sug['stockEventsPointingAtNormal']}"
        )
    nak = wire_by_id.get("nakano-ug-gold")
    if nak:
        print(
            f"verify nakano-ug-gold: status={nak['status']} "
            f"issues={nak['issues']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
