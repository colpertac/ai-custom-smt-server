# 2026-07-20 — Izumi Macca tutorial (EventDirection 9531)

## In-game symptom

NPC **Beginner's Girl Izumi** (beginner area / Home):

1. Menu text is English (`Welcome…`, `Macca`, `Macca? Of course.`).
2. After choosing **Macca**, a slide/tutorial played Japanese (fixed below).

## What “table” means here

A **table** is one BinaryData file of records (ID → text/fields), like a spreadsheet
the client loads. Examples: item names, event messages, tutorial scripts.

## Split sources for this NPC

| Layer | File | IDs | Language on Reimagine |
| --- | --- | --- | --- |
| Menu / short lines | `BinaryData/Shield/CEventMessageData.sbin` | `200000`–`200050`… | Mostly English |
| Macca slideshow | `Event/PolygonMovie/BinaryData/CEventData.bin` | direction **`9531`** | **Translated this batch** |
| Server flow | `events/zone_events-20101.xml` | `Z20101_404_*` | Logic only |

Flow: `Z20101_404_01` → message `200009` (“Macca? Of course.”) →
`EventDirection` **9531** → English wrap-up.

## EN lines shipped (9531)

1. This is Macca, the currency / used in Tokyo today.
2. From the Item entry in / this menu window...
3. You can see how much Macca / you currently have.
4. Macca is mainly used to...
5. buy Weapons for fighting / demons...
6. and Armor to protect yourself.
7. You'll also need it for HP / items and magical tools.
8. The Master of the Cathedral of / Shadows and Yagiya shops also / charge Macca,
9. so I recommend always / keeping some on hand.

Terminology: **Cathedral of Shadows** (fusion; purple tutorial art) and **Yagiya**
(right image) — see [`glossary/lingo.md`](../glossary/lingo.md). JP `邪教の館`
is not “Pavilion of Heresy” in Reimagine EN.

## Build / QA

```bash
# rebuilt from work/phase8-izumi/CEventData.xml
# overlay: client-overlay/Event/PolygonMovie/BinaryData/CEventData.bin

# Disposable client (hardlink clone; break link when replacing):
/home/cat/software/smt/game/reimagine-phase8-izumi-test
```

In-game: launch **reimagine-phase8-izumi-test**, talk to Izumi → Macca.
Expect English slideshow.

## Follow-ups

- Magnetite / COMP Shop / Depositories directions (`9541`, …)
  - **9541 Magnetite done** — see [20260723-izumi-magnetite-direction-9541.md](20260723-izumi-magnetite-direction-9541.md)
- Keep `lingo.md` updated when new brands appear
