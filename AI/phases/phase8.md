# Phase 8 Notes

Started 2026-07-20.

See [translation/README.md](../translation/README.md),
[translation/inventory/sources.md](../translation/inventory/sources.md),
[translation/todo.md](../translation/todo.md), and
[guides/translation.md](../guides/translation.md).

## Bases

| Role | Path |
| --- | --- |
| Playable / EN draft | `/home/cat/software/smt/game/reimagine` |
| JP source of truth | `/home/cat/software/smt/game/smt_1666/MegaTen jp` |

## MVP (pipeline, not “full game EN”)

Goal: reproducible extract → edit → rebuild → disposable-client QA loop, plus
glossary + inventory. Measure coverage by table/file, not a vague percentage.

| Step | Status |
| --- | --- |
| Inventory sources | Done (initial) |
| Glossary stub | Done (`translation/glossary/terms.tsv`) |
| Extract script | Done (`scripts/translation-extract-table.sh`) |
| First table smoke (`CMessageData_SysHelp`) | Pipeline ready; table already ~EN on Reimagine |
| Izumi Macca slideshow (`CEventData` 9531) | Done — disposable `reimagine-phase8-izumi-test` |
| Lingo / terminology guide | Done (`translation/glossary/lingo.md`) |
| Izumi Magnetite slideshow (`CEventData` 9541) | Done 2026-07-23 — disposable `reimagine-phase8-mag9541-test` |
| UIInfoData high-traffic CJK | Done 2026-07-22 — disposable `reimagine-phase8-uiinfo-test` |
| `comp_translator` batch `build.nut` | Stub only |
| `translation.xml` | Deferred (separate track) |

## Commands

```bash
# Catalog
/home/cat/repos/smt/ai_custom_smt_server/scripts/translation-inventory.sh

# Extract one table from Reimagine + JP
/home/cat/repos/smt/ai_custom_smt_server/scripts/translation-extract-table.sh \
  cmessage Client/CMessageData_SysHelp.bin

# Shield example (decrypts automatically)
/home/cat/repos/smt/ai_custom_smt_server/scripts/translation-extract-table.sh \
  citem Shield/CItemData.sbin
```

## Deferred (polish / post-MVP)

- Full MultiTalk / PolygonMovie coverage
- AI draft batches + translation memory DB
- Machine checks for placeholders / length / encoding
- Address-tied `translation.xml` and image-baked UI text
- Shipping via updater overlay → [phase9.md](phase9.md) (pipeline started)
