# Clear-loot dictionary

Machine-readable map of dungeon **boss clear loot** events and how they
relate to `/admin/payouts` stubs.

## Regenerate

```bash
python3 ai_custom_smt_server/scripts/payout-scan-clear-loot.py
```

Output: `ai_custom_smt_server/server-content/payouts/clear-loot-catalog.json`

## Wire confident families

```bash
python3 ai_custom_smt_server/scripts/payout-wire-families.py --list
python3 ai_custom_smt_server/scripts/payout-wire-families.py --enable
python3 ai_custom_smt_server/scripts/payout-scan-clear-loot.py
```

Assigns shared `AI_PAY_<FAMILY>_AFTER_NORMAL/FIEND` hooks, patches stock
clear-loot `next`, and optionally enables payouts. Low-confidence stubs are
reported and left unwired (“not mapped yet”).

## What it contains

| Section | Meaning |
| --- | --- |
| `clearLootEvents` | Every event object with `ActionCreateLoot` / `isBossBox=true` |
| `zoneInstances` | Instance ID → lobby / zones (no clear-event field in stock data) |
| `payouts` | Snapshot of admin payout JSON metadata |
| `wireStatus` | Per-payout: `wired` / `unwired_stub` / … + issues |

## Verified findings (regen 2026-08-26)

- **489** clear-loot events across channel event XML.
- **51** payouts; **10 live-wired** (enabled): Suginami bronze/silver/gold,
  Celu bronze/silver/gold, Quartz bronze/silver/gold, Mirage silver.
- Suginami shared splice (off Phase 13 IDs):
  - `D54_540101_540X_NORMAL_LOOT` → `AI_PAY_SUGINAMI_AFTER_NORMAL`
  - `D54_540101_540X_FIEND_LOOT` / `_BC` → `AI_PAY_SUGINAMI_AFTER_FIEND`
  - Dispatcher branches on instance `5401` / `5402` / `5403`.
- Lane A packages **one** shared AFTER XML per family + per-tier bonus/DropSet.
- Catalog stubs with `resumeNormalNext: TODO_STOCK_RESUME_EVENT` cannot pay
  out on clear until stock `next` is patched.

## UI

`/admin/payouts` badges **wired** / **not mapped** from this catalog. Enable is
blocked for payouts that are not live-wired. Validate fails if an enabled
payout’s AFTER ID is not the `next` of any stock clear-loot event.
