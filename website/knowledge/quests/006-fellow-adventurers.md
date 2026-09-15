# Fellow Adventurers

Early Home III party tutorial — form a group, clear hollow beasts in the
**VB Training Room**, then report to the **Experienced Demon Buster**.

Quest ID **6** · type `NORMAL` · hub **Home III** (zone 20101).

## Quick summary

| Step | What to do | Where |
| --- | --- | --- |
| Start | Accept from the Experienced Demon Buster | Home III — **Experienced Demon Buster** (NPC 203) |
| 1 | Form a party, then talk to him again | Home III — NPC 203 |
| 2 | Defeat Hollow Beast Cerberus and Garm | **VB Training Room** (zone 561101) |
| 3 | Report success | Home III — Experienced Demon Buster (NPC 203) |

QuestData lists all phases as dialogue-driven (`NONE` reqs); the training-room
kill is gated by dungeon event `D56_561101_D003`, not a kill counter in
QuestData.

## Walkthrough

### Start — Experienced Demon Buster (Home III)

Talk to **Experienced Demon Buster** (先輩デビルバスター, NPC **203**) in
**Home III**.

Event: `Z20101_203_Q6_SE1` (`zone_events-20101.xml`).

### Step 1 — Form a party

Create or join a **party**, then speak with the Experienced Demon Buster again
in **Home III**.

Event: `Z20101_203_Q6_05` (`zone_events-20101.xml`).

### Step 2 — VB Training Room

Enter the **VB Training Room** (ＶＢ訓練の間, zone **561101**, dungeon 56) and
defeat **Hollow Beast Cerberus** and **Garm**. When both are down, talk to the
Experienced Demon Buster (the dungeon event advances phase 2).

Event: `D56_561101_D003` (`events/dungeon_events-56.xml`).

### Step 3 — Report back

Return to **Home III** and tell the Experienced Demon Buster you cleared the
training room.

Event: `Z20101_203_Q6_SE2` (`zone_events-20101.xml`, turn-in phase −1).

## Tips

- You need at least one other player in your party before step 1 will advance.
- The training instance is separate from the open **Virtual Battle** hub
  (zones 10101/10102) — follow the NPC's warp into dungeon 56.
- If kills do not register, confirm both Cerberus and Garm were defeated
  before leaving the instance.

## Data sources

- `website/content/wiki/quests.json` — id **6** (title, journal lines, phases)
- `website/content/wiki/quest-npcs.json` — NPC links:
  - Start: NPC 203 @ Home III — `Z20101_203_Q6_SE1`
  - Advance phase 1: NPC 203 @ Home III — `Z20101_203_Q6_05`
  - Advance phase 2: dungeon 56 — `D56_561101_D003`
  - Complete: NPC 203 @ Home III — `Z20101_203_Q6_SE2`

*English giver label from CQuestData; JP NPC name from zone XML comments.*
