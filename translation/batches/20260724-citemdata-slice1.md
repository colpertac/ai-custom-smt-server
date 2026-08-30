# 2026-07-24 — CItemData slice 1 (tickets / incense / Yagiya)

Fast mode. Glossary-first item **names** (+ key JP **descs**).

## Scope

| | |
| --- | --- |
| Table | `Shield/CItemData.sbin` |
| Slice | Coupons / Data Tickets / depository passes / incense / Yagiya gift+privilege |
| Rows patched | **258** names (115 shortened to fit byte cap) |
| Descs patched | Incense, Non-Trade depo passes, Yagiya gift certificates + privilege passes |
| CJK names left (XML) | **~4406** |

## Constraint (new)

`name` / `name2` max **35 bytes cp932** (`comp_bdpatch`: under 36). Match Reimagine `~` truncation and short forms (`Incense of XP`, `NT`, `Item Depo Pass` when needed).

## Patterns used

| JP | EN |
| --- | --- |
| 山羊屋…商品券 | **Yagiya** Xmas Gift Cert. (branch) |
| 山羊屋共通優待券 | **Yagiya Privilege Pass** (N Day) |
| アイテム/悪魔倉庫券 | **Item/Demon Depository Pass** (…, NT) |
| 経験/力/…の香 | **Incense of XP/Strength/…** (Reimagine peers) |
| 引換券 + COMP load | **Data Ticket (…) / Data Select Ticket** |
| 邪教の館 (in desc) | **Cathedral of Shadows** |

## Review

- Full list: [`20260724-citem-slice1-EN-review.md`](20260724-citem-slice1-EN-review.md)
- Auto-resolved log: [`20260724-citem-slice1-UNCONFIDENT.md`](20260724-citem-slice1-UNCONFIDENT.md) (human list empty)

## Next slice ideas

1. Consumables / key progression (ointments, bullets, fusion fodder still JP)
2. `魂合石` family (align with provisional **Soul Union** ticket EN)
3. α costume / gear long-tail
