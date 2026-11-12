# Armory catalogs

`devils.json` — demon type ID → display name, race, LNC, base level/stats, and
resist letters. Live copies are written by wiki export from uploaded
`BinaryData/Shield/DevilData.sbin` (`{runtime}/wiki/devils.json`). This file is
the bundled fallback and is refreshed when that export can see
`website/content/armory`.

Resist cells use damage multipliers as decimals (`0.75`, `0.5`, `2`) or
`nu`/`rp`/`dr` for null/repel/drain (from CorrectTbl RES_* / NRA_*). Affinity
header icons live in `website/public/wiki/affinity/`. Demon portraits are
generated locally from `DevilData.modelID` → `CModelData.model` mesh
(`D2_04_007a_Base` → `icon_D2_04_007a.tga`) via
`scripts/wiki-export-devil-icons.sh` / ops wiki export into
`website/public/wiki/devil-icons/` (gitignored — proprietary client assets;
never commit). Paths come from `OPS_RUNTIME` BinaryData (and optional
`CLIENT_TGA` / `OPS_CMODEL_EXTRA`); missing models or TGAs leave the icon
blank. Do not key icons off `17000 + demonId` in `CIconData_Devil`.

Stats are base CorrectTbl values at the demon’s `baseLevel` (before growth).

Skill display names come from Client `CSkillData.bin` via wiki export
(`website/content/wiki/skills.json`, `{runtime}/wiki/skills.json`). Skill UI
icons are generated locally from `CSkillData.iconID` → `CIconData_Skill.value`
→ `Interface/tga/{value}.tga` via `scripts/wiki-export-skill-icons.sh` into
`website/public/wiki/skill-icons/` (gitignored — proprietary client assets;
never commit). Missing TGAs leave the icon blank.

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

- Passive/switch skill charastic tokusei (`passive-skills.json` `tokuseiIds`)
- Tokusei target/conditions/attributes from `tokusei-effects.json`
  (`lib/armory-tokusei.ts`): PARTNER and skill-conditioned tokusei are skipped,
  PARTY tokusei need a party (offline = solo), partner/party/status/time
  conditions evaluate as false offline
- Combat bonuses strip (CRITICAL, FINAL_CRIT_CHANCE, LB_CHANCE, LB_DAMAGE,
  CHANT_TIME/COOLDOWN_TIME with INT/VIT/SPD, and TECH/PURSUIT/LIMIT_BREAK_MAX
  aspect sums) via `computeArmoryEstimate()`

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

