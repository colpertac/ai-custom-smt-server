# 2026-07-23 — Izumi Magnetite tutorial (EventDirection 9541)

Same pattern as Macca direction `9531`
([batch note](20260720-izumi-macca-direction-9531.md)).

## In-game symptom

NPC **Beginner's Girl Izumi** (Beginner's Zone / Home):

1. Menu text is already English (`Magnetites`, `Magnetites? Of course.`).
2. After choosing **Magnetites**, the slideshow played Japanese (fixed below).

## Split sources

| Layer | File | IDs | Language |
| --- | --- | --- | --- |
| Menu / short lines | `BinaryData/Shield/CEventMessageData.sbin` | `200003`, `200025`… | Already EN |
| Magnetite slideshow | `Event/PolygonMovie/BinaryData/CEventData.bin` | direction **`9541`** | **Translated this batch** |
| Server flow | `events/zone_events-20101.xml` | `Z20101_404_*` | Logic only |

Flow: Izumi Mag choice → message `200025` (“Magnetites? Of course.”) →
`EventDirection` **9541** (`Z20101_404_DR025`) → English wrap-up
(`200026` / `200029`…).

Macca path remains `9531` (`Z20101_404_DR024`); both ship in the same
`CEventData.bin`.

## EN lines shipped (9541)

1. This is Magnetite, / crystallized human spirit energy.
2. From the Item entry in / this menu window...
3. You can see how much Magnetite / you currently have.
4. Magnetite is mainly used to...
5. summon Demons, spent as a cost / that depends on that demon...
6. and for certain powerful magic / and skills. Its uses are many.
7. Of course, without Magnetite, / you cannot do any of these.

Terminology: **Magnetite** (glossary / item `800`). Tutorial art:
`Event/dds/magnetite.dds`. Field limit **132** bytes (cp932) per text —
all lines under limit. DDS paths unchanged.

Note: Izumi menu label uses plural “Magnetites”; slideshow uses singular
**Magnetite** to match glossary and the Macca slideshow style.

## Build / QA

```bash
BIN=/home/cat/repos/smt/comp_hack/build-localdeps-v31/bin
WORK=/home/cat/repos/smt/ai_custom_smt_server/work/phase8-mag9541
OUT=/home/cat/repos/smt/ai_custom_smt_server/client-overlay/Event/PolygonMovie/BinaryData

"$BIN/comp_bdpatch" save cevent "$WORK/CEventData.xml" "$WORK/CEventData.bin"
cp -f "$WORK/CEventData.bin" "$OUT/CEventData.bin"

# Disposable (hardlink clone; CEventData link broken on install):
DISP=/home/cat/software/smt/game/reimagine-phase8-mag9541-test
rm -f "$DISP/Event/PolygonMovie/BinaryData/CEventData.bin"
cp -f "$WORK/CEventData.bin" "$DISP/Event/PolygonMovie/BinaryData/CEventData.bin"
```

Also copied into existing disposables `reimagine-phase8-izumi-test` and
`reimagine-phase8-uiinfo-test` so Macca+Mag both work there.

**Do not** point at live `reimagine` without review.

## Smoke-test (in-game)

Launch **`reimagine-phase8-mag9541-test`** (or izumi-test):

1. Talk to **Beginner's Girl Izumi**.
2. Choose **Magnetites** → expect English slideshow (Magnetite intro → menu →
   inventory total → summon/magic uses → without-Mag warning).
3. Optionally re-check **Macca** path still English (`9531`).

## Follow-ups

- COMP Shop / Depositories Izumi directions (later)
- Shop pitch lines (+31–+44) if continuing A1 UI track
