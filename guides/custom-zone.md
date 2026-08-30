# Adding a Custom Encounter to an Existing Zone

This walkthrough recreates Phase 1: one enemy on empty map `90102` with a
guaranteed Macca Note drop (plus Phase 3 AI Test Token), delivered as a
removable package.

Use the syntax references when you want to understand or discover additional
members:

- [ServerZone and ServerZonePartial](syntax/server-zone.md)
- [Spawn, SpawnGroup, and locations](syntax/spawn.md)
- [DropSet and ItemDrop](syntax/drop-set.md)
- [General XML shapes and types](syntax/README.md)

## Result

```text
DynamicMap 90102
  └─ auto-applies ZonePartial 900001
       ├─ Spawn 900001: EnemyType 900001 (AI Test Demon; clone of Angel 187)
       ├─ SpawnGroup 900001: one enemy
       └─ SpawnLocationGroup 900001: near (200,0), 15s respawn

Spawn 900001
  └─ DropSet 900001
       ├─ one Macca Note (ItemType 699), Rate 100
       └─ one AI Test Token (ItemType 900001), Rate 100
```

No C++ rebuild is required for the zone/drop XML. The custom item needs
synchronized Shield `ItemData`/`CItemData` (see [phase3.md](../docs/phase3.md)).
The map and enemy already exist in the stock client.

## Project files

```text
server-content/
├── data/dropset/ai_custom_phase1.xml
├── packages/zzz_ai_custom_phase1.zip
└── zones/
    ├── partial/ai_custom_phase1.xml
    ├── zone-90102.stock.xml
    └── zone-90102.xml
```

- `zone-90102.stock.xml` preserves the untouched base definition.
- `zone-90102.xml` is an educational merged view; it is not installed.
- The partial and dropset are the real package inputs.

## Step 1: choose a client-known map

Zone `90102` is global and nearly empty:

```xml
<object name="ServerZone">
    <member name="ID">90102</member>
    <member name="DynamicMapID">90102</member>
    <member name="Global">true</member>
    <member name="StartingX">0</member>
    <member name="StartingY">0</member>
    <member name="StartingRotation">0</member>
</object>
```

Because it is global, a GM can enter it directly:

```text
@zone 90102
```

For a **private** copy of the same map (instance dungeon), see
[custom-dungeon.md](custom-dungeon.md). Do not flip this zone to
`Global=false` or Phase 1 `@zone` breaks.

Do not substitute an arbitrary new Zone/DynamicMap ID. It must already exist
in the loaded client/server BinaryData. See
[syntax/server-zone.md](syntax/server-zone.md) for those distinctions.

## Step 2: create an auto-applied partial

Create:

```text
server-content/zones/partial/ai_custom_phase1.xml
```

Start with:

```xml
<objects>
    <object name="ServerZonePartial">
        <member name="ID">900001</member>
        <member name="AutoApply">true</member>
        <member name="DynamicMapIDs">
            <element>90102</element>
        </member>

        <!-- spawn collections go here -->
    </object>
</objects>
```

This merges the partial into every loaded zone using DynamicMap `90102`.

Why a partial instead of a replacement zone? Loose datastore files have
priority over package ZIPs, so the stock loose `zone-90102.xml` would hide a
replacement at the same path inside the ZIP. A uniquely named partial avoids
that collision and is removable.

## Step 3: define the Spawn

Inside the partial, add:

```xml
<member name="Spawns">
    <pair>
        <key>900001</key>
        <value>
            <object name="Spawn">
                <member name="ID">900001</member>
                <member name="EnemyType">187</member>
                <member name="Category">ENEMY</member>
                <member name="Level">5</member>
                <member name="TalkResist">100</member>
                <member name="XP">50</member>
                <member name="DropSetIDs">
                    <element>900001</element>
                </member>
            </object>
        </value>
    </pair>
</member>
```

This defines an enemy template but does not place it. EnemyType `900001` is
the Phase 4 custom demon (clone of stock Angel `187`). See
[custom-demon.md](binarydata/custom-demon.md). Early Phase 1 used stock `187`
before BinaryData edits existed. TalkResist `100` disables negotiation for
this test.

See [syntax/spawn.md](syntax/spawn.md) for every available Spawn member,
including AI overrides, gifts, direct drops, kill values, and negotiation
flags.

## Step 4: define the SpawnGroup

```xml
<member name="SpawnGroups">
    <pair>
        <key>900001</key>
        <value>
            <object name="SpawnGroup">
                <member name="ID">900001</member>
                <member name="Spawns">
                    <pair>
                        <key>900001</key>
                        <value>1</value>
                    </pair>
                </member>
            </object>
        </value>
    </pair>
</member>
```

The inner key references Spawn `900001`; value `1` requests one copy.

## Step 5: place the group

```xml
<member name="SpawnLocationGroups">
    <pair>
        <key>900001</key>
        <value>
            <object name="SpawnLocationGroup">
                <member name="ID">900001</member>
                <member name="GroupIDs">
                    <element>900001</element>
                </member>
                <member name="ImmediateSpawn">true</member>
                <member name="RespawnTime">15</member>
                <member name="Locations">
                    <element>
                        <object name="SpawnLocation">
                            <member name="X">200</member>
                            <member name="Y">0</member>
                            <member name="Width">100</member>
                            <member name="Height">100</member>
                        </object>
                    </element>
                </member>
            </object>
        </value>
    </pair>
</member>
```

This creates the encounter near zone start `(0,0)` and schedules respawning.
Coordinates are specific to the selected map. Copy known spots/locations when
working with unfamiliar geometry.

## Step 6: create the DropSet

Create:

```text
server-content/data/dropset/ai_custom_phase1.xml
```

```xml
<objects>
    <object name="DropSet">
        <member name="ID">900001</member>
        <member name="Drops">
            <element>
                <object>
                    <member name="ItemType">699</member>
                    <member name="MinStack">1</member>
                    <member name="MaxStack">1</member>
                    <member name="Rate">100</member>
                </object>
            </element>
            <element>
                <object>
                    <member name="ItemType">900001</member>
                    <member name="MinStack">1</member>
                    <member name="MaxStack">1</member>
                    <member name="Rate">100</member>
                </object>
            </element>
        </member>
    </object>
</objects>
```

Spawn `900001` references this DropSet. Item `699` is an existing Macca Note
(stock client/server). Item `900001` is the Phase 3 custom token and needs the
Shield BinaryData overlay documented in [phase3.md](../docs/phase3.md).

## Step 7: record IDs

Record project-owned identifiers in `docs/ids.md`. This example uses `900001`
for several different object types. That is valid because each type has its
own lookup table, but IDs must remain unique within a type.

Client-facing IDs—items, demons, zones, maps, skills—need an additional
BinaryData collision check before allocation.

## Step 8: package and install

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
./scripts/package-phase1.sh
```

The resulting ZIP must have virtual datastore paths at its root:

```text
zzz_ai_custom_phase1.zip
├── zones/partial/ai_custom_phase1.xml
└── data/dropset/ai_custom_phase1.xml
```

It is installed at:

```text
/var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

## Step 9: validate

Build `comp_verify` once:

```bash
cmake --build /home/cat/repos/smt/comp_hack/build-current \
  --target comp_verify -j2
```

`comp_verify` does not discover `packages/*.zip` automatically. Mount both
paths explicitly:

```bash
cd /home/cat/repos/smt/comp_hack

build-current/bin/comp_verify server_data 1 WARNING \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

Known client-data warnings may remain. Relevant failures mention custom IDs,
invalid references, malformed XML, or failure to load the two custom files.

## Step 10: restart and test

```bash
cd /home/cat/repos/smt/comp_hack
./scripts/stop.sh
./scripts/start.sh
./scripts/status.sh
```

In game:

```text
@zone 90102
```

Expected:

1. one enemy appears near the starting position;
2. killing it drops one Macca Note and one AI Test Token;
3. it returns after roughly 15 seconds.

## Modify or remove

Modify the human-authored XML, rerun `package-phase1.sh`, validate, and restart.

Remove:

```bash
rm /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
rm /home/cat/repos/smt/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip

cd /home/cat/repos/smt/comp_hack
./scripts/stop.sh
./scripts/start.sh
```

Safe next experiments:

- alter Level, XP, spawn count, coordinates, or respawn time;
- add another existing EnemyType;
- add another existing item to the DropSet;
- attach DefeatActions;
- use client-known SpotIDs instead of coordinate rectangles.

