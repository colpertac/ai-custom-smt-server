# Armory catalogs

`devils.json` — demon type ID → display name, extracted from client
`BinaryData/Shield/DevilData.xml` (5302 entries).

Regenerate:

```bash
node --input-type=module <<'EOF'
# see extract snippet used in Phase 16E armory work
EOF
```

Skill display names are not in Shield `SkillData` (no CDATA names); armory
shows skill IDs until a message-table extract exists.

Expertise labels live in `website/lib/armory-catalogs.ts` (Constants.h.in).

## Character stat accuracy

The world SQLite DB stores **naked allocated stats** on `EntityStats` (STR/MAG/VIT
from level-ups). In-game totals are computed at runtime by the channel server
(`CharacterState::RecalculateStats`) and are **not** written back to SQLite as a
single “final sheet” number the website can read.

The website recomputes totals offline in `website/lib/armory-stats.ts`
(`computeArmoryTotalStats()`), using exported BinaryData catalogs under this
directory. Regenerate catalogs after content changes:

```bash
../scripts/wiki-export-armory-stats.sh
```

### Included in the website estimate

- Item `CorrectTbl` (basic + characteristic rows from wiki export)
- Tarot/Soul crystal tokusei, including LNC/level/expertise conditions and enchant sets
- Equipment set tokusei
- SItem special-effect tokusei
- Spirit fusion (`FuseBonuses` on equipped items)
- Learned passive + switch skills (switch skills assumed **on**)
- Expertise rank gates (skills above current rank treated as disabled)

Green `(base +bonus)` on `/armory/[name]` shows DB base vs the offline estimate.

### Still missing (common reasons armory &lt; in-game)

| Source | Why it is missing | Notes |
| --- | --- | --- |
| **Digitalize** | Requires live partner demon calc + `DigitalizeAssists`; only applies while digitalized | Often ~30% of partner demon stats; can explain tens of MAG/STR |
| **Equipment mod slots** | `ModSlots` are in DB but `ModifiedEffectData` / `ModificationExtEffectData` catalogs are not exported yet | See `CharacterState::RecalcEquipState` |
| **Demonic Compendium** | Tokusei from `CharacterProgress` compendium counts | `TokuseiManager` + `GetCompendiumTokuseiIDs` |
| **Quest / title / valuable bonuses** | Quest flags and titles not modeled | |
| **Session buffs & status effects** | Not persisted as stat totals | Buffs, resting Medical Sciences regen, etc. |
| **Catalog gaps** | Incomplete tokusei/skill export vs live datastore | Re-run export script after Shield/tokusei updates |

### Making stats match in-game

1. **Live stats (implemented)** — when the character is **online on channel**,
   the website calls `GET /armory/stats?name=…` on the channel studio HTTP
   port (same token as portrait studio). Returns post-`RecalculateStats` values
   including digitalize and buffs. Shown as **live** on the profile with a
   snapshot timestamp (may be stale until refresh).
2. **Extend offline calc** — mod slots + compendium are applied from exported
   catalogs. Digitalize, quest/title bonuses, and session buffs stay live-only.
   Regenerate catalogs: `scripts/wiki-export-armory-stats.sh`

Until live stats are available (character offline), treat totals as an
**estimate**.

