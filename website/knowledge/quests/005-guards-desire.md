# The Guard's Desire

Early Home III tutorial quest that walks you through the **Cathedral of
Shadows**, reporting back to the Guard, and setting your **Home Point** with
the Home Point Girl.

Quest ID **5** · type `NORMAL` · hub **Home III** (zone 20101).

## Quick summary

| Step | What to do | Where |
| --- | --- | --- |
| Start | Accept the quest from the Guard | Home III — **Father Figure Guard** (NPC 382) |
| 1 | Ask the Cathedral Master about demons | **Cathedral of Shadows** (zone 20107) — NPC 27 |
| 2 | Report back | Home III — Guard (NPC 382) |
| 3 | Deliver the Guard's letter | Home III — **Home Point Girl** (NPC 219) |
| 4 | Set your Home Point, then talk to her again | Same spot — Home Point Girl (NPC 219) |

No combat or item collection — every phase is **talk-only** (QuestData shows
`NONE` requirements for all four phases).

## Walkthrough

### Start — Father Figure Guard (Home III)

Talk to **Father Figure Guard** (新人想いの守衛, NPC **382**) in **Home III**.
He asks you to visit the Cathedral and learn about demons.

Event: `Z20101_382_Q5_15` (`zone_events-20101.xml`).

### Step 1 — Cathedral of Shadows

Go to the **Cathedral of Shadows** (zone **20107**) and speak with the
**Cathedral Master** (邪教の主, NPC **27**) about demons.

Event: `Z20107_27_Q5_02` (`zone_events-20107.xml`).

*(The in-game journal may show a hint image: `qid_005_p01_01.dds`.)*

### Step 2 — Report to the Guard

Return to **Home III** and report to **Father Figure Guard** (NPC **382**).

Event: `Z20101_382_Q5_22`.

### Step 3 — Guard's letter to the Home Point Girl

The Guard gives you a letter. Take it to the **Home Point Girl**
(ホームポイントガール, NPC **219**) in **Home III**.

Event: `Z20101_219_Q5_03`.

*(Journal hint image: `qid_005_p03_01.dds`.)*

### Step 4 — Set Home Point and finish

At the Home Point Girl, **register the current spot as your Home Point**,
then talk to her again to complete the quest.

Event: `Z20101_219_Q5_10` (turn-in, phase −1).

## Tips

- If dialogue does not advance, make sure you finished the prior NPC's line
  (Cathedral visit before reporting, letter handoff before setting Home Point).
- Phase 1 may not emit an `ActionUpdateQuest` in XML until you finish the
  Cathedral conversation — that is normal for talk-tree quests.

## Data sources

- `website/content/wiki/quests.json` — id **5** (title, journal lines, phases)
- `website/content/wiki/quest-npcs.json` — start/advance/complete NPC links:
  - Start: NPC 382 @ Home III — `Z20101_382_Q5_15`
  - Advance phase 1: NPC 27 @ Cathedral (20107) — `Z20107_27_Q5_02`
  - Advance phase 2: NPC 382 @ Home III — `Z20101_382_Q5_22`
  - Advance phase 3: NPC 219 @ Home III — `Z20101_219_Q5_03`
  - Complete: NPC 219 @ Home III — `Z20101_219_Q5_10`

*NPC names in parentheses are from Japanese zone XML comments; English labels
(`Father Figure Guard`, `Home Point Girl`) come from CQuestData. Full English
NPC resolution can wait for a dedicated CQuest/l10n export (Track A).*
