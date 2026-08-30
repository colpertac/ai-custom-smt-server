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
| Item | TBD | Golden Apple | proposed | Confirm local client record before deciding whether this is stock/custom |
| Item | TBD | Compressed Golden Apple | proposed | Requires client display data and compressor/decompressor behavior |
| Zone | TBD | First custom zone | proposed | Initially clone a client-known Zone/DynamicMap pair |
| Zone instance | TBD | First custom dungeon | proposed | Allocate only after the zone experiment |
| Drop set | TBD | Golden Apple decompressor | proposed | One-entry GiftDropSet is a possible implementation |
| Skill | TBD | Golden Apple decompressor | proposed | May reuse function ID 320 rather than add a function |

## Known existing IDs

These are references, not project allocations:

| Type | ID | Name | Source/status |
|---|---:|---|---|
| Item | 799 | Macca | `/etc/comp_hack/constants.xml` |
| Item | 699 | Macca Note | `/etc/comp_hack/constants.xml` |
| Item | 800 | Magnetite | `/etc/comp_hack/constants.xml` |
| Item | 27375 | Mag Presser | `/etc/comp_hack/constants.xml` |
| Skill function | 320 | `SKILL_RANDOM_ITEM` | Existing server behavior |
| Zone/DynamicMap | 90102 | Empty global test candidate | Existing client/server-known pair |

## Unverified third-party mappings

Do not use these until they are confirmed against the local client:

| Type | ID | Claimed meaning | Source |
|---|---:|---|---|
| Item | 21941 | Golden Apple/base resource | Third-party `comp_client.xml` |
| Item | 49386 | Compressed Golden Apple | Third-party `comp_client.xml` |

Those IDs may belong to that server's private client overlay rather than the
Reimagine client currently installed here.

