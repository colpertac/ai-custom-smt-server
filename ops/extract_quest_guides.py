"""Build smtwiki-style quest walkthroughs from the event graph (16B / 16F).

For every ActionUpdateQuest in event XML, walk the event graph backwards to
whatever starts it (talk to an NPC, touch an object, walk into an area,
defeat a spawn group, zone trigger) and record what happens on the way:
dialogue choices to pick, conditions that must hold, NPC dialogue, and
actions (items given/taken, XP, alignment, skills, zone changes, fights).

Inputs:
  - datastore events/*.xml + zones/*.xml (comp_hack/datastore)
  - BinaryData Shield tables for English text: hNPCData (NPC names),
    ZoneData (zone names), CEventMessageData{,2} (dialogue)
  - quests.json (QuestData start conditions / quest list)

Writes website/content/wiki/quest-guides.json. No LLM — every line is
traceable to an event ID.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from collections import deque
from pathlib import Path
from typing import Any, Callable, Iterable

from wiki_export import (
    _atomic_write_json,
    _find_bdpatch,
    _find_decrypt,
    _now_iso,
    _run,
)

# Dialogue tables (decrypted, then `comp_bdpatch load ceventmessage` → XML).
TEXT_TABLES = ("CEventMessageData", "CEventMessageData2")

# Conditions that are event-graph plumbing, not something a player acts on.
HIDDEN_CONDITION_TYPES = {
    "ZONE_FLAGS",
    "ZONE_INSTANCE_FLAGS",
    "ZONE_CHARACTER_FLAGS",
    "ZONE_INSTANCE_CHARACTER_FLAGS",
    "QUEST_FLAGS",
    "NPC_STATE",
    "SCRIPT",
    "EVENT_COUNTER",
    "EVENT_WORLD_COUNTER",
    "ZONE",
    "ZONE_INSTANCE",
    "ZONE_CHARACTER",
    "ZONE_INSTANCE_CHARACTER",
    "QUEST_PHASE_REQUIREMENTS",
    "QUESTS_ACTIVE",
}
SELF_QUEST_CONDITION_TYPES = {"QUEST_ACTIVE", "QUEST_PHASE", "QUEST_COMPLETE"}

# Lower sorts first when two triggers are equally close to an update.
TRIGGER_PRIORITY = {"npc": 0, "object": 1, "defeat": 2, "spot": 3, "zone": 4}

MAX_REVERSE_VISIT = 6000
MAX_TAIL_EVENTS = 14
MAX_DIALOGUE_LINES = 40
MAX_VARIANTS_PER_PHASE = 4

EVENT_ZONE_RE = re.compile(r"^(?:Z(\d+)_|D\d+_(\d+)_)")
EVENT_FILE_ZONE_RE = re.compile(r"zone_events-(\d+)\.xml$")
PC_NAME_RE = re.compile(r"<PCName>", re.IGNORECASE)


def _server_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _smt_root() -> Path:
    return _server_root().parent


def _wiki_dir() -> Path:
    return _server_root() / "website" / "content" / "wiki"


# ---------------------------------------------------------------------------
# Small XML helpers (comp_hack object XML: <object name=X><member name=Y>)
# ---------------------------------------------------------------------------


def _members(obj: ET.Element) -> dict[str, ET.Element]:
    return {m.get("name", ""): m for m in obj.findall("member")}


def _text(el: ET.Element | None) -> str | None:
    if el is None:
        return None
    t = (el.text or "").strip()
    return t or None


def _int(el: ET.Element | None, default: int | None = None) -> int | None:
    t = _text(el)
    if t is None:
        return default
    try:
        return int(t)
    except ValueError:
        try:
            return int(float(t))
        except ValueError:
            return default


def _list_objects(member: ET.Element | None) -> list[ET.Element]:
    """Objects inside <element> wrappers of a list member."""
    if member is None:
        return []
    out: list[ET.Element] = []
    for el in member.findall("element"):
        obj = el.find("object")
        if obj is not None:
            out.append(obj)
    return out


def _list_ints(member: ET.Element | None) -> list[int]:
    if member is None:
        return []
    out: list[int] = []
    for el in member.findall("element"):
        v = _int(el)
        if v is not None:
            out.append(v)
    return out


def _pairs(member: ET.Element | None) -> list[tuple[ET.Element, ET.Element]]:
    if member is None:
        return []
    out = []
    for pair in member.findall("pair"):
        k, v = pair.find("key"), pair.find("value")
        if k is not None and v is not None:
            out.append((k, v))
    return out


# ---------------------------------------------------------------------------
# Text tables
# ---------------------------------------------------------------------------


def _clean_page(raw: str) -> str:
    text = PC_NAME_RE.sub("[Player]", raw or "")
    # Client text boxes hard-wrap; rejoin into prose but keep blank-line breaks.
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return "\n".join(p for p in paras if p)


def load_event_messages(paths: Iterable[Path]) -> dict[int, list[str]]:
    messages: dict[int, list[str]] = {}
    for path in paths:
        if not path.is_file():
            continue
        for obj in ET.parse(path).getroot().iter("object"):
            if obj.get("name") != "MiCEventMessageData":
                continue
            m = _members(obj)
            mid = _int(m.get("ID"))
            if mid is None:
                continue
            lines = m.get("lines")
            pages = [
                _clean_page(el.text or "")
                for el in (lines.findall("element") if lines is not None else [])
            ]
            pages = [p for p in pages if p]
            if pages:
                messages[mid] = pages
    return messages


def load_npc_names(path: Path) -> dict[int, str]:
    names: dict[int, str] = {}
    if not path.is_file():
        return names
    for obj in ET.parse(path).getroot().iter("object"):
        if obj.get("name") != "MiHNPCBasicData":
            continue
        m = _members(obj)
        nid, name = _int(m.get("ID")), _text(m.get("name"))
        if nid is not None and name:
            names[nid] = name
    return names


def load_zone_names(path: Path) -> dict[int, str]:
    return {zid: info["name"] for zid, info in load_zone_info(path).items()}


def load_zone_info(path: Path | None) -> dict[int, dict[str, str]]:
    """ZoneData → {zone id: {name, type, spotFile}} (first record per id)."""
    info: dict[int, dict[str, str]] = {}
    if path is None or not path.is_file():
        return info
    for obj in ET.parse(path).getroot().iter("object"):
        if obj.get("name") != "MiZoneData":
            continue
        basic = obj.find(".//object[@name='MiZoneBasicData']")
        files = obj.find(".//object[@name='MiZoneFileData']")
        if basic is None:
            continue
        bm = _members(basic)
        zid = _int(bm.get("id"))
        if zid is None or zid in info:
            continue
        info[zid] = {
            "name": _text(bm.get("name")) or "",
            "type": _text(bm.get("type")) or "",
            "spotFile": (
                _text(_members(files).get("spotFile")) or "" if files is not None else ""
            ),
        }
    return info


class GameTables:
    """BinaryData tables as XML, converted on demand with comp_bdpatch.

    Shield tables are decrypted first; Client tables (CMapData, spot files)
    are plain. `tables_dir` may hold pre-converted `<name>.xml` files.
    """

    def __init__(self, runtime: Path | None, tables_dir: Path | None) -> None:
        self.runtime = runtime
        self.tables_dir = tables_dir
        self.workdir = Path(tempfile.mkdtemp(prefix="quest-guides-"))
        self.errors: list[str] = []
        self._decrypt = _find_decrypt()
        self._bdpatch = _find_bdpatch()

    def close(self) -> None:
        shutil.rmtree(self.workdir, ignore_errors=True)

    def __enter__(self) -> "GameTables":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def xml(self, name: str, kind: str, *, client: bool = False) -> Path | None:
        if self.tables_dir is not None:
            given = self.tables_dir / f"{name}.xml"
            return given if given.is_file() else None
        out = self.workdir / f"{name}.xml"
        if out.is_file():
            return out
        if self.runtime is None or self._bdpatch is None:
            return None
        folder = "Client" if client else "Shield"
        src = self.runtime / "datastore" / "BinaryData" / folder / (
            f"{name}.bin" if client else f"{name}.sbin"
        )
        if not src.is_file():
            return None
        if not client:
            if self._decrypt is None:
                return None
            plain = self.workdir / f"{name}.plain.bin"
            ok, detail = _run([str(self._decrypt), str(src), str(plain)])
            if not ok:
                self.errors.append(f"{name} decrypt: {detail}")
                return None
            src = plain
        ok, detail = _run([str(self._bdpatch), "load", kind, str(src), str(out)])
        if not ok:
            self.errors.append(f"{name} load: {detail}")
            return None
        return out


class MapGrid:
    """World position → the in-game map's [X:Y] grid label.

    The client's map is drawn at 100 world units per pixel (400 on FIELD
    maps), shifted by CMapData x/yOffset pixels, with a 16-pixel grid whose
    cell 21 starts at the origin; Y grows southward. Checked against 79
    quest-giver coordinates in CQuestData (95% exact, misses ±1 at cell
    edges) and smtwiki's Shinjuku Docks controller [X24:Y36].
    """

    def __init__(self, tables: GameTables | None) -> None:
        self.tables = tables
        self.zones = load_zone_info(tables.xml("ZoneData", "zone") if tables else None)
        self.maps: dict[int, tuple[float, float]] = {}
        self.dynamic_spots: dict[int, str] = {}
        self._spots: dict[str, dict[int, tuple[float, float]]] = {}
        cmap = tables.xml("CMapData", "cmap", client=True) if tables else None
        if cmap is not None:
            for obj in ET.parse(cmap).getroot().findall("object"):
                m = _members(obj)
                mid = _int(m.get("ID"))
                if mid and _text(m.get("showMap")) == "true":
                    self.maps[mid] = (
                        float(_text(m.get("xOffset")) or 0),
                        float(_text(m.get("yOffset")) or 0),
                    )
        dyn = tables.xml("DynamicMapData", "dynamicmap", client=True) if tables else None
        if dyn is not None:
            for obj in ET.parse(dyn).getroot().findall("object"):
                m = _members(obj)
                did, spot_file = _int(m.get("id")), _text(m.get("spotDataFile"))
                if did and spot_file:
                    self.dynamic_spots[did] = spot_file

    def spots(self, zone_id: int, dynamic_map: int | None) -> dict[int, tuple[float, float]]:
        spot_file = self.dynamic_spots.get(dynamic_map or 0) or self.zones.get(
            zone_id, {}
        ).get("spotFile")
        if not spot_file or self.tables is None:
            return {}
        if spot_file not in self._spots:
            spots: dict[int, tuple[float, float]] = {}
            path = self.tables.xml(Path(spot_file).stem, "spot", client=True)
            if path is not None:
                for obj in ET.parse(path).getroot().findall("object"):
                    m = _members(obj)
                    sid = _int(m.get("id"))
                    x, y = _text(m.get("centerX")), _text(m.get("centerY"))
                    if sid is not None and x and y:
                        spots[sid] = (float(x), float(y))
            self._spots[spot_file] = spots
        return self._spots[spot_file]

    def locate(self, trigger: dict[str, Any]) -> list[int] | None:
        """Grid [x, y] for a trigger's `pos`, or None when unknown/no map."""
        pos, zone_id = trigger.get("pos"), trigger.get("zoneID")
        if not pos or not zone_id:
            return None
        if "spot" in pos:
            point = self.spots(zone_id, trigger.get("dynamicMap")).get(pos["spot"])
            if point is None:
                return None
            x, y = point
        else:
            x, y = pos["x"], pos["y"]
        return self.grid(zone_id, x, y)

    def grid(self, zone_id: int, x: float, y: float) -> list[int] | None:
        if zone_id not in self.maps:
            return None
        x_off, y_off = self.maps[zone_id]
        cell = 16 * (4 if self.zones.get(zone_id, {}).get("type") == "FIELD" else 1)
        return [
            math.floor((x / 100 + x_off) / cell) + 21,
            math.floor((-y / 100 + y_off) / cell) + 21,
        ]


def load_text_tables(
    tables: GameTables,
) -> tuple[dict[int, str], dict[int, list[str]]]:
    """Return (npc names, event messages)."""
    npc = tables.xml("hNPCData", "hnpc")
    message_files = [tables.xml(n, "ceventmessage") for n in TEXT_TABLES]
    return (
        load_npc_names(npc) if npc else {},
        load_event_messages([p for p in message_files if p]),
    )


# ---------------------------------------------------------------------------
# Event graph
# ---------------------------------------------------------------------------


def _parse_condition(obj: ET.Element) -> dict[str, Any] | None:
    m = _members(obj)
    ctype = _text(m.get("type"))
    if obj.get("name") == "EventScriptCondition":
        ctype = "SCRIPT"
    if not ctype:
        return None
    cond: dict[str, Any] = {"type": ctype}
    for key in ("value1", "value2"):
        v = _int(m.get(key))
        if v is not None:
            cond[key] = v
    mode = _text(m.get("compareMode"))
    if mode:
        cond["compareMode"] = mode
    if _text(m.get("negate")) == "true":
        cond["negate"] = True
    flags = _flag_states(m)
    if flags:
        cond["flags"] = flags
    return cond


def _flag_states(m: dict[str, ET.Element]) -> dict[str, int]:
    """flagStates map → {"flag": value} (JSON-safe keys)."""
    return {
        str(k): v
        for kk, vv in _pairs(m.get("flagStates"))
        if (k := _int(kk)) is not None and (v := _int(vv)) is not None
    }


def _parse_conditions(member: ET.Element | None) -> list[dict[str, Any]]:
    out = []
    for obj in _list_objects(member):
        cond = _parse_condition(obj)
        if cond:
            out.append(cond)
    return out


def _parse_action(obj: ET.Element) -> dict[str, Any] | None:
    """Player-visible summary of one action, or None for plumbing."""
    name = obj.get("name") or ""
    m = _members(obj)
    if name == "ActionAddRemoveItems":
        items = [
            {"id": _int(k), "count": _int(v, 0)}
            for k, v in _pairs(m.get("items"))
            if _int(k) is not None
        ]
        if not items:
            return None
        act: dict[str, Any] = {"type": "items", "items": items}
        mode = _text(m.get("mode"))
        if mode and mode != "INVENTORY":
            act["mode"] = mode
        return act
    if name == "ActionGrantXP":
        xp = _int(m.get("XP"), 0) or 0
        if xp == 0:
            return None
        return {
            "type": "xp",
            "amount": xp,
            "target": _text(m.get("targetType")) or "CHARACTER",
        }
    if name == "ActionUpdateLNC":
        value = _int(m.get("value"), 0) or 0
        return {
            "type": "lnc",
            "value": value,
            "set": _text(m.get("isSet")) == "true",
        }
    if name == "ActionGrantSkills":
        skills = _list_ints(m.get("skillIDs"))
        expertise = [
            {"id": _int(k), "points": _int(v, 0)}
            for k, v in _pairs(m.get("expertisePoints"))
        ]
        if not skills and not expertise:
            return None
        act = {"type": "skills", "skills": skills}
        if expertise:
            act["expertise"] = expertise
        if _text(m.get("targetType")) == "PARTNER":
            act["target"] = "PARTNER"
        return act
    if name == "ActionUpdatePoints":
        value = _int(m.get("value"), 0) or 0
        if value == 0:
            return None
        return {
            "type": "points",
            "pointType": _text(m.get("pointType")) or "CP",
            "value": value,
            "set": _text(m.get("isSet")) == "true",
        }
    if name == "ActionUpdateFlag":
        flag_type = _text(m.get("flagType")) or "MAP"
        fid = _int(m.get("ID"))
        if fid is None:
            return None
        return {
            "type": "flag",
            "flagType": flag_type,
            "id": fid,
            "remove": _text(m.get("remove")) == "true",
        }
    if name == "ActionUpdateCOMP":
        add = [
            {"id": _int(k), "count": _int(v, 1)} for k, v in _pairs(m.get("addDemons"))
        ]
        remove = [
            {"id": _int(k), "count": _int(v, 1)}
            for k, v in _pairs(m.get("removeDemons"))
        ]
        if not add and not remove:
            return None
        return {"type": "demons", "add": add, "remove": remove}
    if name == "ActionZoneChange":
        zid = _int(m.get("zoneID"))
        if not zid:
            return None
        return {"type": "zone", "zoneID": zid}
    if name == "ActionSetHomepoint":
        return {"type": "homepoint", "zoneID": _int(m.get("zoneID"))}
    if name == "ActionUpdateQuest":
        qid, phase = _int(m.get("questID")), _int(m.get("phase"))
        flags = _flag_states(m)
        if qid is None:
            return None
        if phase is None and not flags:
            phase = 0  # schema default: start the quest
        if phase is None:
            # Flag-only update: quest-internal progress (puzzle solver input).
            return {
                "type": "questFlags",
                "questID": qid,
                "flags": flags,
                "mode": _text(m.get("flagSetMode")) or "UPDATE",
            }
        act: dict[str, Any] = {"type": "quest", "questID": qid, "phase": phase}
        if flags:
            act["flags"] = flags
            act["mode"] = _text(m.get("flagSetMode")) or "UPDATE"
        return act
    if name == "ActionSpawn":
        if _text(m.get("mode")) == "DESPAWN":
            return None
        refs = _spawn_refs(m)
        if not refs["groups"] and not refs["locations"]:
            return None
        return {"type": "spawn", **refs}
    return None


def _spawn_refs(m: dict[str, ET.Element]) -> dict[str, list[int]]:
    """ActionSpawn targets: explicit spawn groups and/or spawn location groups."""
    groups = [g for k, _v in _pairs(m.get("spawnGroupIDs")) if (g := _int(k))]
    return {"groups": groups, "locations": _list_ints(m.get("spawnLocationGroupIDs"))}


def _walk_actions(
    member: ET.Element | None,
    *,
    defeat_groups: dict[str, list[int]] | None = None,
) -> tuple[list[dict[str, Any]], list[tuple[str, dict[str, Any]]], list[int]]:
    """Parse an actions list → (summaries, out-edges, display message IDs)."""
    actions: list[dict[str, Any]] = []
    edges: list[tuple[str, dict[str, Any]]] = []
    messages: list[int] = []
    for obj in _list_objects(member):
        name = obj.get("name") or ""
        m = _members(obj)
        if name == "ActionStartEvent":
            target = _text(m.get("eventID"))
            if target:
                edge = (
                    {"kind": "defeat", "spawn": defeat_groups}
                    if defeat_groups is not None
                    else {"kind": "start"}
                )
                edges.append((target, edge))
            continue
        if name in ("ActionDisplayMessage", "ActionStageEffect"):
            messages.extend(_list_ints(m.get("messageIDs")))
            mid = _int(m.get("messageID"))
            if mid:
                messages.append(mid)
            continue
        summary = _parse_action(obj)
        if summary:
            actions.append(summary)
        if name == "ActionSpawn":
            _sub_actions, sub_edges, _ = _walk_actions(
                m.get("defeatActions"), defeat_groups=_spawn_refs(m)
            )
            edges.extend(sub_edges)
    return actions, edges, messages


def _parse_branches(
    member: ET.Element | None,
) -> list[tuple[str, list[dict[str, Any]]]]:
    out = []
    for obj in _list_objects(member):
        m = _members(obj)
        target = _text(m.get("next"))
        if target:
            out.append((target, _parse_conditions(m.get("conditions"))))
    return out


def _event_zone(event_id: str, source: Path) -> int | None:
    match = EVENT_ZONE_RE.match(event_id)
    if match:
        return int(match.group(1) or match.group(2))
    match = EVENT_FILE_ZONE_RE.search(source.name)
    return int(match.group(1)) if match else None


def parse_event(obj: ET.Element, source: Path) -> dict[str, Any] | None:
    m = _members(obj)
    eid = _text(m.get("ID"))
    if not eid:
        return None
    ev: dict[str, Any] = {
        "id": eid,
        "type": obj.get("name"),
        "zone": _event_zone(eid, source),
        "file": source.name,
        "conditions": _parse_conditions(m.get("conditions")),
        "messages": _list_ints(m.get("messageIDs")),
        "actions": [],
        "edges": [],
        "sysMessages": [],
    }
    mid = _int(m.get("messageID"))
    if mid:
        ev["prompt" if obj.get("name") in ("EventPrompt", "EventITime") else "message"] = mid
    script = _text(m.get("branchScriptID"))
    if script:
        ev["branchScript"] = script
    # branch_questPhase picks branches[phase] while the quest is active and
    # falls through to `next` (-1) when it is not.
    phase_quest = None
    if script == "branch_questPhase":
        params = _list_ints(m.get("branchScriptParams"))
        phase_quest = params[0] if params else None
    edges: list[tuple[str, dict[str, Any]]] = []
    branches = _parse_branches(m.get("branches"))
    for idx, (target, conds) in enumerate(branches):
        edge: dict[str, Any] = {"kind": "branch", "conditions": conds}
        if phase_quest is not None:
            edge["questPhase"] = [phase_quest, idx]
        edges.append((target, _with_skips(edge, branches[:idx])))
    for choice in _list_objects(m.get("choices")):
        cm = _members(choice)
        choice_msg = _int(cm.get("messageID"))
        choice_conds = _parse_conditions(cm.get("conditions"))
        choice_branches = _parse_branches(cm.get("branches"))
        for idx, (btarget, bconds) in enumerate(choice_branches):
            edge = {
                "kind": "choice",
                "choice": choice_msg,
                "conditions": choice_conds + bconds,
            }
            edges.append((btarget, _with_skips(edge, choice_branches[:idx])))
        target = _text(cm.get("next"))
        if target:
            edge = {"kind": "choice", "choice": choice_msg, "conditions": choice_conds}
            edges.append((target, _with_skips(edge, choice_branches)))
    actions, action_edges, sys_messages = _walk_actions(m.get("actions"))
    ev["actions"] = actions
    ev["sysMessages"] = sys_messages
    edges.extend(action_edges)
    target = _text(m.get("next"))
    if target:
        edge = {"kind": "next"}
        if phase_quest is not None:
            edge["questPhase"] = [phase_quest, -1]
        edges.append((target, _with_skips(edge, branches)))
    target = _text(m.get("queueNext"))
    if target:
        edges.append((target, {"kind": "queue"}))
    ev["edges"] = edges
    return ev


def _with_skips(
    edge: dict[str, Any], skipped: list[tuple[str, list[dict[str, Any]]]]
) -> dict[str, Any]:
    """Note quests whose "not completed yet" branch this edge falls past.

    Branches are tried in order, so taking this edge means every earlier one
    failed. If one of those was gated only on "quest Q not completed", this
    route is unreachable while Q is in progress — a detour for Q's guide.
    """
    guards: list[int] = []
    for _target, conds in skipped:
        visible = [c for c in conds if c.get("type") not in HIDDEN_CONDITION_TYPES]
        if (
            len(visible) == 1
            and visible[0].get("type") == "QUEST_COMPLETE"
            and visible[0].get("value2", 0) == 0
            and not visible[0].get("negate")
        ):
            guards.append(int(visible[0].get("value1", 0)))
    if guards:
        edge["skipsNotComplete"] = guards
    return edge


def load_events(datastore: Path) -> dict[str, dict[str, Any]]:
    events: dict[str, dict[str, Any]] = {}
    roots = [datastore / "events"]
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.xml")):
            try:
                tree = ET.parse(path)
            except ET.ParseError:
                continue
            for obj in tree.getroot().findall("object"):
                if not (obj.get("name") or "").startswith("Event"):
                    continue
                ev = parse_event(obj, path)
                if ev and ev["id"] not in events:
                    events[ev["id"]] = ev
    return events


# ---------------------------------------------------------------------------
# Zone triggers (what starts an event chain)
# ---------------------------------------------------------------------------


SpawnData = dict[int, dict[str, dict[int, Any]]]


def load_zone_triggers(
    datastore: Path,
) -> tuple[dict[str, list[dict[str, Any]]], SpawnData]:
    """Return (eventID → trigger infos, zone → {groups, locations})."""
    triggers: dict[str, list[dict[str, Any]]] = {}
    spawn_data: SpawnData = {}
    zones_dir = datastore / "zones"
    if not zones_dir.is_dir():
        return triggers, spawn_data

    for path in sorted(zones_dir.rglob("*.xml")):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for zone_obj in root.findall("object"):
            zm = _members(zone_obj)
            zone_id = (
                _int(zm.get("ID")) if zone_obj.get("name") == "ServerZone" else None
            )
            spawns: dict[int, int] = {}
            for k, v in _pairs(zm.get("Spawns")):
                spawn = v.find("object")
                if spawn is None:
                    continue
                enemy = _int(_members(spawn).get("EnemyType"))
                if enemy:
                    spawns[_int(k, 0) or 0] = enemy
            zone_spawns = spawn_data.setdefault(
                zone_id or 0, {"groups": {}, "locations": {}}
            )
            for k, v in _pairs(zm.get("SpawnGroups")):
                group = v.find("object")
                if group is None:
                    continue
                enemies = [
                    {"type": spawns[sid], "count": _int(cnt, 1) or 1}
                    for sk, cnt in _pairs(_members(group).get("Spawns"))
                    if (sid := _int(sk, 0) or 0) in spawns
                ]
                if enemies:
                    zone_spawns["groups"][_int(k, 0) or 0] = enemies
            for k, v in _pairs(zm.get("SpawnLocationGroups")):
                slg = v.find("object")
                if slg is not None:
                    zone_spawns["locations"][_int(k, 0) or 0] = _list_ints(
                        _members(slg).get("GroupIDs")
                    )
            dynamic_map = _int(zm.get("DynamicMapID"))
            _collect_triggers(zone_obj, (zone_id, dynamic_map), [], triggers)
    return triggers, spawn_data


def _collect_triggers(
    el: ET.Element,
    zone: tuple[int | None, int | None],
    stack: list[tuple[str, ET.Element]],
    out: dict[str, list[dict[str, Any]]],
) -> None:
    name = el.get("name") or ""
    if el.tag == "object" and name == "ActionStartEvent":
        event_id = _text(_members(el).get("eventID"))
        if event_id:
            info = _trigger_info(zone[0], stack)
            if info:
                if info.get("pos") and zone[1]:
                    info["dynamicMap"] = zone[1]
                rows = out.setdefault(event_id, [])
                if info not in rows:
                    rows.append(info)
        return
    pushed = el.tag in ("object", "member")
    if pushed:
        stack.append((name, el))
    for child in el:
        _collect_triggers(child, zone, stack, out)
    if pushed:
        stack.pop()


def _trigger_info(
    zone_id: int | None, stack: list[tuple[str, ET.Element]]
) -> dict[str, Any] | None:
    member_names = [n for n, el in stack if el.tag == "member"]
    for name, el in reversed(stack):
        if el.tag != "object":
            continue
        m = _members(el)
        if name == "ServerNPC":
            return _with_pos(
                {"kind": "npc", "zoneID": zone_id, "npcId": _int(m.get("ID"))}, m
            )
        if name == "ServerObject":
            return _with_pos(
                {"kind": "object", "zoneID": zone_id, "objectId": _int(m.get("ID"))},
                m,
            )
        if name == "ServerZoneSpot":
            spot = _int(m.get("ID"))
            return {
                "kind": "spot",
                "zoneID": zone_id,
                "spotId": spot,
                "pos": {"spot": spot},
            }
        if name == "SpawnGroup" or (
            name == "ActionSpawn" and "defeatActions" in member_names
        ):
            spawn = (
                {"groups": [_int(m.get("ID"), 0) or 0], "locations": []}
                if name == "SpawnGroup"
                else _spawn_refs(m)
            )
            info = {"kind": "defeat", "zoneID": zone_id, "spawn": spawn}
            if name == "ActionSpawn" and _int(m.get("spotID")):
                info["pos"] = {"spot": _int(m.get("spotID"))}
            return info
        if name == "ServerZoneTrigger":
            return {
                "kind": "zone",
                "zoneID": zone_id,
                "trigger": _text(m.get("Trigger")),
            }
    return None


def _with_pos(info: dict[str, Any], m: dict[str, ET.Element]) -> dict[str, Any]:
    """Placed NPCs/objects sit on a spot (SpotID) or at explicit X/Y."""
    spot = _int(m.get("SpotID"))
    x, y = _text(m.get("X")), _text(m.get("Y"))
    if spot:
        info["pos"] = {"spot": spot}
    elif x is not None and y is not None:
        info["pos"] = {"x": float(x), "y": float(y)}
    return info


# ---------------------------------------------------------------------------
# Path finding + step synthesis
# ---------------------------------------------------------------------------


class QuestGraph:
    def __init__(
        self,
        events: dict[str, dict[str, Any]],
        triggers: dict[str, list[dict[str, Any]]],
    ) -> None:
        self.events = events
        self.triggers = triggers
        self.preds: dict[str, list[tuple[str, dict[str, Any]]]] = {}
        for eid, ev in events.items():
            for target, edge in ev["edges"]:
                self.preds.setdefault(target, []).append((eid, edge))
        self.updates: dict[int, list[tuple[int, str]]] = {}
        for eid, ev in events.items():
            for act in ev["actions"]:
                if act["type"] == "quest":
                    self.updates.setdefault(act["questID"], []).append(
                        (act["phase"], eid)
                    )

    def find_path(
        self, target: str, quest_id: int, phase: int
    ) -> tuple[dict[str, Any] | None, list[tuple[str, dict[str, Any] | None]]]:
        """Cheapest trigger + forward path [(event id, edge into it)] to target.

        Reverse Dijkstra: shared NPC hubs often reach an update through
        another quest's branch, so edges gated on other quests cost more.
        """
        parent: dict[str, tuple[str, dict[str, Any]]] = {target: ("", {})}
        dist: dict[str, int] = {target: 0}
        heap: list[tuple[int, int, str]] = [(0, 0, target)]
        done: set[str] = set()
        hits: list[tuple[int, int, int, str, dict[str, Any]]] = []
        orphans: list[tuple[int, str]] = []
        seq = 0
        while heap and len(done) < MAX_REVERSE_VISIT:
            cost, _tie, node = heapq.heappop(heap)
            if node in done:
                continue
            done.add(node)
            if hits and cost > hits[0][0]:
                break
            for info in self.triggers.get(node, []):
                seq += 1
                hits.append(
                    (cost, TRIGGER_PRIORITY.get(info["kind"], 9), seq, node, info)
                )
                hits.sort(key=lambda h: h[:3])
            preds = self.preds.get(node, [])
            if not preds and not self.triggers.get(node):
                orphans.append((cost, node))
            for prev, edge in preds:
                new_cost = cost + _edge_cost(edge, quest_id, phase)
                if prev in done or new_cost >= dist.get(prev, 1 << 30):
                    continue
                dist[prev] = new_cost
                parent[prev] = (node, edge)
                seq += 1
                heapq.heappush(heap, (new_cost, seq, prev))
        if hits:
            _d, _p, _s, start, trigger = hits[0]
        elif orphans:
            orphans.sort()
            start, trigger = orphans[0][1], {"kind": "event"}
        else:
            start, trigger = target, {"kind": "event"}

        path: list[tuple[str, dict[str, Any] | None]] = [(start, None)]
        node = start
        while node != target:
            nxt, edge = parent[node]
            path.append((nxt, edge))
            node = nxt
        return trigger, path

    def tail(self, target: str, visited: set[str]) -> list[str]:
        """Linear follow-up events after the update (closing lines, rewards)."""
        out: list[str] = []
        ev = self.events.get(target)
        while ev and len(out) < MAX_TAIL_EVENTS:
            nxt = next((t for t, e in ev["edges"] if e["kind"] == "next"), None)
            if not nxt or nxt in visited or nxt not in self.events:
                break
            nev = self.events[nxt]
            if nev["type"] in ("EventPrompt", "EventITime", "EventOpenMenu"):
                break
            if nev.get("branchScript") or any(
                e["kind"] == "branch" for _t, e in nev["edges"]
            ):
                break
            visited.add(nxt)
            out.append(nxt)
            ev = nev
        return out


def _edge_cost(edge: dict[str, Any], quest_id: int, phase: int) -> int:
    """Path cost; `phase` is the update this step performs (0 start, -1 done).

    A player doing step `phase` has the quest inactive (start) or active at
    phase-1 (advance). Routes that need some other quest state cost extra.
    """
    detour = 50
    cost = 1
    if quest_id in (edge.get("skipsNotComplete") or ()):
        cost += detour
    if edge.get("questPhase") and edge["questPhase"][0] == quest_id:
        idx = edge["questPhase"][1]
        if phase == 0:
            cost += detour if idx != -1 else 0
        elif phase > 0:
            cost += detour if idx != phase - 1 else 0
        elif idx == -1:
            cost += detour
    for cond in edge.get("conditions") or []:
        ctype = cond.get("type", "")
        if ctype in SELF_QUEST_CONDITION_TYPES or ctype == "QUEST_FLAGS":
            if cond.get("value1") != quest_id:
                cost += 20  # gated on another quest = detour
            elif not _self_condition_consistent(cond, phase):
                cost += detour
        elif ctype not in HIDDEN_CONDITION_TYPES:
            cost += 2
    return cost


def _self_condition_consistent(cond: dict[str, Any], phase: int) -> bool:
    ctype, value2 = cond.get("type"), cond.get("value2", 0)
    if cond.get("negate"):
        return True  # rare; don't guess
    if ctype == "QUEST_ACTIVE":
        return (value2 == 0) == (phase == 0)
    if ctype == "QUEST_PHASE":
        return phase != 0 and (phase < 0 or value2 == phase - 1)
    return True


RANDOM_BRANCH_SCRIPTS = {
    "branch_randomSplit",
    "branch_randomWeighted",
    "branch_randomSplitGender",
}
MAX_SESSION_EVENTS = 80
MAX_SESSION_OUTCOMES = 400
MAX_PUZZLE_TALKS = 12
MAX_PUZZLE_STATES = 3000

FlagState = tuple[tuple[str, int], ...]


def _uses_quest_flags(
    graph: "QuestGraph", path: list[tuple[str, dict[str, Any] | None]], quest_id: int
) -> bool:
    """True when reaching this update depends on the quest's own flags."""

    def gated(conds: list[dict[str, Any]]) -> bool:
        return any(
            c.get("type") == "QUEST_FLAGS" and c.get("value1") == quest_id
            for c in conds
        )

    return any(
        gated((edge or {}).get("conditions") or [])
        or gated(graph.events.get(eid, {}).get("conditions") or [])
        for eid, edge in path
    )


class FlagPuzzle:
    """Plan a step that takes several conversations gated on quest flags.

    Some steps are small state machines over the quest's flag map (Act 12's
    card reactor: a random first card from one NPC, then a fixed insertion
    order at another). Each conversation is simulated against a flag state:
    the player picks prompt answers, unknown conditions are assumed
    satisfiable, and random branches are enumerated. A breadth-first search
    over flag states then finds the shortest series of conversations that
    reaches the phase update — one plan per random outcome.
    """

    def __init__(self, graph: "QuestGraph", quest_id: int, phase: int) -> None:
        self.graph = graph
        self.events = graph.events
        self.qid = quest_id
        self.phase = phase
        self._memo: dict[tuple[str, FlagState], list[dict[str, Any]]] = {}

    # -- conditions -------------------------------------------------------

    def _flags_match(self, cond: dict[str, Any], state: dict[str, int]) -> bool:
        mode = cond.get("compareMode") or "EQUAL"
        for flag, want in (cond.get("flags") or {}).items():
            have = state.get(flag)
            if mode == "EXISTS":
                ok = have is not None
            elif mode == "LT_OR_NAN":
                ok = have is None or have < want
            elif mode == "LT":
                ok = have is not None and have < want
            elif mode == "GTE":
                ok = have is not None and have >= want
            else:
                ok = have == want
            if not ok:
                return False
        return True

    def _check(self, cond: dict[str, Any], state: dict[str, int]) -> bool | None:
        ctype = cond.get("type")
        result: bool | None = None
        if ctype == "QUEST_FLAGS" and cond.get("value1") == self.qid:
            need_phase = cond.get("value2", -1)
            current = self.phase - 1 if self.phase > 0 else None
            if need_phase is not None and need_phase > -1 and current is not None:
                result = need_phase == current and self._flags_match(cond, state)
            else:
                result = self._flags_match(cond, state)
        elif ctype in SELF_QUEST_CONDITION_TYPES and cond.get("value1") == self.qid:
            if ctype == "QUEST_COMPLETE":
                result = cond.get("value2", 0) == 0
            elif ctype == "QUEST_PHASE" and self.phase < 0:
                result = None
            else:
                result = _self_condition_consistent({**cond, "negate": False}, self.phase)
        elif ctype == "ITEM":
            # Assume the player carries what the step asks for.
            result = cond.get("compareMode") not in ("LT", "LT_OR_NAN")
        if result is not None and cond.get("negate"):
            result = not result
        return result

    def _check_all(
        self, conds: list[dict[str, Any]], state: dict[str, int]
    ) -> bool | None:
        result: bool | None = True
        for cond in conds:
            r = self._check(cond, state)
            if r is False:
                return False
            if r is None:
                result = None
        return result

    # -- one conversation -------------------------------------------------

    def talk(self, root: str, state: FlagState) -> list[dict[str, Any]]:
        """Every way one conversation from `root` can end, given `state`."""
        key = (root, state)
        if key not in self._memo:
            out: list[dict[str, Any]] = []
            self._walk(root, dict(state), [], [], [], frozenset(), out)
            self._memo[key] = out
        return self._memo[key]

    def _walk(
        self,
        eid: str,
        state: dict[str, int],
        choices: list[int],
        rolls: list[tuple[str, int]],
        acts: list[dict[str, Any]],
        seen: frozenset[str],
        out: list[dict[str, Any]],
    ) -> None:
        if len(out) >= MAX_SESSION_OUTCOMES:
            return
        ev = self.events.get(eid)
        if ev is None or eid in seen or len(seen) >= MAX_SESSION_EVENTS:
            out.append(self._outcome(state, choices, rolls, acts, None))
            return
        seen = seen | {eid}
        state, acts = dict(state), list(acts)
        for act in ev["actions"]:
            if act.get("questID") == self.qid and act["type"] in ("quest", "questFlags"):
                _apply_flags(state, act)
                if act["type"] == "quest" and act["phase"] == self.phase:
                    out.append(self._outcome(state, choices, rolls, acts, eid))
                    return
            elif act["type"] not in ("quest", "questFlags", "spawn", "zone"):
                acts.append(act)

        def go(target: str, **kw: Any) -> None:
            self._walk(
                target,
                state,
                kw.get("choices", choices),
                kw.get("rolls", rolls),
                acts,
                seen,
                out,
            )

        edges = ev["edges"]
        options: dict[int | None, list[tuple[str, dict[str, Any]]]] = {}
        for target, edge in edges:
            if edge["kind"] == "choice":
                options.setdefault(edge.get("choice"), []).append((target, edge))
        if options:
            for msg, rows in options.items():
                self._ordered(rows, state, lambda t: go(t, choices=choices + [msg or 0]))
            return

        branches = [(t, e) for t, e in edges if e["kind"] == "branch"]
        default = next((t for t, e in edges if e["kind"] == "next"), None)
        if branches:
            script = ev.get("branchScript")
            if script in RANDOM_BRANCH_SCRIPTS:
                for idx, (target, _edge) in enumerate(branches):
                    go(target, rolls=rolls + [(eid, idx)])
                return
            pinned = [
                t
                for t, e in branches + [(default, {"questPhase": [self.qid, -1]})]
                if t
                and (e.get("questPhase") or [None])[0] == self.qid
                and e["questPhase"][1] == (self.phase - 1 if self.phase > 0 else -1)
            ]
            if script == "branch_questPhase" and pinned:
                go(pinned[0])
                return
            if self._ordered(branches, state, go):
                return
        follow = default or next(
            (t for t, e in edges if e["kind"] in ("start", "defeat", "queue")), None
        )
        if follow:
            go(follow)
        else:
            out.append(self._outcome(state, choices, rolls, acts, None))

    def _ordered(
        self,
        rows: list[tuple[str, dict[str, Any]]],
        state: dict[str, int],
        go: Callable[[str], None],
    ) -> bool:
        """Evaluate branches in order; True if one is certainly taken."""
        for target, edge in rows:
            ok = self._check_all(edge.get("conditions") or [], state)
            if ok is False:
                continue
            go(target)
            if ok is True:
                return True
        return False

    @staticmethod
    def _outcome(
        state: dict[str, int],
        choices: list[int],
        rolls: list[tuple[str, int]],
        acts: list[dict[str, Any]],
        reached: str | None,
    ) -> dict[str, Any]:
        return {
            "state": tuple(sorted(state.items())),
            "choices": choices,
            "rolls": rolls,
            "actions": acts,
            "reached": reached,
        }

    # -- search over conversations ---------------------------------------

    def solve(
        self, roots: list[tuple[str, dict[str, Any]]], state: FlagState = (), depth: int = 1
    ) -> list[list[tuple[tuple[str, dict[str, Any]], dict[str, Any]]]] | None:
        """Shortest talk sequence per random outcome, or None if unsolved.

        Returns plans; each plan is [(root, outcome), ...] ending in the
        conversation that performs the phase update. `depth` caps random
        forks per plan (1: after the roll, never plan to re-roll).
        """
        queue: deque[tuple[FlagState, list[Any]]] = deque([(state, [])])
        visited = {state}
        while queue and len(visited) < MAX_PUZZLE_STATES:
            current, plan = queue.popleft()
            if len(plan) >= MAX_PUZZLE_TALKS:
                continue
            for root in roots:
                outcomes = self.talk(root[0], current)
                if len({o["state"] for o in outcomes if o["rolls"]}) <= 1:
                    # Random flavour lines that end in the same state aren't forks.
                    outcomes = [{**o, "rolls": []} for o in outcomes]
                for outcome in outcomes:
                    if outcome["reached"] and not outcome["rolls"]:
                        return [plan + [(root, outcome)]]
                worlds: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
                for outcome in outcomes:
                    if outcome["rolls"]:
                        worlds.setdefault(tuple(outcome["rolls"]), []).append(outcome)
                if len(worlds) > 1 and depth > 0:
                    plans = self._solve_worlds(root, worlds, plan, roots, depth)
                    if plans:
                        return plans
                for outcome in outcomes:
                    if outcome["rolls"] or outcome["state"] in visited:
                        continue
                    visited.add(outcome["state"])
                    queue.append((outcome["state"], plan + [(root, outcome)]))
        return None

    def _solve_worlds(self, root, worlds, plan, roots, depth):
        plans = []
        for options in worlds.values():
            solved = None
            for outcome in options:
                if outcome["reached"]:
                    solved = [plan + [(root, outcome)]]
                    break
                if outcome["state"] == ():
                    continue
                rest = self.solve(roots, outcome["state"], depth - 1)
                if rest:
                    solved = [plan + [(root, outcome)] + tail for tail in rest]
                    break
            if solved is None:
                return None
            plans.extend(solved)
        return plans


def _apply_flags(state: dict[str, int], act: dict[str, Any]) -> None:
    mode = act.get("mode") or "UPDATE"
    for flag, value in (act.get("flags") or {}).items():
        if mode == "INCREMENT":
            state[flag] = state.get(flag, 0) + value
        elif mode == "DECREMENT":
            state[flag] = state.get(flag, 0) - value
        else:
            state[flag] = value


def _visible_condition(cond: dict[str, Any], quest_id: int) -> bool:
    ctype = cond.get("type", "")
    if ctype in HIDDEN_CONDITION_TYPES:
        return False
    if ctype in SELF_QUEST_CONDITION_TYPES and cond.get("value1") == quest_id:
        return False
    if ctype == "QUEST_COMPLETE" and cond.get("value2", 0) == 0:
        # "has not completed X" — repeat guards, not a requirement.
        return False
    return True


def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out = []
    for row in rows:
        key = json.dumps(row, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(row)
    return out


def build_step(
    graph: QuestGraph,
    quest_id: int,
    phase: int,
    target: str,
    *,
    messages: dict[int, list[str]],
    spawn_data: SpawnData,
) -> dict[str, Any]:
    trigger, path = graph.find_path(target, quest_id, phase)
    visited = {eid for eid, _e in path}
    tail = graph.tail(target, visited)
    events = graph.events

    choices: list[str] = []
    conditions: list[dict[str, Any]] = []
    dialogue: list[dict[str, str]] = []
    actions: list[dict[str, Any]] = []
    fights: list[dict[str, Any]] = []

    def say(who: str, mid: int | None) -> None:
        for page in messages.get(mid or 0, []):
            line = {"who": who, "text": page}
            # Prompts usually repeat the NPC line that precedes them.
            if len(dialogue) < MAX_DIALOGUE_LINES and (
                not dialogue or dialogue[-1] != line
            ):
                dialogue.append(line)

    def visit(eid: str) -> None:
        ev = events.get(eid)
        if not ev:
            return
        conditions.extend(ev["conditions"])
        for mid in ev["messages"]:
            say("npc", mid)
        if ev.get("message"):
            if ev["type"] == "EventMultitalk":
                dialogue.append({"who": "scene", "text": "(conversation scene)"})
            else:
                say("npc", ev["message"])
        if ev.get("prompt"):
            say("npc", ev["prompt"])
        if ev["type"] == "EventPlayScene":
            dialogue.append({"who": "scene", "text": "(cutscene)"})
        for mid in ev["sysMessages"]:
            say("system", mid)
        for act in ev["actions"]:
            if act["type"] == "quest" and act["questID"] == quest_id:
                continue
            if act["type"] in ("spawn", "questFlags"):
                continue
            if act["type"] == "demons":
                # id 0 = "the demon you chose" placeholders
                act = {
                    **act,
                    "add": [d for d in act["add"] if d["id"]],
                    "remove": [d for d in act["remove"] if d["id"]],
                }
                if not act["add"] and not act["remove"]:
                    actions.append({"type": "demons", "add": [], "remove": [], "chosen": True})
                    continue
            actions.append(act)

    for idx, (eid, edge) in enumerate(path):
        if edge:
            conditions.extend(edge.get("conditions") or [])
            if edge["kind"] == "choice":
                text = (messages.get(edge.get("choice") or 0) or [""])[0]
                if text:
                    choices.append(text)
                    dialogue.append({"who": "you", "text": text})
            elif edge["kind"] == "defeat":
                prev_zone = events.get(path[idx - 1][0], {}).get("zone")
                enemies = _resolve_spawn(edge.get("spawn"), prev_zone, spawn_data)
                fights.append({"zoneID": prev_zone, "enemies": enemies})
                dialogue.append({"who": "scene", "text": "(battle)"})
        visit(eid)
    for eid in tail:
        visit(eid)

    if trigger.get("kind") == "defeat":
        fights.insert(
            0,
            {
                "zoneID": trigger.get("zoneID"),
                "enemies": _resolve_spawn(
                    trigger.get("spawn"), trigger.get("zoneID"), spawn_data
                ),
            },
        )

    step: dict[str, Any] = {
        "phase": phase,
        "eventId": target,
        "file": events.get(target, {}).get("file"),
        "trigger": {k: v for k, v in trigger.items() if k != "spawn"},
    }
    if step["trigger"].get("zoneID") is None:
        step["trigger"]["zoneID"] = events.get(path[0][0], {}).get("zone")
    granted = {
        a["id"]
        for a in actions
        if a["type"] == "flag" and a["flagType"] == "VALUABLE" and not a["remove"]
    }
    visible = [
        c
        for c in _dedupe(conditions)
        if _visible_condition(c, quest_id)
        # "not holding X" right before getting X is a double-pickup guard
        and not (c["type"] == "VALUABLE" and c.get("value2", 0) == 0 and c.get("value1") in granted)
    ]
    if visible:
        step["conditions"] = visible
    if choices:
        step["choices"] = choices
    if fights:
        step["fights"] = fights
    if actions:
        step["actions"] = _dedupe(actions)
    if dialogue:
        step["dialogue"] = dialogue
    if _uses_quest_flags(graph, path, quest_id):
        step["_flagGated"] = True
    return step


def _resolve_spawn(
    spawn: dict[str, list[int]] | None,
    zone_id: int | None,
    spawn_data: SpawnData,
) -> list[dict[str, int]]:
    """Spawn refs → enemy types; one row per type (max count seen)."""
    zone = spawn_data.get(zone_id or 0) or {"groups": {}, "locations": {}}
    group_ids = list((spawn or {}).get("groups") or [])
    for loc in (spawn or {}).get("locations") or []:
        group_ids.extend(zone["locations"].get(loc, []))
    counts: dict[int, int] = {}
    for gid in group_ids:
        for enemy in zone["groups"].get(gid, []):
            counts[enemy["type"]] = max(counts.get(enemy["type"], 0), enemy["count"])
    return [{"type": t, "count": c} for t, c in counts.items()]


def _step_signature(step: dict[str, Any]) -> str:
    return json.dumps(
        {
            "t": step.get("trigger"),
            "c": step.get("choices"),
            "a": step.get("actions"),
            "f": step.get("fights"),
            "s": step.get("sequence"),
        },
        sort_keys=True,
    )


MAX_PUZZLE_PLANS = 6


def _solve_flag_puzzle(
    graph: QuestGraph,
    quest_id: int,
    phase: int,
    rows: list[dict[str, Any]],
    *,
    messages: dict[int, list[str]],
    spawn_data: SpawnData,
) -> list[dict[str, Any]] | None:
    """Replace flag-gated variants with full talk sequences (see FlagPuzzle)."""
    targets = [eid for p, eid in graph.updates.get(quest_id, []) if p == phase]
    setters = [
        eid
        for eid, ev in graph.events.items()
        if any(
            a.get("questID") == quest_id and a.get("flags") for a in ev["actions"]
        )
    ]
    roots: dict[str, dict[str, Any]] = {}
    for eid in targets + setters:
        trigger, path = graph.find_path(eid, quest_id, phase)
        if trigger and trigger.get("kind") != "event":
            roots.setdefault(path[0][0], trigger)
    plans = FlagPuzzle(graph, quest_id, phase).solve(list(roots.items()))
    if not plans or all(len(plan) < 2 for plan in plans):
        return None  # one conversation: the plain route already says it all

    def text(mid: int) -> str:
        return (messages.get(mid) or [f"(option {mid})"])[0]

    steps: list[dict[str, Any]] = []
    for plan in plans[:MAX_PUZZLE_PLANS]:
        final = plan[-1][1]["reached"]
        step = next((dict(r) for r in rows if r["eventId"] == final), None) or build_step(
            graph, quest_id, phase, final, messages=messages, spawn_data=spawn_data
        )
        step.pop("_flagGated", None)
        sequence = []
        for (_root, trigger), outcome in plan:
            talk: dict[str, Any] = {
                "trigger": {k: v for k, v in trigger.items() if k != "spawn"},
                "choices": [text(m) for m in outcome["choices"] if m],
            }
            items = [
                item for a in outcome["actions"] if a["type"] == "items" for item in a["items"]
            ]
            if items:
                talk["items"] = items
            if outcome["rolls"]:
                talk["random"] = True
            sequence.append(talk)
        step["sequence"] = sequence
        steps.append(step)
    return steps


def _quest_data_prerequisites(quest: dict[str, Any]) -> set[int]:
    return {
        int(clause["value1"])
        for group in quest.get("startConditions") or []
        for clause in group.get("clauses") or []
        if clause.get("type") == "QUEST_COMPLETE" and clause.get("value2") == 1
    }


def build_quest_guide(
    graph: QuestGraph,
    quest: dict[str, Any],
    *,
    messages: dict[int, list[str]],
    spawn_data: SpawnData,
) -> dict[str, Any] | None:
    qid = int(quest["id"])
    updates = graph.updates.get(qid, [])
    if not updates:
        return None
    by_phase: dict[int, list[dict[str, Any]]] = {}
    for phase, eid in sorted(set(updates), key=lambda u: (u[0], u[1])):
        if phase < -1:
            continue  # abandon / reset hooks
        rows = by_phase.setdefault(phase, [])
        if len(rows) >= MAX_VARIANTS_PER_PHASE:
            continue
        step = build_step(
            graph, qid, phase, eid, messages=messages, spawn_data=spawn_data
        )
        if all(_step_signature(step) != _step_signature(r) for r in rows):
            rows.append(step)

    for phase, rows in by_phase.items():
        if any(r.get("_flagGated") for r in rows):
            solved = _solve_flag_puzzle(
                graph, qid, phase, rows, messages=messages, spawn_data=spawn_data
            )
            if solved:
                by_phase[phase] = solved
        for row in by_phase[phase]:
            row.pop("_flagGated", None)

    start = by_phase.get(0, [])
    complete = by_phase.get(-1, [])
    advance = [by_phase[p] for p in sorted(by_phase) if p > 0]

    prereqs = _quest_data_prerequisites(quest)
    level_min: int | None = None
    for cond_group in quest.get("startConditions") or []:
        for clause in cond_group.get("clauses") or []:
            if clause.get("type") == "LEVEL" and clause.get("value1"):
                level_min = max(level_min or 0, int(clause["value1"]))
    for step in start:
        for cond in step.get("conditions", []):
            if cond["type"] == "QUEST_COMPLETE" and cond.get("value2") == 1:
                prereqs.add(int(cond["value1"]))
    prereqs.discard(qid)

    guide: dict[str, Any] = {
        "id": qid,
        "start": start,
        "phases": advance,
        "complete": complete,
    }
    if prereqs:
        guide["prerequisites"] = sorted(prereqs)
    if level_min:
        guide["levelMin"] = level_min
    return guide


def build_guides_payload(
    *,
    quests: list[dict[str, Any]],
    events: dict[str, dict[str, Any]],
    triggers: dict[str, list[dict[str, Any]]],
    spawn_data: SpawnData,
    npc_names: dict[int, str],
    zone_names: dict[int, str],
    messages: dict[int, list[str]],
    locate: Callable[[dict[str, Any]], list[int] | None] | None = None,
) -> dict[str, Any]:
    """`locate` maps a trigger (zoneID + pos) to its in-game grid [x, y]."""
    graph = QuestGraph(events, triggers)
    by_id: dict[str, Any] = {}
    for quest in quests:
        guide = build_quest_guide(
            graph, quest, messages=messages, spawn_data=spawn_data
        )
        if guide:
            by_id[str(quest["id"])] = guide

    for guide in by_id.values():
        for step in _iter_steps(guide):
            for trig in [step["trigger"]] + [t["trigger"] for t in step.get("sequence", [])]:
                grid = locate(trig) if locate and trig.get("pos") else None
                trig.pop("pos", None)
                trig.pop("dynamicMap", None)
                if grid:
                    trig["grid"] = grid

    # Quests without event scripts still list prerequisites in QuestData.
    unlocks: dict[int, set[int]] = {}
    for quest in quests:
        qid = str(quest["id"])
        pres = (
            by_id[qid].get("prerequisites", [])
            if qid in by_id
            else sorted(_quest_data_prerequisites(quest) - {int(qid)})
        )
        for pre in pres:
            unlocks.setdefault(pre, set()).add(int(qid))
    for pre, ids in unlocks.items():
        if str(pre) in by_id:
            by_id[str(pre)]["unlocks"] = sorted(ids)

    used_npcs: set[int] = set()
    used_zones: set[int] = set()
    for guide in by_id.values():
        for step in _iter_steps(guide):
            trig = step["trigger"]
            if trig.get("npcId"):
                used_npcs.add(trig["npcId"])
            if trig.get("zoneID"):
                used_zones.add(trig["zoneID"])
            for fight in step.get("fights", []):
                if fight.get("zoneID"):
                    used_zones.add(fight["zoneID"])
            for act in step.get("actions", []):
                if act.get("zoneID"):
                    used_zones.add(act["zoneID"])
    for quest in quests:
        if quest.get("zoneID"):
            used_zones.add(int(quest["zoneID"]))

    steps = [s for g in by_id.values() for s in _iter_steps(g)]
    return {
        "source": "datastore events/*.xml + zones/*.xml; BinaryData hNPCData, ZoneData, CEventMessageData{,2}",
        "generatedAt": _now_iso(),
        "note": (
            "Walkthrough steps derived from the event graph: each step is the "
            "path from a trigger (NPC talk, object, area, spawn defeat) to an "
            "ActionUpdateQuest. Dialogue is client CEventMessage text."
        ),
        "stats": {
            "quests": len(by_id),
            "steps": len(steps),
            "stepsWithNpcTrigger": sum(1 for s in steps if s["trigger"]["kind"] == "npc"),
            "stepsWithDialogue": sum(1 for s in steps if s.get("dialogue")),
        },
        "npcNames": {str(k): npc_names[k] for k in sorted(used_npcs) if k in npc_names},
        "zoneNames": {str(k): zone_names[k] for k in sorted(used_zones) if k in zone_names},
        "byQuestId": by_id,
    }


def _iter_steps(guide: dict[str, Any]) -> Iterable[dict[str, Any]]:
    yield from guide.get("start", [])
    for variants in guide.get("phases", []):
        yield from variants
    yield from guide.get("complete", [])


def _default_runtime() -> Path:
    root = _smt_root()
    for candidate in (root / "comp_hack" / "runtime", _server_root() / "deploy" / "data"):
        if (candidate / "datastore" / "BinaryData" / "Shield" / "hNPCData.sbin").is_file():
            return candidate
    return root / "comp_hack" / "runtime"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument(
        "--datastore",
        type=Path,
        default=_smt_root() / "comp_hack" / "datastore",
        help="Datastore with events/ and zones/ (default: comp_hack/datastore)",
    )
    parser.add_argument(
        "--runtime",
        type=Path,
        default=None,
        help="Runtime root with datastore/BinaryData (default: comp_hack/runtime)",
    )
    parser.add_argument(
        "--tables-dir",
        type=Path,
        default=None,
        help="Pre-converted <table>.xml files (hNPCData, ZoneData, CEventMessageData*, CMapData, DynamicMapData, spot files); skips comp tools",
    )
    parser.add_argument(
        "--quests", type=Path, default=_wiki_dir() / "quests.json"
    )
    parser.add_argument(
        "-o", "--output", type=Path, default=_wiki_dir() / "quest-guides.json"
    )
    parser.add_argument("--quest", type=int, help="Print one quest's guide and exit")
    args = parser.parse_args(argv)

    quests = json.loads(args.quests.read_text(encoding="utf-8"))["quests"]
    events = load_events(args.datastore)
    triggers, spawn_data = load_zone_triggers(args.datastore)
    with GameTables(args.runtime or _default_runtime(), args.tables_dir) as tables:
        npc_names, messages = load_text_tables(tables)
        grid = MapGrid(tables)
        if not messages:
            print(
                "warning: no event text loaded "
                f"({'; '.join(tables.errors) or 'tables missing'}); "
                "guides will lack dialogue"
            )
        payload = build_guides_payload(
            quests=quests,
            events=events,
            triggers=triggers,
            spawn_data=spawn_data,
            npc_names=npc_names,
            zone_names={zid: z["name"] for zid, z in grid.zones.items()},
            messages=messages,
            locate=grid.locate,
        )
    if args.quest is not None:
        print(
            json.dumps(
                payload["byQuestId"].get(str(args.quest)), ensure_ascii=False, indent=1
            )
        )
        return 0
    _atomic_write_json(args.output, payload)
    print(f"wrote {args.output} — {json.dumps(payload['stats'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
