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

## Clear-loot wire catalog

```bash
python3 scripts/payout-scan-clear-loot.py
```

Scans channel `datastore/events/*.xml` for `ActionCreateLoot isBossBox` clear
events, cross-checks payout JSON hooks, and writes
`server-content/payouts/clear-loot-catalog.json`.

`/admin/payouts` reads that file to show **live-wired** vs **unwired stub**:

- **wired** — stock loot `next` already points at the payout `AFTER_*` hooks
  (today: Suginami bronze / Phase 13 splice).
- **unwired stub** — editing CP only updates JSON; beating the dungeon will
  not grant CP until stock hooks are patched (and catalog refreshed).

Enable is blocked for unwired payouts (API + UI).

**Preserved / migrated:** `suginami-bronze.json` — Phase 13 originally lived in
`zzz_ai_custom_phase13.zip` (DropSet `900003`, CP 10). That DropSet ID
**conflicts** with Lane A publish, so the admin editor could not ship CP
changes. Working copy now uses DropSet **`901100`**; disable or remove the
Phase 13 package before publishing, or channel will fail on duplicate
`AI_P13_5401_*` event IDs.

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
