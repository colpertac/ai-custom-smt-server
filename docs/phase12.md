# Phase 12 — Configurable gameplay timings and limits

Started 2026-07-20.

## Goal

Move selected hardcoded channel timings and the player move-speed increase
floor into `WorldSharedConfig`, with stock defaults so behavior is unchanged
until you edit `/etc/comp_hack/world.xml`.

## New `WorldSharedConfig` members

| Member | Default | Unit | Meaning |
| --- | --- | --- | --- |
| `LogoutDelay` | 10 | seconds | Quit and delayed channel-switch prepare timer |
| `LootBodyDuration` | 120 | seconds | Enemy body despawn when it has loot |
| `LootBodyEmptyDuration` | 10 | seconds | Enemy body despawn when empty |
| `LootRestrictedDuration` | 60 | seconds | Restricted-loot window before free-for-all |
| `LootBodyPostLootRemove` | 10 | seconds | Body remove delay after last item taken |
| `LootEggDuration` | 300 | seconds | Demon-egg despawn after contract |
| `LootEggRestrictedDuration` | 120 | seconds | Party-only claim window before free-for-all |
| `MaxMoveIncreaseSum` | 50 | percent | Floor for MOVE1/MOVE2 percentage-boost cap |

Schema: `comp_hack/libcomp/libcomp/schema/serverconfig.xml`.

## Example config

In `/etc/comp_hack/world.xml` under `WorldSharedConfig`:

```xml
<member name="LogoutDelay">1</member>
<member name="LootBodyDuration">30</member>
<member name="LootRestrictedDuration">15</member>
<member name="LootEggRestrictedDuration">30</member>
<member name="LootEggDuration">90</member>
<member name="MaxMoveIncreaseSum">100</member>
```

Omit a member to keep its schema default. Restart **world and channel** after
edits so channels reload shared config.

## Notes

- Client logout chat on `LOGOUT_PREPARE` is hardcoded (~10s). Server
  `LogoutDelay` still controls the real timer. Do **not** skip PREPARE before
  DISCONNECT — that causes a generic disconnect to the login screen. Accurate
  prepare text → Phase 10 client patch.
- Gift-box / boss-box long timers (120s / 60min) stay hardcoded for now.
- `@speed` still applies a GM `SpeedBoost` on top of CorrectTbl moves; the
  `MaxMoveIncreaseSum` clamp applies to percentage MOVE boosts from gear /
  tokusei (same role as old `MAX_MOVE_INCREASE_SUM` in `constants.xml`).

## Code hooks

- Logout: `AccountManager::HandleLogoutRequest`
- Body loot timers: `SkillManager` death loot + `LootItem.cpp` post-loot remove
- Demon egg timers: `SkillManager` contract loot (`LootEggDuration` /
  `LootEggRestrictedDuration`)
- Move cap: `ActiveEntityState::AdjustStats` via `ChannelServer::GetInstance()`

## Smoke checks

1. Default config: logout still ~10s; loot timing feels stock.
2. Set `LogoutDelay` to `1`, restart world+channel, confirm faster logout.
3. Optionally lower loot durations and confirm bodies despawn sooner.
4. Raise `MaxMoveIncreaseSum` and verify gear/tokusei move caps allow higher
   run speed after a stat recalc (zone change / equip).
5. In a party, contract a demon: only the contractor can claim the egg until
   `LootEggRestrictedDuration`; egg despawns after `LootEggDuration`.