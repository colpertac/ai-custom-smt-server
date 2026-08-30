# Phase 5 Notes

Updated 2026-07-19 — private dungeon POC on stock instance **5201** map
(Home III Service Entrance). In-game smoke confirmed.

For the walkthrough, see
[the custom-dungeon guide](../guides/custom-dungeon.md).

## What was added

Private **AI Test Dungeon** on **Home III Service Entrance** (stock dungeon):

| Field | Value |
| --- | --- |
| Instance ID | `900001` |
| Variant ID | `900001` (`NORMAL`, optional) |
| Zone / DynamicMap | `520101` / `5201001` (stock; same as `@instance 5201`) |
| Lobby | `20102` (Home III Service Entrance hub) |
| Encounter | AI Test Demon via partial on DynamicMap `5201001` |
| Clear | Defeat custom spawn group → teleport to `20102` spot `50001` |
| Entry | `@instance 900001` |

Uses a real private instance layout (return device, boss door wiring). No
custom DynamicMap clone — reuses stock client/server map assets.

Phase 1 `@zone 90102` is unchanged (global Home II test zone).

## Naming note

Stock instance **5201** is **Home III Service Entrance**, not Suginami Tunnels.
Real Suginami Tunnels instances start at **5401** (lobby `30102`, multi-room
zone set `540101`+). Retargeting Phase 5 there is optional follow-up.

## Why not Home II (90102)?

Home II is a tutorial/hub map. An earlier attempt cloned DynamicMap `90102` →
`900002` with a private ServerZone; that was fragile. Cloning stock instance
**5201** proved private entry, spawn, and defeat-exit.

## Distribution

| Role | Path |
| --- | --- |
| Package | `zzz_ai_custom_phase5.zip` |
| Partial | `zones/partial/ai_custom_phase5.xml` (partial ID `900002`) |
| Disposable client | `/home/cat/software/smt/game/reimagine-phase5-test` |

Requires Phase 1 package (DropSet `900001`) and Shield `DevilData` overlay
(custom demon name).

## Rebuild / install

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/migrate-zoneinstance-dirs.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/build-client-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/install-shield-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-phase5-test
/home/cat/repos/smt/ai_custom_smt_server/scripts/package-phase5.sh

/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh
```

Validate:

```bash
/home/cat/repos/smt/comp_hack/build-current/bin/comp_verify server_data 1 ERROR \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase5.zip
```

## In-game smoke checklist

Use the disposable Phase 5 client (DevilData overlay).

1. `@zone 90102` — Phase 1 AI Test Demon still spawns (global Home II).
2. `@instance 900001` — Home III Service Entrance dungeon; AI Test Demon near entrance.
3. Kill AI Test Demon — loot; defeat returns to hub `20102`.
4. Compare: `@instance 5201` — same map; partial also applies while Phase 5 ZIP is installed.

## Deferred

- Retarget to real Suginami Tunnels (`@instance 5401`, lobby `30102`)
- Multi-room custom instance / party NPC entry
- Timers, fail/reconnect hardening, destiny-box rewards
- New map assets
