"""Export quest catalogs from QuestData + CQuestData BinaryData.

Writes website/content/wiki/quests.json (or runtime wiki dir) for 16F Ask
retrieval. Mirrors the decrypt/flatten flow in wiki_export.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from wiki_export import (
    _atomic_write_json,
    _find_bdpatch,
    _find_decrypt,
    _now_iso,
    _run,
    _safe_int,
)

QUEST_SOURCE = "BinaryData/Shield/{QuestData,CQuestData}.sbin"
PHASE_RX = re.compile(
    r"\{ phaseNumber: (\d+), requirementCount: (\d+), "
    r"((?:\{ type: \w+, objectID: \d+, objectCount: \d+ \},?\s*)+)\}"
)
REQ_RX = re.compile(
    r"\{ type: (\w+), objectID: (\d+), objectCount: (\d+) \}"
)
NEXT_RX = re.compile(
    r"\{ questID: (-?\d+), restrictionType: (-?\d+), restrictionValue: (-?\d+) \}"
)
LINE_RX = re.compile(r"\{([^}]*)\}")
CONDITION_CLAUSE_RX = re.compile(
    r"\{ type: (\w+), value1: (-?\d+), value2: (-?\d+) \}"
)
CONDITION_BLOCK_RX = re.compile(
    r"\{ clauseCount: (\d+), ((?:\{ type: \w+, value1: -?\d+, value2: -?\d+ \},?\s*)+)\}"
)


def _repo_wiki_dir() -> Path:
    return (
        Path(__file__).resolve().parent.parent / "website" / "content" / "wiki"
    )


def _parse_phase_requirements(block: str) -> list[dict[str, Any]]:
    reqs: list[dict[str, Any]] = []
    for m in REQ_RX.finditer(block or ""):
        req_type = m.group(1)
        object_id = int(m.group(2))
        object_count = int(m.group(3))
        if req_type == "NONE" and object_id == 0 and object_count == 0:
            continue
        reqs.append(
            {
                "type": req_type,
                "objectID": object_id,
                "objectCount": object_count,
            }
        )
    return reqs


def _parse_phases(raw: str) -> list[dict[str, Any]]:
    phases: list[dict[str, Any]] = []
    for m in PHASE_RX.finditer(raw or ""):
        phase_number = int(m.group(1))
        requirement_count = int(m.group(2))
        req_block = m.group(3)
        requirements = _parse_phase_requirements(req_block)
        if phase_number <= 0 and not requirements:
            continue
        phases.append(
            {
                "phaseNumber": phase_number,
                "requirementCount": requirement_count,
                "requirements": requirements,
            }
        )
    phases.sort(key=lambda p: p["phaseNumber"])
    return phases


def _parse_start_conditions(raw: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for m in CONDITION_BLOCK_RX.finditer(raw or ""):
        clause_count = int(m.group(1))
        clauses: list[dict[str, Any]] = []
        for cm in CONDITION_CLAUSE_RX.finditer(m.group(2)):
            ctype = cm.group(1)
            if ctype == "NONE":
                continue
            clauses.append(
                {
                    "type": ctype,
                    "value1": int(cm.group(2)),
                    "value2": int(cm.group(3)),
                }
            )
        if clause_count > 0 or clauses:
            blocks.append({"clauseCount": clause_count, "clauses": clauses})
    return blocks


def _load_cquest_rows(path: Path) -> dict[int, dict[str, str]]:
    """Parse CQuestData.tsv; rows may contain embedded newlines in ``lines``."""
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        return {}
    header, body = text.split("\n", 1)
    columns = [c for c in header.split("\t") if c]
    data_columns = columns[1:]
    max_split = max(len(data_columns) - 1, 0)
    rows: dict[int, dict[str, str]] = {}
    for qid_str, rest in re.findall(r"(?ms)^(\d+)\t(.*?)(?=^\d+\t|\Z)", body):
        fields = rest.split("\t", max_split)
        row: dict[str, str] = {"ID": qid_str}
        for i, col in enumerate(data_columns):
            row[col] = fields[i] if i < len(fields) else ""
        rows[int(qid_str)] = row
    return rows


def _parse_lines(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw or raw.lower() == "none":
        return []
    lines: list[str] = []
    for m in LINE_RX.finditer(raw):
        text = m.group(1).strip()
        if text and text not in lines:
            lines.append(text)
    if not lines and raw.startswith("{"):
        partial = raw.lstrip("{ ").strip()
        if partial:
            lines.append(partial)
    return lines


def _parse_next_quests(raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in NEXT_RX.finditer(raw or ""):
        quest_id = int(m.group(1))
        if quest_id <= 0:
            continue
        out.append(
            {
                "questID": quest_id,
                "restrictionType": int(m.group(2)),
                "restrictionValue": int(m.group(3)),
            }
        )
    return out


def build_quests_payload(workdir: Path) -> dict[str, Any]:
    """Assemble quests.json from flattened QuestData + CQuestData TSV files."""
    quest_rows: dict[int, dict[str, str]] = {}
    quest_path = workdir / "QuestData.tsv"
    if quest_path.is_file():
        with quest_path.open(newline="", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                qid = (row.get("ID") or "").strip()
                if qid.isdigit():
                    quest_rows[int(qid)] = row

    cquest_rows = _load_cquest_rows(workdir / "CQuestData.tsv")

    all_ids = sorted(set(quest_rows) | set(cquest_rows))
    quests: list[dict[str, Any]] = []
    for quest_id in all_ids:
        q = quest_rows.get(quest_id, {})
        c = cquest_rows.get(quest_id, {})
        phases = _parse_phases(q.get("phases") or "")
        entry: dict[str, Any] = {
            "id": quest_id,
            "title": (c.get("title") or "").strip() or None,
            "npc": (c.get("npc") or "").strip() or None,
            "zoneID": _safe_int(c.get("zoneID"), 0) or None,
            "coordinates": {
                "x": _safe_int(c.get("xCoordinate"), 0),
                "y": _safe_int(c.get("yCoordinate"), 0),
            },
            "lines": _parse_lines(c.get("lines") or ""),
            "type": (q.get("type") or "").strip() or None,
            "groupID": _safe_int(q.get("groupID"), 0),
            "episodeType": (q.get("episodeType") or "").strip() or None,
            "bonusEnabled": (q.get("bonusEnabled") or "").strip().lower() == "true",
            "startConditions": _parse_start_conditions(q.get("conditions") or ""),
            "restrictionText": (q.get("restrictionText") or "").strip() or None,
            "phaseCount": _safe_int(q.get("phaseCount"), len(phases)),
            "phases": phases,
            "nextQuests": _parse_next_quests(c.get("next") or ""),
        }
        if not phases and (q.get("phases") or "").strip():
            entry["phasesRaw"] = (q.get("phases") or "").strip()
        if not entry["lines"] and (c.get("lines") or "").strip():
            entry["linesRaw"] = (c.get("lines") or "").strip()
        quests.append(entry)

    return {
        "source": QUEST_SOURCE,
        "generatedAt": _now_iso(),
        "note": (
            "Joined QuestData mechanics + CQuestData player-facing fields. "
            "Dialogue-only phases may show requirementCount 0 / NONE reqs; "
            "see lines or event XML for talk steps."
        ),
        "quests": quests,
    }


def _default_binarydata_root() -> Path:
    smt_root = Path(__file__).resolve().parent.parent.parent
    candidates = [
        smt_root / "comp_hack" / "runtime",
        Path(__file__).resolve().parent.parent / "deploy" / "data",
    ]
    for root in candidates:
        shield = root / "datastore" / "BinaryData" / "Shield"
        if (shield / "QuestData.sbin").is_file() and (
            shield / "CQuestData.sbin"
        ).is_file():
            return root
    return candidates[0]


def flatten_quest_tables(
    runtime: Path,
    workdir: Path,
    *,
    decrypt: Path | None = None,
    bdpatch: Path | None = None,
) -> tuple[bool, str]:
    runtime = Path(runtime)
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    decrypt = decrypt or _find_decrypt()
    bdpatch = bdpatch or _find_bdpatch()
    if decrypt is None or bdpatch is None:
        missing = []
        if decrypt is None:
            missing.append("comp_decrypt")
        if bdpatch is None:
            missing.append("comp_bdpatch")
        return False, f"missing {', '.join(missing)}"

    shield = runtime / "datastore" / "BinaryData" / "Shield"
    quest_sbin = shield / "QuestData.sbin"
    cquest_sbin = shield / "CQuestData.sbin"
    if not quest_sbin.is_file() or not cquest_sbin.is_file():
        return False, f"need QuestData + CQuestData under {shield}"

    for name, flatten_type in (
        ("QuestData", "quest"),
        ("CQuestData", "cquest"),
    ):
        sbin = shield / f"{name}.sbin"
        plain = workdir / f"{name}.plain.bin"
        tsv = workdir / f"{name}.tsv"
        ok, detail = _run([str(decrypt), str(sbin), str(plain)])
        if not ok:
            return False, f"{name} decrypt: {detail}"
        ok, detail = _run(
            [str(bdpatch), "flatten", flatten_type, str(plain), str(tsv)]
        )
        if not ok:
            return False, f"{name} flatten: {detail}"
    return True, ""


def export_quests_catalog(
    runtime: Path,
    output_path: Path | None = None,
) -> tuple[bool, str, dict[str, Any]]:
    """Decrypt/flatten quest tables and write quests.json."""
    runtime = Path(runtime)
    output_path = Path(
        output_path or (_repo_wiki_dir() / "quests.json")
    )
    work = Path(tempfile.mkdtemp(prefix="ops-wiki-export-quests-"))
    try:
        ok, detail = flatten_quest_tables(runtime, work)
        if not ok:
            return False, "flatten_failed", {"detail": detail}
        payload = build_quests_payload(work)
        _atomic_write_json(output_path, payload)
        return (
            True,
            "",
            {
                "detail": "quests catalog written",
                "questCount": len(payload["quests"]),
                "outPath": str(output_path),
            },
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _print_quest_verification(payload: dict[str, Any], quest_id: int) -> None:
    quest = next((q for q in payload["quests"] if q["id"] == quest_id), None)
    if quest is None:
        print(f"Quest {quest_id}: NOT FOUND")
        return
    print(f"Quest {quest_id} verification:")
    print(f"  title:   {quest.get('title')}")
    print(f"  npc:     {quest.get('npc')}")
    print(f"  zoneID:  {quest.get('zoneID')}")
    print(f"  type:    {quest.get('type')}")
    print(f"  coords:  {quest.get('coordinates')}")
    print(f"  lines:   {quest.get('lines') or quest.get('linesRaw')}")
    print(f"  phases ({len(quest.get('phases') or [])}):")
    for phase in quest.get("phases") or []:
        reqs = phase.get("requirements") or []
        if reqs:
            req_summary = ", ".join(
                f"{r['type']} obj={r['objectID']} x{r['objectCount']}"
                for r in reqs
            )
        else:
            req_summary = "NONE (dialogue / event-driven)"
        print(
            f"    phase {phase.get('phaseNumber')}: "
            f"requirementCount={phase.get('requirementCount')} — {req_summary}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export QuestData + CQuestData to quests.json"
    )
    parser.add_argument(
        "--runtime",
        type=Path,
        default=_default_binarydata_root(),
        help="Runtime root containing datastore/BinaryData/Shield",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_repo_wiki_dir() / "quests.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--verify-id",
        type=int,
        default=5,
        help="Quest ID to print after export (default: 5 Guard's Desire)",
    )
    args = parser.parse_args(argv)

    ok, code, info = export_quests_catalog(args.runtime, args.output)
    if not ok:
        print(f"Export failed ({code}): {info.get('detail', code)}")
        return 1

    print(f"Wrote {info['questCount']} quests to {info['outPath']}")
    payload = json.loads(Path(info["outPath"]).read_text(encoding="utf-8"))
    if args.verify_id is not None:
        _print_quest_verification(payload, args.verify_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
