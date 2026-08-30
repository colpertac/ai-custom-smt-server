# Translation workspace

Human-editable translation sources and tooling for Phase 8.

**Playable client base:** Reimagine (`/home/cat/software/smt/game/reimagine`).  
**Japanese source of truth:** vanilla 1.666 (`…/smt_1666/MegaTen jp`).  
**Do not** treat vanilla JP as the install you run day-to-day.

## Layout

```text
translation/
├── README.md                 # this file
├── glossary/terms.tsv        # shared terminology (EN ↔ JP ↔ notes)
├── inventory/                # source catalogs and coverage notes
├── batches/                  # reviewed batch notes (per table/file)
├── extract/                  # local dumps (gitignored) — JP / Reimagine XML+TSV
├── build.nut                 # stub for later comp_translator batch builds
└── build/                    # local rebuild output (gitignored)
```

## Tool split

| Tool | Use |
| --- | --- |
| `comp_bdpatch` (+ encrypt/decrypt) | Day-to-day single BinaryData tables (MVP) |
| `comp_translator` + `build.nut` | Batch BinaryData + Event once batches grow |
| `translation.xml` | **Separate track** — address-tied exe/tooltip patches |

Binaries: `/home/cat/repos/smt/comp_hack/build-current/bin/`.

## First loop (MVP)

1. Inventory — `../scripts/translation-inventory.sh`
2. Extract one Client table (e.g. `CMessageData_SysHelp`) from Reimagine + JP
3. Diff / translate remaining JP rows; keep glossary updated
4. `comp_bdpatch save` → overlay → disposable client QA

See [AI/phases/phase8.md](../AI/phases/phase8.md) and
[guides/translation.md](../guides/translation.md).

Backlog and proposed terminology agent: [todo.md](todo.md).
