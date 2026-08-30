# Text source inventory

Generated starting point for Phase 8. Counts are from local installs on
2026-07-20; re-run `scripts/translation-inventory.sh` after client updates.

## Client roots

| Role | Path |
| --- | --- |
| Play / EN draft | `/home/cat/software/smt/game/reimagine` |
| JP source | `/home/cat/software/smt/game/smt_1666/MegaTen jp` |

## Volume (file counts)

| Category | Reimagine | Vanilla JP |
| --- | ---: | ---: |
| BinaryData/Client `*.bin`/`*.sbin` | 891 | 889 |
| BinaryData/Shield `*.sbin` | 135 | 135 |
| Event/MultiTalk `*.bin` | 3357 | 2951 |
| Event/PolygonMovie `*.bin` | 387 | 387 |
| `translation.xml` lines | ~22309 | (Reimagine-only runtime patch file) |

## Categories

### A. BinaryData / Client (unencrypted `.bin`)

High-value string tables:

- `CMessageData_*.bin` — UI/help (`cmessage`)
- `UIInfoData.bin` — UI strings
- `CMapData.bin`, `CBlockNameData.bin` — map/block names
- `CSkillData.bin`, `ExpertTitleData.bin` — skill/title display

### B. BinaryData / Shield (encrypted `.sbin`)

Names and descriptions:

- `CItemData.sbin`, `CKeyItemData.sbin` — items
- `DevilData.sbin` / related — demons
- `SkillData.sbin` — skills
- `QuestData.sbin`, `CQuestData.sbin` — quests
- `CMessageData*.sbin`, `CEventMessageData*.sbin`, `CHelpData.sbin`, `CGuideData.sbin`
- `CBattleTalk.sbin`, NPC barter / hourai message tables

Needs `comp_decrypt` before `comp_bdpatch load`.

### C. Event dialogue

- `Event/MultiTalk/BinaryData/CMultiTalkData_*.bin` (`cmultitalk`)
- `Event/PolygonMovie/BinaryData/CMovieData_*.bin` — cutscenes; message field length **260**

### D. Runtime exe patches (`translation.xml`) — separate track

Not BinaryData. Mix of:

- Match/replace tooltips / devil-force style rewrites
- Thousands of `<translation>` + `<patch-addr>` entries tied to the exact
  1.666-family `ImagineClient.exe`

Do not merge this into `comp_bdpatch` batches.

### E. Image-baked text

DDS / UI art with painted Japanese — deferred (asset replacement).

## Priority order (ROADMAP)

1. UI / help (`CMessageData_*`, `UIInfoData`)
2. Items / demons / skills (Shield tables)
3. Main story MultiTalk / movies
4. Quests / remaining flavor
5. `translation.xml` / image text

## Sample coverage check

`CMessageData_SysHelp.bin` flattened 2026-07-20:

| Client | Rows | Rows with CJK (heuristic) |
| --- | ---: | ---: |
| Reimagine | 124 | 2 |
| Vanilla JP | 124 | 123 |

SysHelp is mostly English on Reimagine; use as a **pipeline smoke table**, not
the main remaining-work queue.

## A0 coverage snapshot (2026-07-22)

Ranked CJK leftover counts (Reimagine): see
[`untranslated-backlog.md`](untranslated-backlog.md).

| Table | CJK / total (approx.) |
| --- | --- |
| `UIInfoData` | ~117 / 2832 | A1 high-traffic batch 2026-07-22 |
| `CMessageData_Shop` | 310 / 7367 | A1 core dialogue 2026-07-22; pitches remain |
| `CItemData` (names) | 8578 / 16584 |
| `CEventMessageData` | 17195 / 73338 |
| `CEventMessageData2` | 12429 / 44814 |

Vanilla JP **Shield** tables use `\x89XBF` (not `CHED`); `comp_decrypt` cannot
extract them yet. Client tables ID-pair normally.

## Concrete remaining-EN example (Izumi)

Beginner's Girl Izumi: English menus in `CEventMessageData`, but Macca tutorial
slideshow was JP in `CEventData` direction **9531** (translated 2026-07-20).
Magnetite direction **9541** translated 2026-07-23 — see
[batches/20260723-izumi-magnetite-direction-9541.md](../batches/20260723-izumi-magnetite-direction-9541.md).
