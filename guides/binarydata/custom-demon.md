# Creating a custom demon

This walkthrough recreates the Phase 4 **AI Test Demon**: a renamed clone of
stock Angel (`187`) that reuses the same model, AI, growth, and skills.

Read the [round-trip workflow](round-trip.md) first.

## Required definitions

| Table | `comp_bdpatch` type | Key | Role |
| --- | --- | --- | --- |
| `Shield/DevilData.sbin` | `devil` | `basic.ID` | Mechanics **and** display name/model |

There is no `CDevilData` / `SDevilData` twin. Name and `modelID` live in
`DevilData.basic`.

Match keys for a zone spawn:

```text
Spawn.EnemyType == DevilData.basic.ID
```

Reuse (do not clone) unless you intentionally change them:

```text
DevilData.basic.modelID      -> CModel* asset
DevilData.AI.type            -> AIData
DevilData.growth.growthType  -> DevilLVUpRateData
```

Defer until the base demon is stable:

- `DevilBookData` (compendium)
- fusion / mitama tables
- enchant / boost / equipment tables

## 1. Reserve an ID

Extract local `DevilData` and confirm the candidate is free. Also spot-check
`DevilBookData` and `EnchantData` so you do not collide with related keys later.

Phase 4 reserved `900001` after scanning 5,301 devil records
([`docs/ids.md`](../../docs/ids.md)).

## 2. Choose a safe clone

Phase 4 clones stock **Angel `187`** because it is already the Phase 1 enemy:

- `modelID=63`
- family `AERIAL` / race `DIVINE`
- proven spawn on zone `90102`

## 3. Extract stock DevilData

```bash
BIN=/home/cat/repos/smt/comp_hack/build-current/bin
CLIENT=/home/cat/software/smt/game/reimagine
WORK=/tmp/custom-demon
mkdir -p "$WORK"

"$BIN"/comp_decrypt \
  "$CLIENT/BinaryData/Shield/DevilData.sbin" \
  "$WORK/DevilData.plain.bin"
"$BIN"/comp_bdpatch load devil \
  "$WORK/DevilData.plain.bin" \
  "$WORK/DevilData.xml"
```

Confirm an unedited save is byte-identical before continuing.

## 4. Clone and edit Angel `187`

Copy the full `MiDevilData` object and change:

```text
basic.ID              187 -> 900001
basic.name            Angel -> AI Test Demon   # must be unique
unionData.baseDemonID 187 -> 900001
unionData.fusionOptions     2 -> 0
unionData.mitamaFusionID 10187 -> 0
```

Keep `basic.modelID=63` and all category/AI/negotiation/growth/battle fields.

Clearing fusion flags avoids registering the custom ID into stock fusion ranges
before you intentionally add fusion support.

## 5. Rebuild and encrypt

```bash
"$BIN"/comp_bdpatch save devil \
  "$WORK/DevilData.xml" "$WORK/DevilData.plain.bin"
"$BIN"/comp_encrypt \
  "$WORK/DevilData.plain.bin" "$WORK/DevilData.sbin"
```

Reload and confirm stock `187`, custom `900001`, and record count plus one.

## 6. Install client and server copies

```bash
./scripts/build-client-overlay.sh
./scripts/apply-client-overlay.sh /path/to/disposable-client
./scripts/install-shield-overlay.sh
```

Server path:

```text
/var/lib/comp_hack/datastore/BinaryData/Shield/DevilData.sbin
```

Loose replacements are required; package ZIPs cannot override existing Shield
files.

## 7. Point a test spawn at the new ID

In the Phase 1 zone partial:

```xml
<member name="EnemyType">900001</member>
```

Rebuild/install the package:

```bash
./scripts/package-phase1.sh
```

## 8. Validate and test

```bash
/home/cat/repos/smt/comp_hack/build-current/bin/comp_verify server_data 1 ERROR \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip

/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh
```

In game with the disposable overlay client:

1. `@zone 90102`
2. Confirm the enemy name is **AI Test Demon**.
3. Fight it; Phase 1 drops should still work.
4. Optional: `@demon 900001` → summon / storage / relog.

A client without the custom `DevilData` may fail to resolve the demon name the
same way an outdated client hid the Phase 3 item—keep client and server Shield
versions synchronized.
