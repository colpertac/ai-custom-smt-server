# Dungeon payouts (Phase 16D)

Stable JSON working copies edited by `/admin/payouts`. Export downloads a zip of
generated Event + DropSet XML for package install — the website does **not**
mutate live runtime/datastore.

## Seed catalog

```bash
./scripts/payout-seed-catalog.sh
```

Seeds **~50** stubs from a private-server “End Chests CP” reference sheet
(Suginami / Celu / Quartz / Ichigaya / Catacomb / Zhu Que / Nakano / Mirage /
Diaspora / Ice / TMG / Metro / Home II / extras). Almost all are **`enabled:
false`** until you wire stock event hooks and retune.

**Preserved:** `suginami-bronze.json` — Phase 13 live (+10 CP, DropSet
`900003`, flag `900013`). Sheet listed 4 CP; we keep Phase 13 until you change
it.

Stub DropSet / flag IDs use project range **`901101+` / `901201+`** (see
`docs/ids.md`).

Some instance IDs and boss-path mappings are tentative — see each file’s
`notes`. Coral / Yantra / summon-orb item IDs are left empty (`clearItems: []`)
until identified.

## Install

1. Tune CP / crates / clear items (Enabled is optional tracking).
2. Download package zip from the admin UI (single payout or **Download all**).
3. Install under channel `datastore/packages/` (same pattern as Phase 13).
4. Ensure stock dungeon loot events `next` into the payout’s `AFTER_*` hook
   IDs (one-time datastore patch).
5. Restart channel / reload content.

## Env

`COMP_PAYOUTS_DIR` — override working-copy directory (default
`server-content/payouts` relative to the website).
