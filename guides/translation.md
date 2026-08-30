# Client translation workflow

Phase 8 turns Reimagine’s partial English into a **reproducible** pipeline.
COMP_hack docs: `comp_hack/docs/guide/chapters/translation.rst`.

## Bases

- **Run / QA:** `/home/cat/software/smt/game/reimagine` (or a disposable clone)
- **Japanese source:** `/home/cat/software/smt/game/smt_1666/MegaTen jp`
- **Working tree:** `ai_custom_smt_server/translation/`

## Day-to-day (single table) — preferred MVP

1. Inventory (optional refresh):

```bash
scripts/translation-inventory.sh
```

2. Extract Reimagine + JP XML/TSV:

```bash
scripts/translation-extract-table.sh cmessage Client/CMessageData_SysHelp.bin
# or Shield:
scripts/translation-extract-table.sh citem Shield/CItemData.sbin
```

3. Compare `translation/extract/{reimagine,jp}/STEM.tsv`.
4. Edit EN XML; keep IDs and control codes intact.
5. Check field length limits in
   `comp_hack/libcomp/libcomp/schema/binarydata/` (many names are **36** chars;
   MultiTalk / movies have fixed message widths).
6. Rebuild with `comp_bdpatch save` (+ `comp_encrypt` for Shield).
7. Install via overlay scripts onto a **disposable** client; QA in-game.
8. Record the batch under `translation/batches/` and update glossary terms.

See [`translation/todo.md`](../translation/todo.md) for backlog and the proposed
Reimagine terminology research pass.

Default encoding for `comp_bdpatch` is **cp932**; override with `-e` only when
you know the table needs it.

## Batch builds (`comp_translator`)

Use later when many XML files are staged. Configure
`translation/build.nut`, then:

```bash
cd translation
/home/cat/repos/smt/comp_hack/build-current/bin/comp_translator build.nut
```

Expect `build/` output + `build.log` ending in “Build Successful”.

## Keep separate: `translation.xml`

Reimagine’s `translation.xml` patches the **executable** (addresses + some
match/replace). It is not produced by `comp_bdpatch`. Treat it as its own
workstream after BinaryData/Event coverage improves.

## Terminology

See [`translation/glossary/lingo.md`](../translation/glossary/lingo.md) for
preferred English (e.g. **Yagiya**, not “Goat Shop”; **Cathedral of Shadows**,
not “Pavilion of Heresy”) and
[`glossary/terms.tsv`](../translation/glossary/terms.tsv) for a compact list.

## Priority

UI/help → items/demons/skills → story MultiTalk/movies → quests → remaining
flavor → exe/image text.
