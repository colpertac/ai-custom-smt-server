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

No custom range is allocated yet. Phase 2 will establish safe ranges after the
BinaryData round trip and collision scan work.

## Project allocations

| Type | ID | Symbol/name | Status | References and notes |
|---|---:|---|---|---|
| Item | TBD | Golden Apple | proposed | Confirm local client record before deciding whether this is stock/custom |
| Item | TBD | Compressed Golden Apple | proposed | Requires client display data and compressor/decompressor behavior |
| Demon | TBD | First custom demon | proposed | Initially reuse an existing model/race/AI |
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

