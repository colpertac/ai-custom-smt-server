# Custom ID Registry

This is the source of truth for IDs introduced by this project.

Do not allocate a custom ID until all relevant client and server BinaryData
tables have been dumped and checked for collisions. A number absent from
COMP_hack XML may still be occupied in the client.

## Allocation policy

1. Dump the complete local Reimagine tables with `comp_bdpatch`.
2. Compute unused ranges independently for each record type.
3. Reserve a documented project range for each type.
4. Never recycle a released ID; mark it retired.
5. Record every client and server table that references the ID.
6. Validate definitions before starting the channel server.

Phase 2 BinaryData round-trip is complete. Item IDs must still be
collision-checked against local `ItemData`/`CItemData` before allocation.

## Project allocations

| Type | ID | Symbol/name | Status | References and notes |
|---|---:|---|---|---|
| Zone partial | 900001 | `ai_custom_phase1` | allocated | Auto-applies to DynamicMap `90102`; package `zzz_ai_custom_phase1.zip` |
| Drop set | 900001 | `ai_custom_phase1` | allocated | Macca Note (`699`) + AI Test Token (`900001`) on Phase 1 encounter |
| Spawn | 900001 | Phase 1/4 test enemy | allocated | EnemyType `900001` (AI Test Demon); level 5; near (200,0) on zone `90102` |
| Spawn group | 900001 | Phase 1 test group | allocated | One copy of spawn `900001` |
| Spawn location group | 900001 | Phase 1 test location | allocated | Immediate spawn, 15s respawn |
| Item | 900001 | AI Test Token | allocated | Clone of stock `501`; `ItemData`/`CItemData`; icon `501`, model `0`; free in local scan of 16581 records |
| Demon | 900001 | AI Test Demon | allocated | Clone of stock Angel `187`; `DevilData` only; model `63`; fusion flags cleared; free in scan of 5301 records |
| Zone partial | 900002 | `ai_custom_phase5` | allocated | Auto-applies to DynamicMap `5201001` (Home III Service Entrance); package `zzz_ai_custom_phase5.zip` |
| Zone instance | 900001 | AI Test Dungeon | allocated | `@instance 900001`; zone `520101`/`5201001` (same as stock 5201); LobbyID `20102`; GroupID `2` |
| Zone instance variant | 900001 | AI Test Dungeon NORMAL | allocated | `InstanceType=NORMAL`; optional `@instance 900001 900001` |
| Item | 900002 | Golden Apple (legacy) | retired | Phase 6 POC base; compressor now uses stock `21941` |
| Item | 900003 | Compressed Magical Golden Apple | deferred | Definitions kept; apple `CurrencyCompressor` disabled until Phase 10/17A |
| Drop set | 900002 | Golden Apple decompress | allocated | GiftDropSet: 50000× Magical Golden Apple `21941` |
| Skill | 900001 | Golden Apple decompress | allocated | function 320; GiftBoxID `900002`; cost item `900003` |
| Drop set | 900003 | Phase 13 clear crate | allocated | Weighted Macca Note + exclusive Token/item; package `zzz_ai_custom_phase13.zip` (legacy live until Lane A owns Suginami) |
| Boss group | 900013 | Phase 13 Suginami bonus crates | allocated | Bronze `@instance 5401` clear bonus; also ZONE_INSTANCE flag key for payout dedup |
| Drop set | 901100 | Suginami bronze (admin) | allocated | `suginami-bronze` Lane A DropSet; use after retiring Phase 13 package ownership |
| Drop set | 901101–901199 | Phase 16D payout stubs | reserved | `scripts/payout-seed-catalog.sh`; one DropSet per catalog stub |
| Boss group / instance flag | 901201–901299 | Phase 16D payout stubs | reserved | Same script; dedup flag == bossGroupID per stub |
| CurrencyCompressor | 1 | Macca | allocated | Stock: `799` → `699` @ 50000 (`data/compressors/00_stock.xml`) |
| CurrencyCompressor | 2 | Mag | allocated | Stock: `800` → `27375` @ 50000 |
| CurrencyCompressor | 900001 | Magical Golden Apple | deferred | Was `21941` → `900003` @ 50000; disabled in phase6 package |
| CEventMessage | 9180000–9180999 | Report-trade custom package labels | reserved | One ID per item cost; mapped in `server-content/report-rewards/choice-messages.json`; patched into client `CEventMessageData2` via ops upsert + ImagineUpdate. Stock costs keep jackfrost IDs (130711–130718, 2000203). |

## Known existing IDs

These are references, not project allocations:

| Type | ID | Name | Source/status |
|---|---:|---|---|
| Item | 799 | Macca | `/etc/comp_hack/constants.xml` |
| Item | 699 | Macca Note | `/etc/comp_hack/constants.xml` |
| Item | 800 | Magnetite | `/etc/comp_hack/constants.xml` |
| Item | 27375 | Mag Presser | `/etc/comp_hack/constants.xml` |
| Item | 21941 | Magical Golden Apple | Stock Vivian XP feed; Phase 6 compressor base |
| Skill function | 320 | `SKILL_RANDOM_ITEM` | Existing server behavior |
| Zone/DynamicMap | 90102 | Empty global test candidate | Existing client/server-known pair |

## Unverified third-party mappings

Do not use these until they are confirmed against the local client:

| Type | ID | Claimed meaning | Source |
|---|---:|---|---|
| Item | 49386 | Compressed Golden Apple | Third-party `comp_client.xml` |

Those IDs may belong to that server's private client overlay rather than the
Reimagine client currently installed here.

