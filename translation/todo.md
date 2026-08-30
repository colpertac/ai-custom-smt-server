# Translation backlog

Human-maintained task list for Phase 8. Not the ROADMAP — this is day-to-day
translation work.

## Mini-project: Reimagine terminology agent (proposed)

**Problem:** Reimagine is ~partially translated. Game-specific vocab (`マッカ`,
`山羊屋`, `邪教の館`, COMP jargon) will not appear in normal Japanese
dictionaries. Hand-translating line-by-line without a corpus leads to mistakes
(e.g. inventing “Pavilion of Heresy” when Reimagine uses **Cathedral of
Shadows** — confirmed: 0 vs 36 hits in `CEventMessageData`).

**Goal:** One research pass that builds an evidence-backed
[`glossary/lingo.md`](glossary/lingo.md) + [`glossary/terms.tsv`](glossary/terms.tsv)
from what Reimagine _actually_ did, plus a ranked backlog of still-JP strings.

### Agent / research scope

1. **Extract** text from Reimagine + vanilla JP (`smt_1666/MegaTen jp`):
   - `CEventMessageData` / `CEventMessageData2` (Shield)
   - `UIInfoData`, `CMessageData_*` (Client)
   - `CItemData`, `DevilData`, `SkillData` (names/descriptions)
   - Sample `CEventData` / MultiTalk for cutscenes (later pass)
2. **Pair by record ID** where both clients share IDs → JP ↔ EN glossary rows
   with source file + ID citation.
3. **Mine Reimagine-only EN** where JP sibling line still exists in the same
   record (bilingual leftovers) → preferred terminology.
4. **Flag game-only terms** — do not trust generic MT/dictionaries for these.
5. **Output artifacts:**
   - Updated `glossary/lingo.md` (narrative + usage notes)
   - Updated `glossary/terms.tsv` (machine-readable)
   - `glossary/research-pairs.tsv` (optional: id, jp, en, source, confidence)
   - `inventory/untranslated-backlog.md` (ranked: UI → tutorials → quests → flavor)

### Acceptance (MVP for the agent pass)

- [x] At least **event messages + UI + item names** covered
- [x] Every lingo entry cites **Reimagine evidence** (file + ID or count), not guesswork
- [x] Explicit list of **inconsistent** Reimagine strings (JP left alongside EN)
- [x] No copyrighted client binaries committed — extracts stay gitignored under
      `translation/extract/`

Done 2026-07-22 — see [`batches/20260722-reimagine-terminology-a0.md`](batches/20260722-reimagine-terminology-a0.md),
[`glossary/research-pairs.tsv`](glossary/research-pairs.tsv),
[`inventory/untranslated-backlog.md`](inventory/untranslated-backlog.md).

**Note:** Vanilla JP Shield (`\x89XBF`) could not be decrypted with `comp_decrypt`
(`CHED` only). Event/item JP↔EN for Shield used Reimagine bilingual leftovers +
item CJK leftovers; Client UI was fully ID-paired vs vanilla JP.

### After the agent pass

- [ ] Human review top ~50 high-traffic terms (Macca, Yagiya, Cathedral, zones)
- [ ] Use glossary for manual batches (COMP Shop / Depositories Izumi directions, etc.)
- [ ] Consider automation: “untranslated CJK heuristic” script per table
- [ ] Optional: XBF decrypt for vanilla JP Shield ID pairing

---

## In progress / done (manual batches)

- [x] Izumi Macca tutorial — `CEventData` direction `9531`
      ([batch note](batches/20260720-izumi-macca-direction-9531.md))
- [x] Izumi Magnetite tutorial — direction `9541`
      ([batch note](batches/20260723-izumi-magnetite-direction-9541.md));
      QA client `reimagine-phase8-mag9541-test`
- [x] Glossary after A0 — [`glossary/lingo.md`](glossary/lingo.md) + [`glossary/terms.tsv`](glossary/terms.tsv)
- [x] A1 UIInfoData high-traffic CJK — 172 IDs
      ([batch note](batches/20260722-uiinfodata-high-traffic.md));
      QA client `reimagine-phase8-uiinfo-test` — **awaiting review** before Shop/items/9541
- [x] A1 CMessageData_Shop core vendor dialogue — 420 IDs
      ([batch note](batches/20260722-cmessagedata-shop-core.md))
- [x] A1 CMessageData_Shop pitch lines — 310 IDs / 104 unique
      ([skim EN](batches/20260724-shop-pitches-EN-review.md),
      [batch note](batches/20260724-cmessagedata-shop-pitches.md));
      shop table CJK now **0**
- [x] A1 CItemData slice 1 — tickets / incense / Yagiya — **258** names
      ([skim EN](batches/20260724-citem-slice1-EN-review.md),
      [resolved](batches/20260724-citem-slice1-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice1.md));
      CJK names ~**4406** left
- [x] A1 CItemData slice 2 — Soul Stone / memos — **126** names
      ([skim EN](batches/20260724-citem-slice2-EN-review.md),
      [resolved](batches/20260724-citem-slice2-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice2.md));
      CJK names ~**4291** left; slice-1 Soul Union tickets → **Soul Stone**
- [x] A1 CItemData slice 3 — Demon gear / licenses — **186** names
      ([skim EN](batches/20260724-citem-slice3-EN-review.md),
      [resolved](batches/20260724-citem-slice3-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice3.md));
      CJK names ~**4105** left
- [x] A1 CItemData slice 4 — Epitaph Parts/Heart/Piece — **270** names
      ([skim EN](batches/20260724-citem-slice4-EN-review.md),
      [resolved](batches/20260724-citem-slice4-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice4.md));
      CJK names ~**3835** left
- [x] A1 CItemData slice 5 — materials / seals / crystals — **446** names
      ([skim EN](batches/20260724-citem-slice5-EN-review.md),
      [resolved](batches/20260724-citem-slice5-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice5.md));
      CJK names ~**3389** left
- [x] A1 CItemData slice 6 — α/β costumes — **472** names
      ([skim EN](batches/20260724-citem-slice6-EN-review.md),
      [resolved](batches/20260724-citem-slice6-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice6.md));
      CJK names ~**2917** left
- [x] A1 CItemData slice 7 — bracketed leftovers — **191** names
      ([skim EN](batches/20260724-citem-slice7-EN-review.md),
      [resolved](batches/20260724-citem-slice7-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice7.md));
      CJK names ~**2726** left
- [x] A1 CItemData slice 8 — non-α outfits — **1029** names
      ([skim EN](batches/20260724-citem-slice8-EN-review.md),
      [resolved](batches/20260724-citem-slice8-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice8.md));
      CJK names ~**1697** left
- [x] A1 CItemData slice 9 — tickets — **119** names
      ([skim EN](batches/20260724-citem-slice9-EN-review.md),
      [resolved](batches/20260724-citem-slice9-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice9.md));
      CJK names ~**1578** left
- [x] A1 CItemData slice 10 — weapons — **335** names
      ([skim EN](batches/20260724-citem-slice10-EN-review.md),
      [resolved](batches/20260724-citem-slice10-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice10.md));
      CJK names ~**1243** left
- [x] A1 CItemData slice 11 — equip slots — **386** names
      ([skim EN](batches/20260724-citem-slice11-EN-review.md),
      [resolved](batches/20260724-citem-slice11-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice11.md));
      CJK names ~**857** left
- [x] A1 CItemData slice 12 — accessories — **278** names
      ([skim EN](batches/20260724-citem-slice12-EN-review.md),
      [resolved](batches/20260724-citem-slice12-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice12.md));
      CJK names ~**579** left
- [x] A1 CItemData slice 13 — misc/quest — **298** names
      ([skim EN](batches/20260724-citem-slice13-EN-review.md),
      [resolved](batches/20260724-citem-slice13-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice13.md));
      CJK names ~**281** left
- [x] A1 CItemData slice 14 — consumables — **132** names
      ([skim EN](batches/20260724-citem-slice14-EN-review.md),
      [resolved](batches/20260724-citem-slice14-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice14.md));
      CJK names ~**149** left
- [x] A1 CItemData slice 15 — COMP + leftovers — **149** names
      ([skim EN](batches/20260724-citem-slice15-EN-review.md),
      [resolved](batches/20260724-citem-slice15-UNCONFIDENT.md),
      [batch note](batches/20260724-citemdata-slice15.md));
      CJK names **0** — **CItemData names done**

## Conventions

- Playable base: `/home/cat/software/smt/game/reimagine`
- JP source: `/home/cat/software/smt/game/smt_1666/MegaTen jp`
- Prefer Reimagine EN when it exists; never invent EN for JP proper nouns without evidence
- **Yagiya** not “Goat Shop”; **Cathedral of Shadows** not “Pavilion of Heresy”
- Compressed Macca item: **Paper Currency (50,000 Macca)** (item `699`), not “Macca Note”
- **Item name byte cap:** `CItemData` `name`/`name2` must be **< 36 bytes cp932**;
  shorten (`XP`, `NT`, `Depo`) or Reimagine-style `~` truncate
- **Fast mode (2026-07-24+):** bulk EN + skim review markdown preferred over
  disposable-client NPC hunts; semi-coherent glossary-aware EN for gist is OK
- **Review filter:** only surface **unconfident** lines (dialect, intentional bad
  grammar, ALL-CAPS caveman, jokes/gags, uncertain proper nouns). Confident
  boilerplate can skip human skim.
- **Auto-resolve unconfident first:** before asking a human, wire context
  (shop `MerchantDescription` → product; item peers; glossary). Prefer matching
  existing Reimagine EN over free translation. Write a short resolved log
  (human list empty/minimal) instead of a long unconfident queue when possible.
