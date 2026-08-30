#!/usr/bin/env python3
"""
Wire confident dungeon-payout families onto shared AFTER dispatchers.

Reads clear-loot-catalog.json, assigns AI_PAY_<FAMILY>_AFTER_NORMAL/FIEND to
all difficulties in a family when loot→instance mapping is high-confidence,
patches stock clear-loot event `next` values (idempotent), and optionally
enables those payouts.

  python3 scripts/payout-wire-families.py --dry-run
  python3 scripts/payout-wire-families.py --enable
  python3 scripts/payout-wire-families.py --family "Suginami Tunnels" --enable

Then re-run: python3 scripts/payout-scan-clear-loot.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

TODO_RESUME = "TODO_STOCK_RESUME_EVENT"
AI_PAY_RE = re.compile(r"^AI_PAY_", re.I)
AI_P13_RE = re.compile(r"^AI_P13_", re.I)
NEXT_MEMBER_RE = re.compile(
    r'(<member\s+name="next"\s*>)([^<]*)(</member>)', re.I
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def family_slug(family: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", family.strip()).strip("_").upper()
    # Shorten common noise
    slug = slug.replace("TUNNELS", "").replace("UNDERGROUND", "UG")
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "FAMILY"


def load_catalog(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_payout_file(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_payout_file(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def candidate_loot_for_instance(
    inst: int,
    loot_events: list[dict],
    instances: dict[int, dict],
) -> list[dict]:
    """High-confidence clear-loot rows for an instance.

    Catalog rows are already isBossBox. Prefer eventIds that contain the
    instance id; fall back to zone-prefix matches in the same events file.
    Require a non-empty next (needed for resume + splice).
    """
    needle = str(inst)
    strong: list[dict] = []
    weak: list[dict] = []
    for ev in loot_events:
        eid = ev.get("eventId") or ""
        src = ev.get("sourceFile") or ""
        if not ev.get("next"):
            continue
        if needle in eid:
            strong.append(ev)
            continue
        zi = instances.get(inst)
        if not zi:
            continue
        for zid in zi.get("zoneIds") or []:
            zprefix = str(zid)[:5]
            if zprefix and zprefix in eid:
                weak.append(ev)
                break
            # e.g. dungeon_events-540X.xml for instance 5401
            if src and needle[:3] in src and (
                f"{needle[:2]}0X" in src.upper()
                or f"{needle[:3]}" in src
                or needle[:4] in src
            ):
                weak.append(ev)
                break

    chosen = strong if strong else weak

    def score(e: dict) -> tuple:
        tags = set(e.get("pathTags") or [])
        eid = (e.get("eventId") or "").upper()
        return (
            0 if "loot_named" in tags or "LOOT" in eid else 1,
            0 if "SG1" in eid or "BOSS" in eid or "NORMAL" in eid else 1,
            0 if "normal" in tags else 1,
            0 if "fiend" in tags else 1,
            e.get("eventId") or "",
        )

    seen: set[str] = set()
    uniq: list[dict] = []
    for e in sorted(chosen, key=score):
        eid = e["eventId"]
        if eid in seen:
            continue
        seen.add(eid)
        uniq.append(e)
    return uniq


def family_shared_loot_ok(loot_by_member: dict[str, list[dict]]) -> tuple[bool, str]:
    """Require members to share a sourceFile or a pre-splice next (family splice)."""
    if not loot_by_member:
        return False, "no members"
    files: list[set[str]] = []
    nexts: list[set[str]] = []
    for evs in loot_by_member.values():
        files.append({e.get("sourceFile") or "" for e in evs if e.get("sourceFile")})
        nexts.append(
            {
                e["next"]
                for e in evs
                if e.get("next")
                and not AI_PAY_RE.match(e["next"])
                and not AI_P13_RE.match(e["next"])
            }
            or {
                e["next"]
                for e in evs
                if e.get("next") and (AI_PAY_RE.match(e["next"]) or AI_P13_RE.match(e["next"]))
            }
        )
    shared_files = set.intersection(*files) if files and all(files) else set()
    shared_nexts = set.intersection(*nexts) if nexts and all(nexts) else set()
    # Single-member families are OK with any loot
    if len(loot_by_member) == 1:
        return True, "single member"
    if shared_files:
        return True, f"shared sourceFile {sorted(shared_files)[0]}"
    if shared_nexts:
        return True, f"shared next {sorted(shared_nexts)[0]}"
    return False, "members do not share loot sourceFile or next (not one splice family)"


def split_normal_fiend(events: list[dict]) -> tuple[list[dict], list[dict]]:
    normal: list[dict] = []
    fiend: list[dict] = []
    for e in events:
        tags = set(e.get("pathTags") or [])
        uid = (e.get("eventId") or "").upper()
        is_fiend = "fiend" in tags or "FIEND" in uid
        if is_fiend:
            fiend.append(e)
        else:
            normal.append(e)
    return normal, fiend


def next_is_foreign_family(next_id: str | None, our_prefix: str) -> bool:
    if not next_id:
        return False
    if AI_P13_RE.match(next_id):
        # Legacy Phase 13 — treat as rewirable (same splice point)
        return False
    if not AI_PAY_RE.match(next_id):
        return False
    # Already our family dispatcher or per-tier leftover
    if next_id.upper().startswith(our_prefix.upper()):
        return False
    # Unrelated AI_PAY_* family
    return True


def assess_family(
    family: str,
    members: list[dict],
    catalog: dict,
) -> dict:
    loot_events = catalog.get("clearLootEvents") or []
    instances = {
        i["instanceId"]: i for i in (catalog.get("zoneInstances") or [])
    }
    slug = family_slug(family)
    after_n = f"AI_PAY_{slug}_AFTER_NORMAL"
    after_f = f"AI_PAY_{slug}_AFTER_FIEND"
    our_prefix = f"AI_PAY_{slug}"

    issues: list[str] = []
    loot_by_member: dict[str, list[dict]] = {}
    resume_candidates: list[str] = []

    for p in members:
        # Skip mode variants that share instance with a primary difficulty
        # (bearcat / per-floor / unknown) unless they are the only member.
        diff = (p.get("difficulty") or "").lower()
        mode = (p.get("mode") or "").lower()
        pid = p["id"]
        if any(
            x in pid
            for x in ("-bearcat", "-wildcat", "-per-floor", "-unknown")
        ):
            issues.append(f"skip variant {pid} (not a standard difficulty tier)")
            continue
        inst = p.get("instanceId")
        if not isinstance(inst, int):
            issues.append(f"{pid}: missing instanceId")
            continue
        if inst not in instances:
            issues.append(f"{pid}: instanceId {inst} not in zoneinstance")
            continue
        cands = candidate_loot_for_instance(inst, loot_events, instances)
        if not cands:
            issues.append(f"{pid}: no clear-loot candidates for instance {inst}")
            continue
        # Reject if all candidates already point at an unrelated AI_PAY family
        usable = [
            e
            for e in cands
            if not next_is_foreign_family(e.get("next"), our_prefix)
        ]
        if not usable:
            issues.append(
                f"{pid}: clear-loot next already owned by another AI_PAY family"
            )
            continue
        loot_by_member[pid] = usable
        for e in usable:
            nxt = e.get("next")
            if nxt and not AI_PAY_RE.match(nxt) and not AI_P13_RE.match(nxt):
                resume_candidates.append(nxt)

    primary_ids = list(loot_by_member.keys())
    if len(primary_ids) < 1:
        return {
            "family": family,
            "confident": False,
            "reason": "; ".join(issues) or "no mappable members",
            "issues": issues,
            "members": [],
            "afterNormal": after_n,
            "afterFiend": after_f,
            "resume": None,
            "patchEvents": [],
        }

    shared_ok, shared_reason = family_shared_loot_ok(loot_by_member)
    if not shared_ok:
        return {
            "family": family,
            "confident": False,
            "reason": shared_reason,
            "issues": issues,
            "members": primary_ids,
            "afterNormal": after_n,
            "afterFiend": after_f,
            "resume": None,
            "patchEvents": [],
        }
    issues.append(f"family splice: {shared_reason}")

    # Prefer a shared resume from current stock next (pre-splice)
    resume = None
    if resume_candidates:
        # most common non-AI next
        counts: dict[str, int] = defaultdict(int)
        for r in resume_candidates:
            counts[r] += 1
        resume = max(counts.items(), key=lambda kv: kv[1])[0]
    else:
        # Already spliced — keep existing non-TODO resume from any member
        for p in members:
            if p["id"] not in loot_by_member:
                continue
            r = (p.get("hooks") or {}).get("resumeNormalNext") or ""
            if r and not r.upper().startswith("TODO"):
                resume = r
                break

    if not resume:
        return {
            "family": family,
            "confident": False,
            "reason": "no clear resume next (all TODO / already AI-only)",
            "issues": issues,
            "members": primary_ids,
            "afterNormal": after_n,
            "afterFiend": after_f,
            "resume": None,
            "patchEvents": [],
        }

    # Collect stock events to patch: prefer intersection across members
    # (true shared splice), else LOOT-tagged events from shared source files.
    id_sets = [set(e["eventId"] for e in evs) for evs in loot_by_member.values()]
    shared_ids = set.intersection(*id_sets) if id_sets else set()
    patch_pool: list[dict] = []
    if shared_ids:
        seen_e: set[str] = set()
        for evs in loot_by_member.values():
            for e in evs:
                if e["eventId"] in shared_ids and e["eventId"] not in seen_e:
                    seen_e.add(e["eventId"])
                    patch_pool.append(e)
    else:
        shared_files_set = set.intersection(
            *[{e.get("sourceFile") or "" for e in evs} for evs in loot_by_member.values()]
        )
        seen_e = set()
        for evs in loot_by_member.values():
            for e in evs:
                eid = e["eventId"]
                if eid in seen_e:
                    continue
                if e.get("sourceFile") not in shared_files_set:
                    continue
                # Prefer primary clear chests / LOOT; skip obscure mid-run gems
                uid = eid.upper()
                tags = set(e.get("pathTags") or [])
                if not (
                    "loot_named" in tags
                    or "LOOT" in uid
                    or "FIEND_LOOT" in uid
                    or "SG1" in uid
                    or "BOSS" in uid
                    or "NORMAL_LOOT" in uid
                    or uid.endswith("_TR01")
                    or "_TR0" in uid
                ):
                    continue
                seen_e.add(eid)
                patch_pool.append(e)

    patch_normal: dict[str, dict] = {}
    patch_fiend: dict[str, dict] = {}
    normals, fiends = split_normal_fiend(patch_pool)
    # If split left normals empty but pool has items, treat non-fiend as normal
    if not normals and not fiends:
        normals = patch_pool
    for e in normals:
        if next_is_foreign_family(e.get("next"), our_prefix):
            continue
        patch_normal[e["eventId"]] = e
    for e in fiends:
        if next_is_foreign_family(e.get("next"), our_prefix):
            continue
        patch_fiend[e["eventId"]] = e

    if not patch_normal and not patch_fiend:
        return {
            "family": family,
            "confident": False,
            "reason": "no patchable loot events after filters",
            "issues": issues,
            "members": primary_ids,
            "afterNormal": after_n,
            "afterFiend": after_f,
            "resume": resume,
            "patchEvents": [],
        }

    patch_events = []
    for e in patch_normal.values():
        patch_events.append(
            {
                "eventId": e["eventId"],
                "sourceFile": e.get("sourceFile"),
                "path": "normal",
                "currentNext": e.get("next"),
                "newNext": after_n,
            }
        )
    for e in patch_fiend.values():
        patch_events.append(
            {
                "eventId": e["eventId"],
                "sourceFile": e.get("sourceFile"),
                "path": "fiend",
                "currentNext": e.get("next"),
                "newNext": after_f,
            }
        )

    return {
        "family": family,
        "confident": True,
        "reason": "ok",
        "issues": issues,
        "members": primary_ids,
        "afterNormal": after_n,
        "afterFiend": after_f,
        "resume": resume,
        "patchEvents": patch_events,
        "lootByMember": {k: [e["eventId"] for e in v] for k, v in loot_by_member.items()},
    }


def patch_event_next_in_file(
    path: Path, event_id: str, new_next: str, dry_run: bool
) -> bool:
    """Set the top-level next of the object whose ID is event_id. Idempotent."""
    text = path.read_text(encoding="utf-8", errors="replace")
    # Find object block containing this ID as its own member
    id_pat = re.compile(
        rf'<member\s+name="ID"\s*>\s*{re.escape(event_id)}\s*</member>',
        re.I,
    )
    m = id_pat.search(text)
    if not m:
        return False
    # Walk back to enclosing <object ...>
    obj_start = text.rfind("<object", 0, m.start())
    if obj_start < 0:
        return False
    # Match closing </object> with nesting
    i = obj_start
    depth = 0
    obj_end = -1
    while i < len(text):
        nxt_open = text.find("<object", i)
        nxt_close = text.find("</object>", i)
        if nxt_close < 0:
            break
        if depth == 0 and nxt_open == obj_start:
            depth = 1
            i = obj_start + 7
            continue
        if nxt_open >= 0 and nxt_open < nxt_close:
            depth += 1
            i = nxt_open + 7
        else:
            depth -= 1
            i = nxt_close + 9
            if depth == 0:
                obj_end = i
                break
    if obj_end < 0:
        return False
    block = text[obj_start:obj_end]
    # Only replace the object's own next (first member next after ID in block)
    id_in_block = id_pat.search(block)
    if not id_in_block:
        return False
    nm = NEXT_MEMBER_RE.search(block, id_in_block.end())
    if not nm:
        # Some events put next before ID — allow any next in this object
        nm = NEXT_MEMBER_RE.search(block)
    if not nm:
        return False
    old = nm.group(2).strip()
    if old == new_next:
        return True
    if not dry_run:
        start = obj_start + nm.start()
        end = obj_start + nm.end()
        replacement = f"{nm.group(1)}{new_next}{nm.group(3)}"
        text = text[:start] + replacement + text[end:]
        path.write_text(text, encoding="utf-8")
    return True


def apply_assessment(
    assessment: dict,
    payouts_dir: Path,
    events_dirs: list[Path],
    *,
    enable: bool,
    dry_run: bool,
) -> list[str]:
    log: list[str] = []
    if not assessment["confident"]:
        log.append(f"SKIP {assessment['family']}: {assessment['reason']}")
        for iss in assessment.get("issues") or []:
            log.append(f"  · {iss}")
        return log

    after_n = assessment["afterNormal"]
    after_f = assessment["afterFiend"]
    resume = assessment["resume"]
    log.append(
        f"{'DRY ' if dry_run else ''}WIRE {assessment['family']}: "
        f"members={assessment['members']} AFTER={after_n}/{after_f} resume={resume}"
    )

    for patch in assessment["patchEvents"]:
        eid = patch["eventId"]
        new_next = patch["newNext"]
        src = patch.get("sourceFile") or ""
        ok_any = False
        for ed in events_dirs:
            path = ed / src if src else None
            if path and path.is_file():
                if patch_event_next_in_file(path, eid, new_next, dry_run):
                    ok_any = True
                    log.append(
                        f"  patch {path.name} {eid} next → {new_next}"
                        + (" (dry)" if dry_run else "")
                    )
            else:
                # Search all xml if sourceFile missing/mismatched
                for path in sorted(ed.glob("*.xml")):
                    if patch_event_next_in_file(path, eid, new_next, dry_run):
                        ok_any = True
                        log.append(
                            f"  patch {path.name} {eid} next → {new_next}"
                            + (" (dry)" if dry_run else "")
                        )
                        break
        if not ok_any:
            log.append(f"  WARN could not locate event {eid} in events dirs")

    for pid in assessment["members"]:
        path = payouts_dir / f"{pid}.json"
        if not path.is_file():
            log.append(f"  WARN missing payout file {path.name}")
            continue
        data = load_payout_file(path)
        p = data["payout"]
        hooks = p.setdefault("hooks", {})
        diff = (p.get("difficulty") or "tier").upper().replace(" ", "_")
        slug = family_slug(assessment["family"])
        hooks["afterNormalLootEventId"] = after_n
        hooks["afterFiendLootEventId"] = after_f
        hooks["resumeNormalNext"] = resume
        # Stable per-tier bonus IDs under the shared family prefix
        hooks["bonusEventId"] = f"AI_PAY_{slug}_{diff}_BONUS"
        hooks["bonusFiendEventId"] = f"AI_PAY_{slug}_{diff}_BONUS_FIEND"
        if enable:
            p["enabled"] = True
        if not dry_run:
            write_payout_file(path, data)
        log.append(
            f"  payout {pid}: hooks→{after_n} resume={resume}"
            + (" enabled" if enable else "")
            + (" (dry)" if dry_run else "")
        )
    return log


def main() -> int:
    root = repo_root()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--catalog",
        type=Path,
        default=root / "server-content" / "payouts" / "clear-loot-catalog.json",
    )
    ap.add_argument(
        "--payouts-dir",
        type=Path,
        default=root / "server-content" / "payouts",
    )
    ap.add_argument(
        "--events-dir",
        type=Path,
        action="append",
        default=None,
        help="Stock events dir (repeatable). Defaults to runtime + source datastore.",
    )
    ap.add_argument("--family", action="append", default=None, help="Only these families")
    ap.add_argument(
        "--enable",
        action="store_true",
        help="Set enabled=true on wired family members",
    )
    ap.add_argument("--dry-run", action="store_true", help="Report only; no writes")
    ap.add_argument(
        "--list",
        action="store_true",
        help="List confidence assessment for all families and exit",
    )
    args = ap.parse_args()

    if not args.catalog.is_file():
        print(f"catalog missing: {args.catalog}", file=sys.stderr)
        print("Run: python3 scripts/payout-scan-clear-loot.py", file=sys.stderr)
        return 2

    events_dirs = args.events_dir or [
        root.parent / "comp_hack" / "runtime" / "datastore" / "events",
        root.parent / "comp_hack" / "datastore" / "events",
    ]
    events_dirs = [p for p in events_dirs if p.is_dir()]
    if not events_dirs:
        print("no events dirs found", file=sys.stderr)
        return 2

    catalog = load_catalog(args.catalog)
    by_family: dict[str, list[dict]] = defaultdict(list)
    for p in catalog.get("payouts") or []:
        fam = p.get("family") or p["id"]
        by_family[fam].append(p)

    families = sorted(by_family.keys())
    if args.family:
        want = set(args.family)
        families = [f for f in families if f in want]
        missing = want - set(families)
        for m in missing:
            print(f"unknown family: {m}", file=sys.stderr)

    assessments = [assess_family(f, by_family[f], catalog) for f in families]

    confident = [a for a in assessments if a["confident"]]
    skipped = [a for a in assessments if not a["confident"]]

    print(
        f"Families: {len(assessments)} — confident={len(confident)} "
        f"low-confidence={len(skipped)}"
    )
    for a in assessments:
        mark = "OK" if a["confident"] else "SKIP"
        print(
            f"  [{mark}] {a['family']}: members={a.get('members')} "
            f"resume={a.get('resume')} patches={len(a.get('patchEvents') or [])}"
            + (f" — {a['reason']}" if not a["confident"] else "")
        )
        for iss in a.get("issues") or []:
            print(f"         · {iss}")

    if args.list:
        return 0

    for a in assessments:
        for line in apply_assessment(
            a,
            args.payouts_dir,
            events_dirs,
            enable=args.enable,
            dry_run=args.dry_run,
        ):
            print(line)

    if not args.dry_run:
        print(
            "\nNext: python3 scripts/payout-scan-clear-loot.py "
            "then Overview → Validate → Publish & restart"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
