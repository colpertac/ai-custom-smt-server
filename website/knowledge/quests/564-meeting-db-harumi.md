# Meeting DB Harumi

Short Home III quest that sends you to **DB Harumi** in **Suginami** after
picking up the job from the **Former DB Guard**.

Quest ID **564** · type `NORMAL` · hub **Home III** (zone 20101).

## Quick summary

| Step | What to do | Where |
| --- | --- | --- |
| Start | Accept the quest from the Former DB Guard | Home III — **Former DB Guard** (NPC 383) |
| 1 | Talk to DB Harumi | **Suginami** (zone 30101) — **DB Harumi** (NPC 326) |

Single talk-only phase (`NONE` requirements in QuestData).

## Walkthrough

### Start — Former DB Guard (Home III)

Talk to **Former DB Guard** (元ＤＢの守衛, NPC **383**) in **Home III** to
accept the quest.

Event: `Z20101_383_Q564` (`zone_events-20101.xml`).

*(The quest-npcs export may also list `Z20101_383_Q565_09` for this giver —
that event is shared with the Delivering the Goods chain.)*

### Step 1 — DB Harumi (Suginami)

Travel to **Suginami** and speak with **DB Harumi** (ＤＢハルミ, NPC **326**)
to complete the quest.

Event: `Z30101_326_Q564_FIN` (`zone_events-30101.xml`).

The journal line says *"Home III Camp,"* but the completion event lives in
**Suginami** — DB Harumi is stationed there, not in the Home III zone file.

## Tips

- If the Former DB Guard does not offer the quest, check prerequisite quests
  in the chain (563/565 share the same NPC menu).
- No combat or items required — just the two conversations.

## Data sources

- `website/content/wiki/quests.json` — id **564** (title, journal line, phase)
- `website/content/wiki/quest-npcs.json` — NPC links:
  - Start giver: NPC 383 @ Home III — `Z20101_383_Q564`
  - Complete: NPC 326 @ Suginami (30101) — `Z30101_326_Q564_FIN`

*NPC names in parentheses are from Japanese zone XML comments; English labels
(`Former DB Guard`, `DB Harumi`) come from CQuestData.*
