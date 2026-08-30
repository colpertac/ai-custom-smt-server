# Phase 13 — Dungeon rewards and economy polish

Started 2026-07-22. Closed same day for MVP scope (bronze Suginami rewards +
CP). See deferred items below.

## Goal

Make dungeon completion rewarding using server-controlled data: randomized
boss-crate loot and Cash Points (CP) on clear.

## Why not instance 900001?

Home III Service Entrance (`5201` / custom `900001`) is not a boss-box room.
`ActionCreateLoot isBossBox` there does not behave like a real clear, and the
test DefeatActions immediately zone-changed players out. Phase 13 uses stock
Suginami bronze instead.

## Inventory

| System | Where |
| --- | --- |
| Bronze instance | `ServerZoneInstance` **5401**, lobby `30102` |
| Boss clear | Events `D54_540101_540X_*` → `NORMAL_LOOT` / `FIEND_LOOT*` |
| Boss crates | `ActionCreateLoot` (`isBossBox`) at spot `2` |
| CP | `ActionUpdatePoints` `pointType=CP` |

## MVP payout (bronze 5401 only)

After stock boss crates spawn:

1. Branch on `bool_currentInstance` param `5401` **and** instance flag
   `900013` unset (`LT_OR_NAN`).
2. Set instance flag `900013` (dedup for the rest of this instance run).
3. Spawn bonus boss crates once (`bossGroupID` `900013`, DropSet `900003`,
   same spot `2` pattern as stock).
4. Grant **+10 CP** to party members still in the instance.
5. Resume stock flow (`D54_540101_Q317_L` on normal clear). No auto-boot —
   use the return device.

Silver/gold (`5402`/`5403`) share the loot events but skip the bonus branch.

### Party / inventory rules (decided)

| Reward | Rule |
| --- | --- |
| CP | `PARTY` + `INSTANCE` — each member in the instance gets +10 once per clear |
| Bonus crates | Spawned once (`SOURCE`); `ClaimBossBox` gives each player one claim from group `900013` |
| Inventory full | Boss boxes stay on the ground until opened — no direct `AddRemoveItems` |

Stock already one-shots encounter defeat; flag `900013` blocks re-firing the
Phase 13 bonus if loot events are replayed in the same instance.

## Files

| Path | Role |
| --- | --- |
| `server-content/events/ai_custom_phase13_suginami.xml` | New branch + bonus events |
| `server-content/data/dropset/ai_custom_phase13.xml` | DropSet `900003` |
| `comp_hack/datastore/events/dungeon_events-540X.xml` | Stock `next` hooks (patched) |
| `/var/lib/comp_hack/datastore/events/dungeon_events-540X.xml` | Live copy of same patch |

## Package

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/package-phase5.sh   # reverted DefeatActions
/home/cat/repos/smt/ai_custom_smt_server/scripts/package-phase13.sh
/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh
```

## Smoke

1. Note CP.
2. `@instance 5401` (Suginami bronze) → reach boss room → clear.
3. Stock crates appear; Phase 13 bonus crates + +10 CP on bronze only.
4. Leave via return device (no forced zone-change).
5. Optional: `@instance 5402` should get stock crates but not the +10 CP bonus.

## Still open / deferred

- [x] Party / inventory-full edge cases documented
- [x] Dedup flag `900013` on Phase 13 bonus clear
- [x] Retarget Phase 6 compressor to Magical Golden Apple `21941`
- [ ] Logout UI “10 second(s)…” → Phase 10 client patch. Server must always
      send `LOGOUT_PREPARE` before `LOGOUT_DISCONNECT` or the client shows
      “Disconnecting from the server”, boots to login, and can stick
      “Multiple logins”. `LogoutDelay` still controls the real wait.
- [ ] Payout XML shape → Phase 16D (with the webUI editor) — **done in 16D**
  (`server-content/payouts/*.json` + `/admin/payouts`)
- [ ] Apple compress/decompress UX → Phase 10 / 17A

## Logout notes

Stock chat line on prepare is client-hardcoded (~10s). Live `LogoutDelay` may
differ; that mismatch is accepted until a `comp_client` patch.
