# Dungeon payout QA (`@dungeon-qa`)



GM command for payout smoke tests: creates the instance, warps to the boss

floor, resets the payout dedup flag, enables invuln, and starts the boss event.



Requires channel rebuild after C++ changes and `UserLevel` ≥ 200 (same as

`@instance`).



## Config



Edit `comp_hack/runtime/config/dungeon_qa.tsv` (seed copy in

`ai_custom_smt_server/server-content/config/dungeon_qa.tsv`).



Tab-separated columns (Excel: save as **TSV**):



| Column | Meaning |

| --- | --- |

| id | Number you pass to `@dungeon-qa N` |

| label | Display name |

| instanceId | `@instance` id for this **difficulty tier** (see table below) |

| variantId | Usually `0` |

| zoneId | Boss zone (last zone in instance is a good default) |

| dynamicMapId | Boss floor map variant — **must match** `DynamicMapIDs[i]` for `zoneId` in `zoneinstance/00_stock.xml` (use `0` to auto-resolve) |

| x, y | Boss-room coordinates |

| spotId | If set and found in QMP, overrides x/y |

| dedupFlag | Payout dedup flag reset to `0` (use `0` to skip) |

| invuln | `1` = enable `@invuln` for this session |

| bossEvent | Event id to start boss (from zone XML) |

| payoutId | Optional note for your spreadsheet |



### Instance IDs: tier vs layout



Lobby entry picks a **difficulty tier** (bronze/silver/gold pass), then often

randomizes among **layout variants** within that tier. Do not use 5401/5402/5403

as bronze/silver/gold — all three are bronze-tier layouts.



| Family | Bronze (pick one) | Silver | Gold |

| --- | --- | --- | --- |

| Suginami | 5401–5403 | 5421–5423 | 5481–5482 |

| Celu Tower | 5501–5503 | 5521–5523 | 5531/5533/5535 |

| Shibuya Quartz | 5701–5703 | 5711 | 5721 |

| Old Ichigaya Camp | 5101–5103 | 5131 | 5151 |

| Shinagawa Catacomb | 6201–6203 | 6202 | 6203 |

| Nakano Underground | 9201–9203 | 9221 | 9211–9212 |

| Kagurazaka Zhu Que | 6301–6303 | 6302 | 6303 |

| Ueno Mirage | 10901 | 10902 | 10903 |



`dungeon_qa.tsv` ids **1–51** mirror every payout on `/admin/payouts` (one row per `payoutId`). Rows **1–9** (+ **26** bearcat) have lane A payout wiring live today. Rows **10–25** are the other bronze/silver/gold tiers — `@dqa` gets you to the correct stock instance and boss spawn, but **CP will not grant** until those payouts are wired. Rows **27–51** are variants (per-floor, diaspora, kings, etc.); boss events are best-effort.

**Not** standard tier ids: Nakano **10502** (romance) and **10509** (horse) are special variants; Mirage **12904** is the parallel Ueno Mirage branch (payout JSON still references it for `mirage-silver` wiring — stock silver tier is **10902**).

Payout JSON `instanceId` must match the tier id the dispatcher branches on (see table above).



## In game



```

@dungeon-qa list

@dungeon-qa 1

@dungeon-qa leave

```



Aliases: `@dungeonqa`, `@dqa`.



The success message shows configured instance def and **runtime def** after

warp. You should also see the correct tier in the create/join message (e.g.

Silver, not Bronze) and the correct boss demon.



After warp: kill the boss once, confirm CP/crates. Switching rows clears stale

instance access and reconnect state automatically. Use `@dqa leave` to bail out.



After changing payout `instanceId` values, **Validate & Publish** lane A so

shared AFTER dispatchers pick up the new branch gates.



## Adding a dungeon



1. Clear the dungeon once manually; note `@zone`, `@pos`, and boss event from

   zone XML (`ActionStartEvent` near boss).

2. Look up lobby `ActionZoneInstance` in `zone_events-*.xml` for the real tier

   instance ids (not sequential 54xx/55xx/57xx).

3. Add a row to `dungeon_qa.tsv` with the next id.

4. Map the id in your Excel sheet.



Unwired payouts (e.g. Nakano gold) will not grant CP until stock + payout JSON

are wired — this command only saves travel time.

