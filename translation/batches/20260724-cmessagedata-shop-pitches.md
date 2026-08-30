# 2026-07-24 — CMessageData_Shop pitch lines (+31–+44)

Fast skim-review mode (no disposable-client NPC QA).

## Scope

| | |
| --- | --- |
| Table | `Shield/CMessageData_Shop.sbin` |
| Offsets | `+31`–`+44` product / browse pitches |
| Rows | **310** (104 unique JP → EN) |
| CJK left in this table | **0** (core dialogue was prior batch) |

## Review

Full JP↔EN unique list (skim this, not in-game):

[`20260724-shop-pitches-EN-review.md`](20260724-shop-pitches-EN-review.md)

## High-frequency pitches (×14 vendors)

| EN (gist) |
| --- |
| Brand new stock! Brand new! How about it? |
| You always want a few of your everyday items on hand, right? |
| Man, monthly quotas are rough... Oops, didn't mean to complain. |
| I picked that up the other— I mean, I stocked it... |
| Great for party play! How about it? |
| You'll want this around here! No downside to buying it. |
| That item lets you make a dungeon. Care for one? |
| Dungeons... host demons that want to talk to humans... |
| I hear dungeons made with this can't be entered alone. |
| That product is on a stock-up promo right now. |
| That's a limited-time item — buy it while you can! |
| Eh?! I don't wear that! Uh, it was just lying there! |
| We've expanded into currency exchange. Interested? |
| ...stopwatch and plate... try the G1 Trial. |

Glossary kept: **COMP**, **Demon**, **Tokyo** (was Toukyou in a few pitches), **Macca**, **DESTINY**, **Candystick**, **Ymir**.

Unconfident queue was **auto-resolved with shop/item context** — see
[`20260724-shop-pitches-UNCONFIDENT.md`](20260724-shop-pitches-UNCONFIDENT.md)
(human list empty).

## Build

Overlay rebuilt (`client-overlay/.../CMessageData_Shop.sbin`). Not applied to a
disposable client this pass — say if you want it copied somewhere.

## Next (same fast mode)

Remaining UIInfoData CJK (~117) or a CItemData name slice — your pick.
