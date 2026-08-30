#!/usr/bin/env bash
# Seed Phase 16D payout catalog stubs from private-server "End Chests CP" sheet.
# Does not overwrite suginami-bronze.json (live Phase 13). Re-run is idempotent
# for other files (overwrites stubs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${COMP_PAYOUTS_DIR:-$ROOT/server-content/payouts}"
mkdir -p "$OUT"

python3 - "$OUT" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])

# DropSet / flag IDs: project range 901101+ (see docs/ids.md). Phase 13 keeps 900003/900013.
# Each stub: dropSetId = base+i, dedupFlag = bossGroupId = flag_base+i

def hooks(slug: str) -> dict:
    s = slug.upper().replace("-", "_")
    return {
        "afterNormalLootEventId": f"AI_PAY_{s}_AFTER_NORMAL",
        "afterFiendLootEventId": f"AI_PAY_{s}_AFTER_FIEND",
        "bonusEventId": f"AI_PAY_{s}_BONUS",
        "bonusFiendEventId": f"AI_PAY_{s}_BONUS_FIEND",
        "resumeNormalNext": "TODO_STOCK_RESUME_EVENT",
    }

def stub(
    *,
    id: str,
    name: str,
    instance_id: int,
    cp: int,
    family: str,
    difficulty: str,
    mode: str = "normal",
    variant_label: str | None = None,
    notes: str = "",
    drop_i: int,
    enabled: bool = False,
    description: str | None = None,
) -> dict:
    flag = 901200 + drop_i
    drop = 901100 + drop_i
    payout = {
        "id": id,
        "name": name,
        "description": description
        or f"Catalog stub from End Chests CP sheet. Disabled until wired.",
        "family": family,
        "difficulty": difficulty,
        "mode": mode,
        "enabled": enabled,
        "instanceId": instance_id,
        "dedupFlag": flag,
        "bossGroupId": flag,
        "dropSetId": drop,
        "spotId": 2,
        "crateCount": 5,
        "cp": cp,
        "crateDrops": [
            {"itemId": 699, "minStack": 1, "maxStack": 2, "rate": 100},
        ],
        "clearItems": [],
        "hooks": hooks(id),
    }
    if variant_label:
        payout["variantLabel"] = variant_label
    if notes:
        payout["notes"] = notes
    return {"version": 1, "payout": payout}

# Source: private-server "End Chests CP values" sheet (not stock Imagine).
# Instance IDs from zoneinstance/00_stock.xml where known; TBD noted in notes.
rows = [
    # Suginami — bronze kept as Phase 13 file (not written here)
    stub(
        id="suginami-silver",
        name="Suginami Tunnels (Silver)",
        instance_id=5402,
        cp=9,
        family="Suginami Tunnels",
        difficulty="silver",
        drop_i=1,
        notes="Sheet CP 9. Shares dungeon_events-540X with bronze; needs own bonus branch.",
    ),
    stub(
        id="suginami-gold",
        name="Suginami Tunnels (Gold)",
        instance_id=5403,
        cp=17,
        family="Suginami Tunnels",
        difficulty="gold",
        drop_i=2,
        notes="Sheet CP 17.",
    ),
    stub(
        id="suginami-bronze-bearcat",
        name="Suginami Tunnels (Bronze, Bearcat)",
        instance_id=5401,
        cp=14,
        family="Suginami Tunnels",
        difficulty="bronze",
        mode="bearcat",
        variant_label="Bearcat",
        drop_i=3,
        notes="Sheet CP 14 + summon orbs. DEMON_ONLY / WC variant ~10001 or DIGITALIZE 60000. Orbs item IDs TBD.",
    ),
    stub(
        id="suginami-unknown",
        name="Suginami Tunnels (?)",
        instance_id=5491,
        cp=23,
        family="Suginami Tunnels",
        difficulty="special",
        mode="other",
        variant_label="Unknown plate",
        drop_i=4,
        notes="Sheet CP 23. Instance 5491 is a Suginami-lobby variant — confirm vs ? plate.",
    ),
    # Old Ichigaya Camp
    stub(
        id="ichigaya-bronze",
        name="Old Ichigaya Camp (Bronze)",
        instance_id=5101,
        cp=3,
        family="Old Ichigaya Camp",
        difficulty="bronze",
        drop_i=5,
    ),
    stub(
        id="ichigaya-silver",
        name="Old Ichigaya Camp (Silver)",
        instance_id=5131,
        cp=4,
        family="Old Ichigaya Camp",
        difficulty="silver",
        drop_i=6,
        notes="Instance 5131 guessed as silver — confirm.",
    ),
    stub(
        id="ichigaya-gold",
        name="Old Ichigaya Camp (Gold)",
        instance_id=5151,
        cp=15,
        family="Old Ichigaya Camp",
        difficulty="gold",
        drop_i=7,
        notes="Sheet: 15 CP + 25 Coral. Coral item ID TBD.",
    ),
    stub(
        id="ichigaya-2king",
        name="Old Ichigaya Camp (2-king)",
        instance_id=5121,
        cp=20,
        family="Old Ichigaya Camp",
        difficulty="special",
        mode="boss",
        variant_label="2-king",
        drop_i=8,
        notes="Sheet: 20 CP + 50 Coral. Instance ID tentative.",
    ),
    stub(
        id="ichigaya-3king",
        name="Old Ichigaya Camp (3-king)",
        instance_id=5141,
        cp=25,
        family="Old Ichigaya Camp",
        difficulty="special",
        mode="boss",
        variant_label="3-king",
        drop_i=9,
        notes="Sheet: 25 CP + 75 Coral.",
    ),
    stub(
        id="ichigaya-4king",
        name="Old Ichigaya Camp (4-king)",
        instance_id=11305,
        cp=30,
        family="Old Ichigaya Camp",
        difficulty="special",
        mode="boss",
        variant_label="4-king",
        drop_i=10,
        notes="Sheet: 30 CP + 100 Coral. Instance ID tentative.",
    ),
    stub(
        id="ichigaya-assassins",
        name="Old Ichigaya Camp (Assassins)",
        instance_id=11403,
        cp=12,
        family="Old Ichigaya Camp",
        difficulty="special",
        mode="boss",
        variant_label="Assassins",
        drop_i=11,
        notes="Sheet: 12 CP + 50 Coral.",
    ),
    stub(
        id="ichigaya-tokisada",
        name="Old Ichigaya Camp (Tokisada)",
        instance_id=11503,
        cp=12,
        family="Old Ichigaya Camp",
        difficulty="special",
        mode="boss",
        variant_label="Tokisada",
        drop_i=12,
        notes="Sheet: 12 CP + 50 Coral.",
    ),
    # Celu Tower
    stub(
        id="celu-bronze",
        name="Celu Tower (Bronze)",
        instance_id=5501,
        cp=4,
        family="Celu Tower",
        difficulty="bronze",
        drop_i=13,
    ),
    stub(
        id="celu-silver",
        name="Celu Tower (Silver)",
        instance_id=5502,
        cp=12,
        family="Celu Tower",
        difficulty="silver",
        drop_i=14,
    ),
    stub(
        id="celu-gold",
        name="Celu Tower (Gold)",
        instance_id=5503,
        cp=47,
        family="Celu Tower",
        difficulty="gold",
        drop_i=15,
    ),
    stub(
        id="celu-bronze-bearcat",
        name="Celu Tower (Bronze, Bearcat)",
        instance_id=5501,
        cp=17,
        family="Celu Tower",
        difficulty="bronze",
        mode="bearcat",
        variant_label="Bearcat",
        drop_i=16,
        notes="Sheet CP 17 + summon orbs. WC/DIGITALIZE BEARCAT ~10013 / 60001.",
    ),
    stub(
        id="celu-per-floor",
        name="Celu Tower (per floor)",
        instance_id=5521,
        cp=12,
        family="Celu Tower",
        difficulty="special",
        mode="other",
        variant_label="Each floor",
        drop_i=17,
        notes="Sheet: 12 CP each floor(!). Payout model is per-clear today — needs design for floor grants.",
    ),
    # Shibuya Quartz
    stub(
        id="quartz-bronze",
        name="Shibuya Quartz (Bronze)",
        instance_id=5701,
        cp=5,
        family="Shibuya Quartz",
        difficulty="bronze",
        drop_i=18,
    ),
    stub(
        id="quartz-silver",
        name="Shibuya Quartz (Silver)",
        instance_id=5702,
        cp=4,
        family="Shibuya Quartz",
        difficulty="silver",
        drop_i=19,
    ),
    stub(
        id="quartz-gold",
        name="Shibuya Quartz (Gold)",
        instance_id=5703,
        cp=10,
        family="Shibuya Quartz",
        difficulty="gold",
        drop_i=20,
    ),
    stub(
        id="quartz-per-floor",
        name="Shibuya Quartz (per floor)",
        instance_id=5721,
        cp=12,
        family="Shibuya Quartz",
        difficulty="special",
        mode="other",
        variant_label="Each floor",
        drop_i=21,
        notes="Sheet: 12 CP each floor(!).",
    ),
    # Shinagawa Catacomb
    stub(
        id="catacomb-bronze",
        name="Shinagawa Catacomb (Bronze)",
        instance_id=6201,
        cp=7,
        family="Shinagawa Catacomb",
        difficulty="bronze",
        drop_i=22,
    ),
    stub(
        id="catacomb-silver",
        name="Shinagawa Catacomb (Silver)",
        instance_id=6202,
        cp=12,
        family="Shinagawa Catacomb",
        difficulty="silver",
        drop_i=23,
        notes="Sheet labeled Silver / Bronze NM — confirm.",
    ),
    stub(
        id="catacomb-gold",
        name="Shinagawa Catacomb (Gold)",
        instance_id=6203,
        cp=13,
        family="Shinagawa Catacomb",
        difficulty="gold",
        drop_i=24,
    ),
    # Kagurazaka Zhu Que
    stub(
        id="zhuque-bronze",
        name="Kagurazaka Zhu Que Caverns (Bronze)",
        instance_id=6301,
        cp=6,
        family="Kagurazaka Zhu Que",
        difficulty="bronze",
        drop_i=25,
    ),
    stub(
        id="zhuque-silver",
        name="Kagurazaka Zhu Que Caverns (Silver)",
        instance_id=6302,
        cp=7,
        family="Kagurazaka Zhu Que",
        difficulty="silver",
        drop_i=26,
        notes="Sheet: Silver / Bronze Suzaku — confirm.",
    ),
    stub(
        id="zhuque-gold",
        name="Kagurazaka Zhu Que Caverns (Gold)",
        instance_id=6303,
        cp=50,
        family="Kagurazaka Zhu Que",
        difficulty="gold",
        drop_i=27,
    ),
    stub(
        id="zhuque-susanoo",
        name="Kagurazaka Zhu Que (Susano-o)",
        instance_id=6304,
        cp=60,
        family="Kagurazaka Zhu Que",
        difficulty="special",
        mode="boss",
        variant_label="Susano-o",
        drop_i=28,
    ),
    stub(
        id="zhuque-amaterasu-m",
        name="Kagurazaka Zhu Que (Amaterasu ♂)",
        instance_id=10005,
        cp=60,
        family="Kagurazaka Zhu Que",
        difficulty="special",
        mode="boss",
        variant_label="Amaterasu male",
        drop_i=29,
        notes="Instance ID tentative among Zhu Que family.",
    ),
    stub(
        id="zhuque-amaterasu-f",
        name="Kagurazaka Zhu Que (Amaterasu ♀)",
        instance_id=10011,
        cp=60,
        family="Kagurazaka Zhu Que",
        difficulty="special",
        mode="boss",
        variant_label="Amaterasu female",
        drop_i=30,
        notes="Instance ID tentative.",
    ),
    # Nakano Underground
    stub(
        id="nakano-ug-bronze",
        name="Nakano Underground Ruins (Bronze)",
        instance_id=9201,
        cp=6,
        family="Nakano Underground",
        difficulty="bronze",
        drop_i=31,
    ),
    stub(
        id="nakano-ug-silver",
        name="Nakano Underground Ruins (Silver)",
        instance_id=10502,
        cp=13,
        family="Nakano Underground",
        difficulty="silver",
        drop_i=32,
        notes="Instance ID tentative.",
    ),
    stub(
        id="nakano-ug-gold",
        name="Nakano Underground Ruins (Gold)",
        instance_id=10509,
        cp=13,
        family="Nakano Underground",
        difficulty="gold",
        drop_i=33,
        notes="Instance ID tentative.",
    ),
    stub(
        id="nakano-ug-per-floor",
        name="Nakano Underground (per floor)",
        instance_id=11504,
        cp=12,
        family="Nakano Underground",
        difficulty="special",
        mode="other",
        variant_label="Each floor",
        drop_i=34,
        notes="Sheet: 12 CP each floor(!).",
    ),
    # Ueno Mirage
    stub(
        id="mirage-bronze",
        name="Ueno Mirage (Bronze)",
        instance_id=10901,
        cp=6,
        family="Ueno Mirage",
        difficulty="bronze",
        drop_i=35,
    ),
    stub(
        id="mirage-silver",
        name="Ueno Mirage (Silver)",
        instance_id=12904,
        cp=14,
        family="Ueno Mirage",
        difficulty="silver",
        drop_i=36,
        notes="Instance ID tentative.",
    ),
    stub(
        id="mirage-gold",
        name="Ueno Mirage (Gold)",
        instance_id=10901,
        cp=80,
        family="Ueno Mirage",
        difficulty="gold",
        drop_i=37,
        notes="Gold may share / differ instance — confirm. Sheet CP 80.",
    ),
    stub(
        id="mirage-astaroth",
        name="Ueno Mirage (Astaroth)",
        instance_id=10901,
        cp=80,
        family="Ueno Mirage",
        difficulty="special",
        mode="boss",
        variant_label="Astaroth",
        drop_i=38,
        notes="Boss-path instance ID TBD.",
    ),
    stub(
        id="mirage-ishtar",
        name="Ueno Mirage (True Ishtar)",
        instance_id=10901,
        cp=80,
        family="Ueno Mirage",
        difficulty="special",
        mode="boss",
        variant_label="True Ishtar",
        drop_i=39,
        notes="Boss-path instance ID TBD.",
    ),
    # Diaspora
    stub(
        id="diaspora-suginami",
        name="Diaspora Suginami",
        instance_id=7301,
        cp=120,
        family="Diaspora",
        difficulty="bronze",
        mode="diaspora",
        drop_i=40,
    ),
    stub(
        id="diaspora-shinagawa",
        name="Diaspora Shinagawa",
        instance_id=7601,
        cp=120,
        family="Diaspora",
        difficulty="bronze",
        mode="diaspora",
        drop_i=41,
    ),
    # Misc singles
    stub(
        id="ice-cave",
        name="Shinagawa Ice Cave",
        instance_id=10401,
        cp=10,
        family="Shinagawa Ice Cave",
        difficulty="bronze",
        drop_i=42,
    ),
    stub(
        id="tmg-lucifuge",
        name="TMG Building (Lucifuge)",
        instance_id=6601,
        cp=3,
        family="TMG Building",
        difficulty="bronze",
        mode="boss",
        variant_label="Lucifuge",
        drop_i=43,
        notes="Sheet bronze Lucifuge 3 CP.",
    ),
    stub(
        id="tmg-yantra",
        name="TMG Building (Yantra)",
        instance_id=6602,
        cp=45,
        family="TMG Building",
        difficulty="silver",
        mode="other",
        variant_label="Yantra",
        drop_i=44,
        notes="Sheet 45–90 CP + Yantra item. Using 45 as default; Yantra item ID TBD.",
    ),
    stub(
        id="old-tokyo-metro",
        name="Old Tokyo Metro",
        instance_id=6901,
        cp=20,
        family="Old Tokyo Metro",
        difficulty="bronze",
        drop_i=45,
        notes="6901 Ueno line; 6902 Shinagawa line also exists.",
    ),
    stub(
        id="home-ii",
        name="Home II (Dungeon)",
        instance_id=5301,
        cp=10,
        family="Home II",
        difficulty="bronze",
        drop_i=46,
    ),
    stub(
        id="ikebukuro-mall",
        name="Ikebukuro Mall",
        instance_id=9101,
        cp=14,
        family="Ikebukuro Mall",
        difficulty="bronze",
        drop_i=47,
        notes="Instance ID not confirmed in stock comments — placeholder 9101 (歪み nearby). Fix when known.",
    ),
    stub(
        id="amala-maze-black",
        name="Amala Maze Black",
        instance_id=9101,
        cp=2,
        family="Amala Maze",
        difficulty="bronze",
        mode="other",
        variant_label="Each floor",
        drop_i=48,
        notes="Sheet: 2 CP each floor. Instance ID TBD.",
    ),
    stub(
        id="distortion-floor",
        name="Distortion Floor",
        instance_id=9101,
        cp=80,
        family="Distortion Floor",
        difficulty="bronze",
        drop_i=49,
        notes="Sheet CP 80. Instance ID TBD (9101 is 歪み).",
    ),
    stub(
        id="yoidore",
        name="YOIDORE",
        instance_id=6428,
        cp=10,
        family="YOIDORE",
        difficulty="special",
        mode="other",
        variant_label="YOIDORE",
        drop_i=50,
        notes="Second sheet only. Instance ID tentative (天干地支の間 / event halls).",
    ),
]

skip = {"suginami-bronze"}
written = 0
for file in rows:
    pid = file["payout"]["id"]
    if pid in skip:
        continue
    path = out / f"{pid}.json"
    path.write_text(json.dumps(file, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    written += 1

# Tag live Phase 13 file with family metadata if present (do not change cp/hooks/enabled)
live = out / "suginami-bronze.json"
if live.exists():
    data = json.loads(live.read_text(encoding="utf-8"))
    p = data["payout"]
    p.setdefault("family", "Suginami Tunnels")
    p.setdefault("difficulty", "bronze")
    p.setdefault("mode", "normal")
    p.setdefault(
        "notes",
        "Phase 13 live (+10 CP). End Chests sheet lists 4 CP — keep Phase 13 value until you retune.",
    )
    live.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(f"Wrote {written} stub payouts → {out}")
print("Preserved/tagged suginami-bronze.json (Phase 13)")
PY

ls -1 "$OUT"/*.json | wc -l
ls -1 "$OUT"/*.json | head -20
