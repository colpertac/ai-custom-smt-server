# Untranslated backlog (ranked)

Generated **2026-07-22** by A0 Reimagine terminology research.
Heuristic: row still contains CJK (hiragana/katakana/kanji) in Reimagine extracts.

**Playable base:** Reimagine. Prefer existing Reimagine EN; do not invent proper nouns.

## Rank summary

| Priority | Bucket | Table | CJK rows | Total rows | Notes |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | UI labels | `Client/UIInfoData` | ~117 | 2832 | A1 batch 2026-07-22 cleared 172 high-traffic IDs; leftovers are mostly placeholders / long-tail |
| 2 | UI/shop copy | `Shield/CMessageData_Shop` | 0 | 7367 | A1 done (core + pitches 2026-07-24) |
| 3 | Item names | `Shield/CItemData` | ~579 | 16584 | Slices 1–12 (through accessories) |
| 4 | Event dialogue | `Shield/CEventMessageData` | 17195 | 73338 | Includes brand leftovers (Yagiya, Cathedral, Macca…) |
| 5 | Event dialogue 2 | `Shield/CEventMessageData2` | 12429 | 44814 | Same pattern |
| — | UI core help | `Client/CMessageData_SysHelp` | 2 | 123 | Nearly done (smoke table) |
| — | UI help | `Client/CMessageData_{basicCommandHelp,IFCommandHelp,yorosiku}` | 0 | 270 | Done on Reimagine |
| — | UI misc | `Shield/CMessageData`, `_System` | 8 | 4307 | Almost clean |

## 1 — UI (`UIInfoData`)

**Why first:** Short strings, shared IDs with vanilla JP Client.

**A1 progress (2026-07-22):** High-traffic shop/fusion/COMP/economy/inventory
labels shipped — see
[`batches/20260722-uiinfodata-high-traffic.md`](../batches/20260722-uiinfodata-high-traffic.md).
CJK heuristic **289 → ~117**. Remaining are largely placeholders and long-tail
panels; clear after human review of that batch.

Suggested next UI pass: leftover real labels only, then Priority 2
`CMessageData_Shop` (await review).

## 2 — Shop UI (`CMessageData_Shop`)

**Done (2026-07-24):** Core dialogue + pitch lines — CJK **0**.
Skim review: [`batches/20260724-shop-pitches-EN-review.md`](../batches/20260724-shop-pitches-EN-review.md).

## Workflow note (fast mode)

Prefer bulk EN + readable review files over disposable-client NPC verification.
Semi-coherent glossary-aware EN for gist > leaving JP.

## 3 — Items (`CItemData`)

~**579** CJK **names** remain after slices 1–12.

**Slice 1–4:** tickets, Soul Stone, Demon gear, Epitaph — see prior batch notes.

**Slice 5:** Dark Tokens / Myriad·Hegemon seals / Crystallized Spirit —
[`batches/20260724-citemdata-slice5.md`](../batches/20260724-citemdata-slice5.md).

**Slice 6:** α/β costumes / Maga Souls / related tickets —
[`batches/20260724-citemdata-slice6.md`](../batches/20260724-citemdata-slice6.md).

**Slice 7:** remaining `【】` brackets (candy, Secret gear, Demon Ema, Fleur Drop, …) —
[`batches/20260724-citemdata-slice7.md`](../batches/20260724-citemdata-slice7.md).

**Slice 8:** non-α outfits (High-Law, clergy, hair, D3/Rx, costume peers) —
[`batches/20260724-citemdata-slice8.md`](../batches/20260724-citemdata-slice8.md).

**Slice 9:** remaining tickets —
[`batches/20260724-citemdata-slice9.md`](../batches/20260724-citemdata-slice9.md).

**Slice 10:** weapons (cats 4–13, 27) —
[`batches/20260724-citemdata-slice10.md`](../batches/20260724-citemdata-slice10.md).

**Slice 11:** equip slots head/body/hands/feet/back/face —
[`batches/20260724-citemdata-slice11.md`](../batches/20260724-citemdata-slice11.md).

**Slice 12:** accessories (cat 18) —
[`batches/20260724-citemdata-slice12.md`](../batches/20260724-citemdata-slice12.md).

**Slice 13:** misc/quest (cat 24) —
[`batches/20260724-citemdata-slice13.md`](../batches/20260724-citemdata-slice13.md).

**Slice 14:** consumables (cat 1) —
[`batches/20260724-citemdata-slice14.md`](../batches/20260724-citemdata-slice14.md).

**Slice 15:** COMP (20) + leftovers —
[`batches/20260724-citemdata-slice15.md`](../batches/20260724-citemdata-slice15.md).
**CItemData `name` CJK = 0.**

Note: `name`/`name2` **< 36 bytes cp932**.

Batch guidance:

1. ~~Tickets / Yagiya / incense~~ slice 1.
2. ~~Soul Stone / memos~~ slice 2.
3. ~~Demon-partner gear / licenses~~ slice 3.
4. ~~Epitaph leftovers~~ slice 4.
5. ~~Materials / seals / crystals~~ slice 5.
6. ~~α/β costumes~~ slice 6.
7. ~~Bracketed leftovers~~ slice 7.
8. ~~Non-α outfits~~ slice 8.
9. ~~Tickets~~ slice 9.
10. ~~Weapons~~ slice 10.
11. ~~Equip slots~~ slice 11.
12. ~~Accessories~~ slice 12.
13. ~~Misc/quest~~ slice 13.
14. ~~Consumables~~ slice 14.
15. ~~COMP + leftovers~~ slice 15 — **done**.

**Blocker for JP↔EN ID pairing vs vanilla:** JP Shield `CItemData.sbin` is `\x89XBF`
(not `CHED`); `comp_decrypt` cannot load it. Pairing this pass uses Reimagine-only
CJK leftovers + Client UI pairs.

## 4–5 — Event messages

| Table | CJK | Total |
| --- | ---: | ---: |
| `CEventMessageData` | 17195 | 73338 |
| `CEventMessageData2` | 12429 | 44814 |

Rank inside events by **player traffic**, not raw count:

1. Beginner / Izumi tutorials — Macca `9531` and Mag `9541` slideshows done;
   COMP Shop / Depositories directions may remain.
2. Hub shops (Yagiya / Cathedral) — many JP leftovers beside EN (see `lingo.md` inconsistent table).
3. Main quest MultiTalk / movies (separate files; not flattened this pass).
4. Seasonal / long-tail NPC flavor.

Known EN anchors to keep consistent while clearing leftovers:

- `200000` Beginner's Zone welcome
- `50801` / `200247` Cathedral of Shadows
- `43200` Yagiya welcome
- `324` Not enough Macca

## Already healthy (low priority)

- SysHelp / command help / yorosiku Client tables — essentially English on Reimagine.
- `CMessageData` / `_System` Shield — only a handful of CJK rows.

## Out of scope this file

- `translation.xml` exe patches
- Image-baked DDS text
- Full MultiTalk / PolygonMovie inventory (run inventory script when starting story batches)

## Next human actions

1. Review top ~50 terms in `glossary/lingo.md` / `terms.tsv`.
2. Ship UIInfoData residual CJK batch using `research-pairs.tsv`.
3. Mag tutorial direction `9541` (manual batch; not part of A0).
4. Optional: XBF decrypt support so vanilla JP Shield can ID-pair items/events.
