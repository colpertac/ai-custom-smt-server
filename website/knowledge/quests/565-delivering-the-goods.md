# Delivering the Goods

Home III fetch quest — the **Former DB Guard** asks you to find a **Friendly
Demon Buster** with a **Pixie** in **Suginami**, collect **Empty Cans:
Oolong Tea**, and bring them back.

Quest ID **565** · type `NORMAL` · hub **Home III** (zone 20101).

## Quick summary

| Step | What to do | Where |
| --- | --- | --- |
| Start | Accept from the Former DB Guard | Home III — **Former DB Guard** (NPC 383) |
| 1 | Find the DB with a Pixie and get the goods | **Suginami** (30101) — **Friendly Demon Buster** (NPC 211) |
| 2 | Deliver 20 Empty Cans: Oolong Tea | Home III — Former DB Guard (NPC 383) |

Both phases are talk-driven in QuestData (`NONE` requirements); the cans are
handed off through dialogue with the Friendly Demon Buster.

## Walkthrough

### Start — Former DB Guard (Home III)

Talk to **Former DB Guard** (元ＤＢの守衛, NPC **383**) in **Home III**.

Event: `Z20101_383_Q565_03` (`zone_events-20101.xml`).

### Step 1 — Friendly Demon Buster + Pixie (Suginami)

Go to **Suginami** and find the **Friendly Demon Buster** (親切なデビルバスター,
NPC **211**) — the journal mentions a DB accompanied by a **Pixie**. Talk to
him to receive the **20 Empty Cans: Oolong Tea**.

Event: `Z30101_211_Q565_02` (`zone_events-30101.xml`).

### Step 2 — Return to the Former DB Guard

Return to **Home III** and hand the cans to **Former DB Guard** (NPC **383**).

Event: `Z20101_383_Q565_09` (`zone_events-20101.xml`, turn-in phase −1).

## Tips

- The Friendly Demon Buster is in **Suginami**, not Home III — warp or walk
  from the Home III Entry if needed.
- If turn-in fails, make sure you finished the Suginami conversation first
  (phase 1 advance event).

## Data sources

- `website/content/wiki/quests.json` — id **565** (title, journal lines, phases)
- `website/content/wiki/quest-npcs.json` — NPC links:
  - Start: NPC 383 @ Home III — `Z20101_383_Q565_03`
  - Advance phase 1: NPC 211 @ Suginami (30101) — `Z30101_211_Q565_02`
  - Complete: NPC 383 @ Home III — `Z20101_383_Q565_09`

*English NPC labels from CQuestData; JP names from zone XML comments.*
