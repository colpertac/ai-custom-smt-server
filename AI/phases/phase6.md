# Phase 6 Notes

Completed 2026-07-20 (minimal POC). Apple compress/decompress **deferred**
2026-07-22 → Phase 10 (`comp_client` compressors patch) + Phase 17A (true
custom item icon). See [ROADMAP.md](../ROADMAP.md).

## What remains active

Data-driven **CurrencyCompressor** mappings from `/data/compressors`:

| ID | Base | Compressed | Value |
|---:|---:|---:|---:|
| 1 | Macca `799` | Note `699` | 50000 (stock) |
| 2 | Mag `800` | Presser `27375` | 50000 (stock) |

`AutoCompressCurrency=true` still compresses Macca/Mag only.

## Deferred — Magical Golden Apple

| ID | Base | Compressed | Value |
|---:|---:|---:|---:|
| 900001 | Magical Golden Apple `21941` | Compressed `900003` | 50000 |

**Why deferred:** Note/Presser yes/no use is client-hardcoded. Custom
`900003` (Mag Presser clone / placeholder icon) showed as missing inventory
slots on the Phase 8 client. Stock `21941` remains a material-tank valuable
and should be used as-is until Phase 10/17A.

Item/skill/GiftDropSet definitions for `900003` / skill `900001` / drop
`900002` are retained in BinaryData overlays for later; the apple
`CurrencyCompressor` entry is removed from `zzz_ai_custom_phase6.zip`.

## Distribution

| Role | Path |
| --- | --- |
| Stock Macca/Mag | `datastore/data/compressors/00_stock.xml` |
| Package | `zzz_ai_custom_phase6.zip` (apple compressor disabled) |

## In-game smoke checklist

1. `@item 799 50000` → one Macca Note
2. `@item 800 50000` → one Mag Presser
3. `@item 21941 N` → Magical Golden Apples (visible, grayed/material tank) — **no** auto-compress
4. Phase 1 `@zone 90102` loot still drops Note + Token

## Deferred follow-ups

- Phase 10: client `<compressors>` patch for custom decompress dialogs
- Phase 17A: true compressed-apple icon / model
- Mag Presser pay-time break (Macca-style)
- ShopSell / Bazaar mapping table
