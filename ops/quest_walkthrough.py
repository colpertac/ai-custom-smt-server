"""Join quests.json + quest-npcs.json into player-facing walkthroughs (16F).

Loads exported wiki catalogs (no BinaryData decrypt) and emits a structured
guide for one quest — markdown for humans or JSON for Ask retrieval.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

QDETAIL_RX = re.compile(r"<qdetail:([^>]+)>\n?")

def _load_zone_names() -> dict[int, str]:
    """Load shared zone id → name map from website/content/wiki/zones.json."""
    path = _default_wiki_dir() / "zones.json"
    if not path.is_file():
        return {20101: "Home III", 20107: "Cathedral of Shadows"}
    raw = _load_json(path).get("byZoneId") or {}
    return {int(k): v for k, v in raw.items()}


ZONE_NAMES: dict[int, str] = {}


def _server_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _default_wiki_dir() -> Path:
    return _server_root() / "website" / "content" / "wiki"


def _ensure_zone_names() -> dict[int, str]:
    global ZONE_NAMES
    if not ZONE_NAMES:
        ZONE_NAMES = _load_zone_names()
    return ZONE_NAMES


def _zone_label(zone_id: int | None) -> str | None:
    if zone_id is None:
        return None
    return _ensure_zone_names().get(zone_id)


def _format_zone(zone_id: int | None) -> str:
    if zone_id is None:
        return "unknown zone"
    name = _zone_label(zone_id)
    if name:
        return f"{name} ({zone_id})"
    return str(zone_id)


def _parse_line(raw: str) -> dict[str, Any]:
    """Split quest journal line text from optional <qdetail:…> image refs."""
    image_refs: list[str] = []
    text = raw or ""
    while True:
        m = QDETAIL_RX.search(text)
        if not m:
            break
        image_refs.append(m.group(1))
        text = text[: m.start()] + text[m.end() :]
    text = text.strip()
    return {"text": text, "imageRefs": image_refs}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_catalogs(
    quests_path: Path | None = None,
    quest_npcs_path: Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    wiki = _default_wiki_dir()
    quests_path = quests_path or (wiki / "quests.json")
    quest_npcs_path = quest_npcs_path or (wiki / "quest-npcs.json")
    return _load_json(quests_path), _load_json(quest_npcs_path)


def _find_quest(quests_payload: dict[str, Any], quest_id: int) -> dict[str, Any] | None:
    return next((q for q in quests_payload.get("quests", []) if q["id"] == quest_id), None)


def _npc_links_for_quest(
    quest_npcs_payload: dict[str, Any], quest_id: int
) -> dict[str, list[dict[str, Any]]]:
    by_id = quest_npcs_payload.get("byQuestId") or {}
    key = str(quest_id)
    raw = by_id.get(key) or by_id.get(quest_id) or {}
    return {
        "start": list(raw.get("start") or []),
        "advance": sorted(raw.get("advance") or [], key=lambda r: r.get("phase") or 0),
        "complete": list(raw.get("complete") or []),
    }


def _enrich_npc_row(row: dict[str, Any]) -> dict[str, Any]:
    zone_id = row.get("zoneID")
    return {
        **row,
        "zoneName": _zone_label(zone_id),
        "zoneLabel": _format_zone(zone_id),
    }


def _advance_by_phase(links: dict[str, list[dict[str, Any]]]) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for row in links.get("advance") or []:
        phase = row.get("phase")
        if isinstance(phase, int) and phase > 0:
            out[phase] = _enrich_npc_row(row)
    return out


def build_quest_guide(
    quest_id: int,
    quests_path: Path | None = None,
    quest_npcs_path: Path | None = None,
) -> dict[str, Any]:
    """Join catalogs for one quest into a structured walkthrough dict."""
    quests_payload, quest_npcs_payload = load_catalogs(quests_path, quest_npcs_path)
    quest = _find_quest(quests_payload, quest_id)
    if quest is None:
        raise KeyError(f"Quest {quest_id} not found in quests catalog")

    links = _npc_links_for_quest(quest_npcs_payload, quest_id)
    advance_by_phase = _advance_by_phase(links)
    zone_id = quest.get("zoneID")
    coords = quest.get("coordinates") or {}

    start_rows = [_enrich_npc_row(r) for r in links["start"]]
    complete_rows = [_enrich_npc_row(r) for r in links["complete"]]

    giver_name = quest.get("npc")
    giver_npc_id = start_rows[0].get("npcId") if start_rows else None
    if start_rows and not giver_name:
        giver_name = start_rows[0].get("npcName")

    steps: list[dict[str, Any]] = []
    raw_lines = quest.get("lines") or []
    for idx, raw_line in enumerate(raw_lines, start=1):
        parsed = _parse_line(raw_line)
        npc_hint = advance_by_phase.get(idx)
        step: dict[str, Any] = {
            "stepNumber": idx,
            "phaseNumber": idx,
            "journalText": parsed["text"],
            "imageRefs": parsed["imageRefs"],
        }
        if npc_hint:
            step["advanceNpc"] = {
                "npcId": npc_hint.get("npcId"),
                "npcName": npc_hint.get("npcName"),
                "zoneID": npc_hint.get("zoneID"),
                "zoneName": npc_hint.get("zoneName"),
                "zoneLabel": npc_hint.get("zoneLabel"),
                "eventId": npc_hint.get("eventId"),
                "sourceFile": npc_hint.get("sourceFile"),
            }
        steps.append(step)

    return {
        "id": quest_id,
        "title": quest.get("title"),
        "type": quest.get("type"),
        "giver": {
            "name": giver_name,
            "npcId": giver_npc_id,
            "zoneID": zone_id,
            "zoneName": _zone_label(zone_id),
            "zoneLabel": _format_zone(zone_id),
            "coordinates": coords if coords.get("x", -1) >= 0 else None,
        },
        "zone": {
            "id": zone_id,
            "name": _zone_label(zone_id),
            "label": _format_zone(zone_id),
        },
        "npcs": {
            "start": start_rows,
            "advance": [_enrich_npc_row(r) for r in links["advance"]],
            "complete": complete_rows,
        },
        "phases": quest.get("phases") or [],
        "steps": steps,
        "sources": {
            "questsJson": str(quests_path or (_default_wiki_dir() / "quests.json")),
            "questNpcsJson": str(
                quest_npcs_path or (_default_wiki_dir() / "quest-npcs.json")
            ),
            "questsGeneratedAt": quests_payload.get("generatedAt"),
            "questNpcsGeneratedAt": quest_npcs_payload.get("generatedAt"),
        },
    }


def _npc_bullet(row: dict[str, Any]) -> str:
    name = row.get("npcName") or "Unknown NPC"
    npc_id = row.get("npcId")
    zone = row.get("zoneLabel") or _format_zone(row.get("zoneID"))
    event_id = row.get("eventId")
    parts = [f"**{name}**"]
    if npc_id is not None:
        parts.append(f"(NPC {npc_id})")
    parts.append(f"— {zone}")
    line = " ".join(parts)
    if event_id:
        line += f" · event `{event_id}`"
    return line


def format_markdown(guide: dict[str, Any], *, reviewed: bool = False) -> str:
    """Render a structured guide as markdown."""
    lines: list[str] = []
    qid = guide["id"]
    title = guide.get("title") or f"Quest {qid}"
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"Quest ID **{qid}** · type `{guide.get('type')}`")

    giver = guide.get("giver") or {}
    if giver.get("name"):
        coord = giver.get("coordinates")
        coord_note = ""
        if coord:
            coord_note = f" @ ({coord.get('x')}, {coord.get('y')})"
        lines.append(
            f"Start in **{giver.get('zoneLabel', 'unknown')}** with "
            f"**{giver['name']}**"
            + (f" (NPC {giver.get('npcId')})" if giver.get("npcId") else "")
            + coord_note
            + "."
        )
    lines.append("")

    npcs = guide.get("npcs") or {}
    if npcs.get("start") or npcs.get("advance") or npcs.get("complete"):
        lines.append("## NPCs (from event graph)")
        lines.append("")
        if npcs.get("start"):
            lines.append("**Start**")
            for row in npcs["start"]:
                lines.append(f"- {_npc_bullet(row)}")
            lines.append("")
        if npcs.get("advance"):
            lines.append("**Advance (by phase)**")
            for row in npcs["advance"]:
                phase = row.get("phase")
                phase_note = f"phase {phase}: " if phase is not None else ""
                lines.append(f"- {phase_note}{_npc_bullet(row)}")
            lines.append("")
        if npcs.get("complete"):
            lines.append("**Complete**")
            for row in npcs["complete"]:
                lines.append(f"- {_npc_bullet(row)}")
            lines.append("")

    steps = guide.get("steps") or []
    if steps:
        lines.append("## Steps")
        lines.append("")
        for step in steps:
            n = step.get("stepNumber")
            text = step.get("journalText") or ""
            lines.append(f"{n}. {text.replace(chr(10), ' ')}")
            refs = step.get("imageRefs") or []
            if refs:
                lines.append(f"   - *(Journal image: {', '.join(refs)})*")
            adv = step.get("advanceNpc")
            if adv and adv.get("npcName"):
                lines.append(
                    f"   - Talk to **{adv['npcName']}** (NPC {adv.get('npcId')}) "
                    f"in {adv.get('zoneLabel', 'unknown zone')}."
                )
            lines.append("")

    phases = guide.get("phases") or []
    if phases:
        all_dialogue = all(not (p.get("requirements") or []) for p in phases)
        if all_dialogue:
            lines.append(
                "> All phases are dialogue-driven (no kill/collect counters in "
                "QuestData). Progress by talking to the NPCs above."
            )
            lines.append("")

    sources = guide.get("sources") or {}
    lines.append("## Data sources")
    lines.append("")
    lines.append(
        f"- `quests.json` id {qid}"
        + (f" (generated {sources.get('questsGeneratedAt')})" if sources.get("questsGeneratedAt") else "")
    )
    lines.append(
        "- `quest-npcs.json` ActionUpdateQuest events"
        + (
            f" (generated {sources.get('questNpcsGeneratedAt')})"
            if sources.get("questNpcsGeneratedAt")
            else ""
        )
    )
    for row in (npcs.get("start") or []) + (npcs.get("advance") or []) + (npcs.get("complete") or []):
        if row.get("eventId"):
            src = row.get("sourceFile") or "events"
            lines.append(f"  - `{row['eventId']}` ({src})")

    if reviewed:
        lines.append("")
        lines.append(
            "*Reviewed player note — NPC display names from zone XML comments "
            "may be Japanese until CQuest/l10n export.*"
        )

    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Join quests.json + quest-npcs.json into a walkthrough"
    )
    parser.add_argument("--id", type=int, required=True, help="Quest ID")
    parser.add_argument(
        "--quests",
        type=Path,
        default=_default_wiki_dir() / "quests.json",
        help="Path to quests.json",
    )
    parser.add_argument(
        "--quest-npcs",
        type=Path,
        default=_default_wiki_dir() / "quest-npcs.json",
        help="Path to quest-npcs.json",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format (default: markdown)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Write output to PATH instead of stdout",
    )
    args = parser.parse_args(argv)

    try:
        guide = build_quest_guide(args.id, args.quests, args.quest_npcs)
    except KeyError as exc:
        print(str(exc))
        return 1

    if args.format == "json":
        text = json.dumps(guide, indent=2, ensure_ascii=False) + "\n"
    else:
        text = format_markdown(guide)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
