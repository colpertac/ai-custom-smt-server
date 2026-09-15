"""Scan event XML for ActionUpdateQuest → quest start/advance/complete NPC index.

Writes website/content/wiki/quest-npcs.json for 16F Ask retrieval.
XML-only; no BinaryData decrypt required.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from wiki_export import _atomic_write_json, _now_iso

ACTION_UPDATE_RE = re.compile(
    r'<object name="ActionUpdateQuest">([\s\S]*?)</object>'
)
EVENT_OPEN_RE = re.compile(r'<object name="Event[^"]*">')
EVENT_ID_RE = re.compile(r'<member name="ID">([^<]+)</member>')
ZONE_EVENTS_FILE_RE = re.compile(r"zone_events-(\d+)\.xml$")
SERVER_NPC_RE = re.compile(
    r"<!--\s*([^\n<>]+?)\s*-->\s*<object name=\"ServerNPC\">"
    r"[\s\S]*?<member name=\"ID\">(\d+)</member>",
    re.MULTILINE,
)
EVENT_NPC_COMMENT_RE = re.compile(r"<!--\s*NPC\s+(\d+)\s*-->")
Z_EVENT_ZONE_NPC_RE = re.compile(r"^Z(\d+)_(\d+)(?:_|$)")
DUNGEON_EVENT_NPC_RE = re.compile(r"^D\d+_\d+_(\d+)_")


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _server_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _wiki_dir() -> Path:
    return _server_root() / "website" / "content" / "wiki"


def _find_events_roots() -> tuple[Path, Path | None]:
    """Return (primary events dir, deploy mirror if present and different)."""
    root = _repo_root()
    primary = root / "comp_hack" / "datastore"
    deploy = _server_root() / "deploy" / "data" / "datastore"
    deploy_events = deploy / "events" if deploy.is_dir() else None
    return primary, deploy_events


def _iter_event_xml_files(datastore_root: Path) -> list[Path]:
    files: list[Path] = []
    events_dir = datastore_root / "events"
    if events_dir.is_dir():
        files.extend(sorted(events_dir.glob("*.xml")))
    partials_events = datastore_root / "partials"
    if partials_events.is_dir():
        files.extend(sorted(partials_events.glob("**/events/**/*.xml")))
    return files


def _parse_member_int(body: str, name: str) -> int | None:
    hit = re.search(rf'<member name="{name}">([^<]+)</member>', body)
    if not hit:
        return None
    try:
        return int(hit.group(1).strip())
    except ValueError:
        return None


def _parse_member_bool(body: str, name: str) -> bool | None:
    m = re.search(rf'<member name="{name}">([^<]+)</member>', body)
    if not m:
        return None
    val = m.group(1).strip().lower()
    if val in ("true", "1"):
        return True
    if val in ("false", "0"):
        return False
    return None


def _parse_flag_states(body: str) -> dict[str, int] | None:
    m = re.search(r'<member name="flagStates">([\s\S]*?)</member>', body)
    if not m:
        return None
    flags: dict[str, int] = {}
    for pair in re.finditer(
        r"<pair>\s*<key>(-?\d+)</key>\s*<value>(-?\d+)</value>\s*</pair>",
        m.group(1),
    ):
        flags[pair.group(1)] = int(pair.group(2))
    return flags or None


def _zone_from_filename(path: Path) -> int | None:
    m = ZONE_EVENTS_FILE_RE.search(path.name)
    return int(m.group(1)) if m else None


def _parse_event_id_zone_npc(event_id: str) -> tuple[int | None, int | None]:
    m = Z_EVENT_ZONE_NPC_RE.match(event_id)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = DUNGEON_EVENT_NPC_RE.match(event_id)
    if m:
        return None, int(m.group(1))
    return None, None


def _classify_role(phase: int | None, quest_id: int, event_id: str) -> str:
    if phase == -1:
        return "complete"
    if phase == 0:
        return "start"
    if phase is None:
        if re.search(rf"_Q{quest_id}(?:_|$)", event_id):
            return "start"
        return "advance"
    if phase == 1:
        return "advance"
    return "advance"


def _build_npc_name_index(datastore_root: Path) -> dict[tuple[int, int], str]:
    """(zoneID, npcID) → display label from zone / partial ServerNPC comments."""
    index: dict[tuple[int, int], str] = {}
    zone_dirs = [
        datastore_root / "zones",
        datastore_root / "partials",
    ]
    for base in zone_dirs:
        if not base.is_dir():
            continue
        for path in sorted(base.glob("**/*.xml")):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            zone_id = None
            zm = re.search(r"zone[-_](\d+)", path.name)
            if zm:
                zone_id = int(zm.group(1))
            if zone_id is None:
                head = text[:4000]
                zid = re.search(r'<member name="ID">(\d+)</member>', head)
                if zid:
                    zone_id = int(zid.group(1))
            if zone_id is None:
                continue
            for comment, npc_id in SERVER_NPC_RE.findall(text):
                name = comment.strip()
                if name:
                    index[(zone_id, int(npc_id))] = name
    return index


def _load_quest_cquest_npc(datastore_root: Path) -> dict[int, str]:
    quests_path = _wiki_dir() / "quests.json"
    if not quests_path.is_file():
        return {}
    try:
        data = json.loads(quests_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[int, str] = {}
    for q in data.get("quests") or []:
        qid = q.get("id")
        npc = q.get("npc")
        if isinstance(qid, int) and npc:
            out[qid] = str(npc)
    return out


def _find_enclosing_event_id(content: str, pos: int) -> str | None:
    chunk = content[:pos]
    openings = list(EVENT_OPEN_RE.finditer(chunk))
    if not openings:
        return None
    segment = content[openings[-1].start() : pos]
    m = EVENT_ID_RE.search(segment)
    return m.group(1).strip() if m else None


def _resolve_npc_name(
    zone_id: int | None,
    npc_id: int | None,
    npc_index: dict[tuple[int, int], str],
    event_npc_comments: dict[int, str],
    cquest_npc: dict[int, str],
    quest_id: int,
    role: str,
) -> str | None:
    if npc_id is not None and zone_id is not None:
        hit = npc_index.get((zone_id, npc_id))
        if hit:
            return hit
    if npc_id is not None:
        hit = event_npc_comments.get(npc_id)
        if hit:
            return hit
    if role == "start" and quest_id in cquest_npc:
        return cquest_npc[quest_id]
    return None


def scan_action_update_quests(
    datastore_root: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    npc_index = _build_npc_name_index(datastore_root)
    cquest_npc = _load_quest_cquest_npc(datastore_root)
    records: list[dict[str, Any]] = []
    files_scanned = 0

    for path in _iter_event_xml_files(datastore_root):
        files_scanned += 1
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        file_zone = _zone_from_filename(path)
        rel_source = str(path.relative_to(datastore_root))

        event_npc_comments: dict[int, str] = {}
        for npc_id in EVENT_NPC_COMMENT_RE.findall(content):
            event_npc_comments[int(npc_id)] = f"NPC {npc_id}"

        for m in ACTION_UPDATE_RE.finditer(content):
            body = m.group(1)
            quest_id = _parse_member_int(body, "questID")
            if quest_id is None:
                continue
            phase = _parse_member_int(body, "phase")
            force_update = _parse_member_bool(body, "forceUpdate")
            flag_states = _parse_flag_states(body)
            event_id = _find_enclosing_event_id(content, m.start()) or ""
            event_object = None
            if event_id:
                open_m = list(EVENT_OPEN_RE.finditer(content[: m.start()]))
                if open_m:
                    seg = content[open_m[-1].start() : m.start()]
                    om = re.search(r'<object name="(Event[^"]*)">', seg)
                    if om:
                        event_object = om.group(1)

            zone_from_event, npc_from_event = _parse_event_id_zone_npc(event_id)
            zone_id = zone_from_event or file_zone
            npc_id = npc_from_event
            role = _classify_role(phase, quest_id, event_id)
            npc_name = _resolve_npc_name(
                zone_id,
                npc_id,
                npc_index,
                event_npc_comments,
                cquest_npc,
                quest_id,
                role,
            )

            records.append(
                {
                    "questID": quest_id,
                    "phase": phase,
                    "role": role,
                    "forceUpdate": force_update,
                    "flagStates": flag_states,
                    "eventId": event_id or None,
                    "eventObject": event_object,
                    "npcId": npc_id,
                    "npcName": npc_name,
                    "zoneID": zone_id,
                    "sourceFile": rel_source,
                }
            )

    stats = {
        "filesScanned": files_scanned,
        "actionUpdateQuestCount": len(records),
        "questsWithNpcLinks": len(
            {r["questID"] for r in records if r.get("npcId") is not None}
        ),
        "questsWithAnyUpdate": len({r["questID"] for r in records}),
    }
    return records, stats


def build_quest_npcs_payload(
    datastore_root: Path,
    source_note: str,
) -> dict[str, Any]:
    records, stats = scan_action_update_quests(datastore_root)
    by_quest: dict[str, dict[str, list[dict[str, Any]]]] = {}

    for rec in records:
        qkey = str(rec["questID"])
        bucket = by_quest.setdefault(
            qkey, {"start": [], "advance": [], "complete": []}
        )
        entry = {
            k: rec[k]
            for k in (
                "npcId",
                "npcName",
                "zoneID",
                "eventId",
                "phase",
                "forceUpdate",
                "flagStates",
                "sourceFile",
            )
            if rec.get(k) is not None
        }
        bucket[rec["role"]].append(entry)

    return {
        "source": source_note,
        "generatedAt": _now_iso(),
        "note": (
            "Quest NPC links from ActionUpdateQuest in event XML. "
            "Roles: phase 0 → start, -1 → complete, else advance. "
            "Missing phase on _Q{id}_ event IDs treated as start."
        ),
        "stats": stats,
        "byQuestId": by_quest,
    }


def _print_quest_verification(payload: dict[str, Any], quest_id: int) -> None:
    entry = payload.get("byQuestId", {}).get(str(quest_id))
    if not entry:
        print(f"Quest {quest_id}: no ActionUpdateQuest links found")
        return
    print(f"Quest {quest_id} NPC graph:")
    for role in ("start", "advance", "complete"):
        rows = entry.get(role) or []
        print(f"  {role} ({len(rows)}):")
        for row in rows:
            npc = row.get("npcName") or "?"
            npc_id = row.get("npcId")
            zone = row.get("zoneID")
            phase = row.get("phase")
            eid = row.get("eventId")
            print(
                f"    npc {npc_id} ({npc}) zone {zone} phase {phase} event {eid}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract quest-NPC index from event ActionUpdateQuest"
    )
    parser.add_argument(
        "--datastore",
        type=Path,
        default=None,
        help="comp_hack/datastore root (default: repo comp_hack/datastore)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_wiki_dir() / "quest-npcs.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--verify-id",
        type=int,
        default=5,
        help="Quest ID to print after export (default: 5)",
    )
    args = parser.parse_args(argv)

    primary, _deploy = _find_events_roots()
    datastore = args.datastore or primary
    if not datastore.is_dir():
        print(f"Datastore not found: {datastore}")
        return 1

    # deploy/data/datastore mirrors comp_hack (248 event XML each); scan primary only.
    source_note = f"{datastore}/events + partials/**/events (comp_hack primary)"

    payload = build_quest_npcs_payload(datastore, source_note)
    _atomic_write_json(args.output, payload)

    stats = payload["stats"]
    print(f"Wrote quest-npcs.json → {args.output}")
    print(
        f"  ActionUpdateQuest: {stats['actionUpdateQuestCount']} | "
        f"quests with NPC id: {stats['questsWithNpcLinks']} | "
        f"quests with any update: {stats['questsWithAnyUpdate']} | "
        f"files: {stats['filesScanned']}"
    )
    if args.verify_id is not None:
        _print_quest_verification(payload, args.verify_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
