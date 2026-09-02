#!/usr/bin/env python3
"""Apply fresh-install defaults for dungeon loot + payout working copies.

- report-rewards/dungeons: all enabled
- payouts: CP from built-in "normal" preset; enabled when wired in clear-loot-catalog

Mirrors website/lib/cp-preset-grindy-table.ts + cpPresets.ts (normal preset).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

# Keep in sync with website/lib/cp-preset-grindy-table.ts
GRINDY_CP_BY_PAYOUT_ID: dict[str, float] = {
    "suginami-bronze": 3,
    "suginami-silver": 6,
    "suginami-gold": 12,
    "suginami-unknown": 2.5,
    "suginami-bronze-bearcat": 8,
    "celu-bronze": 5,
    "celu-silver": 10,
    "celu-gold": 28,
    "celu-bronze-bearcat": 8,
    "catacomb-bronze": 6,
    "ichigaya-bronze": 4,
    "ichigaya-silver": 4,
    "ichigaya-gold": 6,
    "ichigaya-2king": 10,
    "ichigaya-3king": 12,
    "ichigaya-4king": 12,
    "ichigaya-assassins": 10,
    "ichigaya-tokisada": 15,
    "quartz-bronze": 3,
    "quartz-silver": 5,
    "quartz-gold": 6,
    "old-tokyo-metro": 5,
    "zhuque-bronze": 4,
    "zhuque-gold": 40,
    "zhuque-amaterasu-m": 40,
    "zhuque-amaterasu-f": 43,
    "zhuque-susanoo": 50,
    "mirage-bronze": 5,
    "mirage-silver": 11,
    "mirage-gold": 30,
    "mirage-astaroth": 35,
    "mirage-ishtar": 50,
    "nakano-ug-bronze": 8,
    "nakano-ug-silver": 15,
    "nakano-ug-gold": 50,
    "yoidore": 10,
}

NORMAL_PRESET_SCALE = 5

NORMAL = {
    "bronze": 20,
    "silver": 50,
    "gold": 120,
    "bearcat_mult": 1.5,
    "diaspora": 200,
    "boss_mult_of_gold": 1.15,
    "special": 25,
}


def round_cp(n: float) -> int:
    return max(0, int(round(n)))


def preset_cp_for_payout(payout: dict) -> int:
    payout_id = payout["id"]
    base = GRINDY_CP_BY_PAYOUT_ID.get(payout_id)
    if base is not None:
        return round_cp(base * NORMAL_PRESET_SCALE)

    mode = payout.get("mode") or "normal"
    difficulty = payout.get("difficulty") or "bronze"

    if mode == "diaspora":
        return NORMAL["diaspora"]
    if mode == "bearcat":
        return round_cp(NORMAL["bronze"] * NORMAL["bearcat_mult"])
    if mode == "boss":
        return round_cp(NORMAL["gold"] * NORMAL["boss_mult_of_gold"])
    if mode == "other" or difficulty == "special":
        return NORMAL["special"]
    if difficulty == "silver":
        return NORMAL["silver"]
    if difficulty == "gold":
        return NORMAL["gold"]
    return NORMAL["bronze"]


def wired_payout_ids(payouts_dir: Path) -> set[str]:
    catalog = payouts_dir / "clear-loot-catalog.json"
    if not catalog.is_file():
        return set()
    data = json.loads(catalog.read_text(encoding="utf-8"))
    out: set[str] = set()
    for row in data.get("wireStatus", []):
        if row.get("status") == "wired":
            out.add(str(row["payoutId"]))
    return out


def apply_defaults(root: Path) -> None:
    dungeons_dir = root / "report-rewards" / "dungeons"
    payouts_dir = root / "payouts"
    wired = wired_payout_ids(payouts_dir)

    dungeon_count = 0
    for path in sorted(dungeons_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        dungeon = data.get("dungeon")
        if not isinstance(dungeon, dict):
            continue
        if dungeon.get("enabled") is not True:
            dungeon["enabled"] = True
            path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            dungeon_count += 1

    payout_count = 0
    for path in sorted(payouts_dir.glob("*.json")):
        if path.name == "clear-loot-catalog.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        payout = data.get("payout")
        if not isinstance(payout, dict):
            continue
        payout_id = str(payout.get("id", path.stem))
        next_cp = preset_cp_for_payout(payout)
        next_enabled = payout_id in wired if wired else bool(payout.get("enabled"))
        if payout.get("cp") != next_cp or payout.get("enabled") is not next_enabled:
            payout["cp"] = next_cp
            payout["enabled"] = next_enabled
            path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            payout_count += 1

    print(
        f"apply-install-payout-defaults: {root} "
        f"(dungeons enabled: {dungeon_count}, payouts updated: {payout_count}, "
        f"wired payouts live: {len(wired)})"
    )


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    deploy_dir = script_dir.parent
    default_root = deploy_dir / "seed" / "server-content"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        default=str(default_root),
        help=f"server-content root (default: {default_root})",
    )
    args = parser.parse_args()
    apply_defaults(Path(args.root).resolve())


if __name__ == "__main__":
    main()
