# SMT: IMAGINE lingo / localization glossary

Use this when translating so names stay consistent with Reimagine English
and community usage. Expanded by the **A0 Reimagine terminology research pass**
(2026-07-22). Companion files:

- [`terms.tsv`](terms.tsv) — machine-readable preferred forms
- [`research-pairs.tsv`](research-pairs.tsv) — ID-cited JP↔EN evidence rows

## How to use

1. Prefer an existing Reimagine English string if one already appears in
   `CEventMessageData` / UI / item tables (cite ID below).
2. Otherwise pick the entry below and stick to it for the whole batch.
3. Do not invent alternate spellings of shop/NPC brands mid-batch.
4. Never invent EN for JP proper nouns without Reimagine (or paired) evidence.

## Evidence method (A0)

| Source | Role |
| --- | --- |
| Reimagine Shield `CEventMessageData` / `2` | Preferred EN + bilingual leftovers (JP still present) |
| Reimagine Shield `CItemData` | Item display names / descriptions |
| Client `UIInfoData` + `CMessageData_*` | JP↔EN **same record ID** pairs (vanilla JP Client vs Reimagine) |
| Vanilla JP Shield `*.sbin` | **Blocked:** files use `\x89XBF` magic; `comp_decrypt` only handles `CHED`. No ID-paired JP Shield dump this pass. |

Counts below are substring hits in Reimagine extracts unless noted.

## Currency & economy

| Preferred EN | JP | Reimagine evidence |
| --- | --- | --- |
| Macca | マッカ | Event msgs: **Macca** 360 / **マッカ** 253 (`CEventMessageData`+`2`). UI ID `18107`/`20046`: 必要マッカ → **Macca Cost**; `20048`: マッカが不足しています → **Not enough Macca**. Event `324`: “You don't have enough Macca.” Item `799` name: **Macca**. |
| Paper Currency (50,000 Macca) | マッカ紙幣 | Item `699` name is **Paper Currency (50,000 Macca)** (desc: circulated by Yagiya). Event leftover **マッカ紙幣** (e.g. `149820`). String **Macca Note**: **0** hits — do not invent “Macca Note”. |
| Magnetite | マグネタイト | Event: **Magnetite** 118 / **マグネタイト** 98. Item `800` name: **Magnetite**. |
| MAG Presser α | マグ圧縮機 | Item `27375` name: **MAG Presser α**. Event e.g. `205137`: “Mag Presser α”. Keep Reimagine spelling/casing. |
| Magical Golden Apple | マジックゴールデンアップル | Item `21941`; event hits for “Magical Golden Apple” / “Golden Apple”. |
| **Soul Stone** | 魂合石 | Item family: EN peers `7918`/`7921` **Soul Stone: Supreme Palace Encl.** Never **Soul Union**. Enclosures: 太微垣→Supreme Palace; 紫微垣→Purple Forbidden (UI short **Purple Forb.**); 天市垣→Heavenly Market (UI short **Heavenly Mkt**). |
| Otherworldly Magnetite | 異界マグネタイト | Item `12922` (slice 2); peers Pure/Altered Magnetite. |

## Shops & facilities

| Preferred EN | JP | Reimagine evidence |
| --- | --- | --- |
| **Yagiya** | 山羊屋 | Event: **Yagiya** 126 / **山羊屋** 103. Shop greeting `43200`: “My friend, welcome to the Yagiya!” Item leftovers e.g. `21476`… still JP 山羊屋… **Goat Shop**: **0** hits — never use. |
| Yagi | ヤギ | Goat-like NPCs / proprietors; often appears inside “Yagiya” EN strings. Prefer **Yagiya** for the shop brand. |
| **Cathedral of Shadows** | 邪教の館 | Event: **Cathedral of Shadows** 17 / **邪教の館** 28. `50801`: “Welcome to the Cathedral of Shadows…”; Izumi `200247`. **Pavilion of Heresy**: **0** hits (tutorial art may still use `pavilion_of_heresy.dds`). |
| Master of the Cathedral of Shadows | 邪教の主 | Event e.g. `3611`, `162208`. JP leftover `202073`… |
| COMP Shop | COMPショップ | Event EN `100752` / JP leftover `193175`. |
| Demon Depository | 悪魔倉庫 | UI `22017`: 悪魔倉庫 → **Demon Depository**. Event EN `30` (“Demon depository”); JP leftover `40014`. |
| Spiritual Infusion / Separation | 物霊合体 / 物霊分離 | UI “Spiritual Infusion”; A1 ID `1000` → **Spiritual Separation** |
| Material Tank | 原料タンク | System msg 965; A1 ID `2103` |

## Places

| Preferred EN | JP | Reimagine evidence |
| --- | --- | --- |
| Home III | （JP form rare in leftover msgs） | Event **Home III** 67 hits (e.g. protect Home III). Exact ホームIII/Ⅲ: 0 in `CEventMessageData` this extract — do not invent JP spelling without a hit. |
| Suginami | 杉並 | Event **Suginami** 114 / **杉並** 2 (e.g. `1007` Suginami Tunnels Plate). |
| Beginner's Zone | 初心者ゾーン | Event `200000`: “Welcome to the Beginner's Zone”. |
| Tokyo / Toukyou | トウキョウ / 東京 | EN **Tokyo** common; JP leftover **トウキョウ** (e.g. `200740` family) and rare **東京**. Prefer **Tokyo** in new EN unless quoting in-world kana brand. |

## Gameplay / roles

| Preferred EN | JP | Reimagine evidence |
| --- | --- | --- |
| COMP | COMP | Keep as COMP (UI + events; same on both clients for many IDs). |
| Demon | 悪魔 | Prefer **Demon** in player-facing EN (“Devil” mainly in BinaryData type names). Event bilingual leftovers remain. |
| Negotiation | 交渉 | Tutorial-style EN e.g. `309`; JP leftovers e.g. `111339`. |
| Demon Buster | デビルバスター | Event **Demon Buster** 218 / **デビルバスター** 96. |

## Style notes

- Tutorials (`CEventData` / EventDirection): **132-byte** text fields (cp932).
- Keep 『』 brand emphasis as quotes or bare proper nouns in EN as Reimagine does.
- “Goat Shop” → **Yagiya**. Literal JP facility name → **Cathedral of Shadows**, not “Pavilion of Heresy”.
- Compressed Macca item → **Paper Currency (50,000 Macca)** (item `699`), not “Macca Note”.

## Explicit inconsistent Reimagine leftovers

Same tables still contain **both** preferred EN and untranslated JP for the same brands
(partial localization). Treat EN hits as canonical; schedule JP leftovers in the
untranslated backlog — do not invent a third EN spelling.

| Term | Example table | EN count | JP count | Sample EN IDs | Sample JP IDs |
| --- | --- | --- | --- | --- | --- |
| Cathedral of Shadows / 邪教の館 | `CEventMessageData` | 14 | 25 | 3611, 50801 | 105188, 204266 |
| Yagiya / 山羊屋 | `CEventMessageData` | 52 | 90 | 43200, 43202 | 106839, 203131 |
| Macca / マッカ | `CEventMessageData` | 297 | 166 | 324, 342 | 200825… |
| Magnetite / マグネタイト | `CEventMessageData` | 106 | 33 | 25209… | 204165… |
| Demon Buster / デビルバスター | `CEventMessageData` | 171 | 51 | 162… | 101512… |
| Demon Depository / 悪魔倉庫 | UI + events | UI paired | leftover `40014` | UI `22017` | `40014` |

Full ID rows: [`research-pairs.tsv`](research-pairs.tsv). Ranked remaining JP:
[`../inventory/untranslated-backlog.md`](../inventory/untranslated-backlog.md).
Batch note: [`../batches/20260722-reimagine-terminology-a0.md`](../batches/20260722-reimagine-terminology-a0.md).
