# Guide: Adding a Custom Encounter to an Existing Zone

This guide explains how the Phase 1 encounter was built, why it uses a zone
partial, and how to make similar server-side content without recompiling
COMP_hack or patching the client.

The completed example is available under:

```text
ai_custom_smt_server/server-content/
├── data/dropset/ai_custom_phase1.xml
├── packages/zzz_ai_custom_phase1.zip
└── zones/
    ├── partial/ai_custom_phase1.xml
    ├── zone-90102.stock.xml
    └── zone-90102.xml
```

## Mental model

There are four connected pieces:

```text
DynamicMap 90102
  └─ automatically receives ZonePartial 900001
       ├─ defines Spawn 900001 (existing demon type 187)
       ├─ defines SpawnGroup 900001 (one copy of that spawn)
       └─ defines SpawnLocationGroup 900001 (where/when it appears)

Spawn 900001
  └─ references DropSet 900001
       └─ always drops one Macca Note (item 699)
```

The channel server reads these definitions during startup. No C++ source is
changed, so no server rebuild is required. The demon, item, and map are already
known by the client, so no client patch is required either.

## 1. Choose an existing map

The example uses stock zone and DynamicMap `90102`:

```xml
<member name="ID">90102</member>
<member name="DynamicMapID">90102</member>
<member name="Global">true</member>
```

It was a useful test map because its stock server definition is nearly empty
and it is global. A GM can enter it directly:

```text
@zone 90102
```

An arbitrary new zone number would not work. The Zone ID and DynamicMap ID
must exist in the loaded client/server BinaryData. Entirely new maps are a
later project involving `ZoneData`, `DynamicMapData`, QMP collision geometry,
spot data, and client assets.

The untouched copy is preserved as:

```text
server-content/zones/zone-90102.stock.xml
```

`server-content/zones/zone-90102.xml` is an educational merged view showing
what the zone looks like after applying the partial. It is not installed.

## 2. Use an auto-applied zone partial

The live modification is:

```text
server-content/zones/partial/ai_custom_phase1.xml
```

Its header selects a unique partial ID and the map it affects:

```xml
<object name="ServerZonePartial">
    <member name="ID">900001</member>
    <member name="AutoApply">true</member>
    <member name="DynamicMapIDs">
        <element>90102</element>
    </member>
```

`AutoApply=true` means COMP_hack merges this definition whenever it creates a
zone using DynamicMap `90102`.

### Why not replace `zone-90102.xml` in the ZIP?

COMP_hack mounts package ZIPs after the loose datastore directory. Loose files
have higher priority. The existing loose `/zones/zone-90102.xml` would hide a
replacement with the same path inside the package.

A separately named partial does not collide with the stock file. Removing the
package removes the partial and leaves the original zone untouched.

## 3. Define the enemy template

The `Spawns` map defines what an enemy is:

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

Important fields:

- `ID`: server-local spawn template ID.
- `EnemyType`: an existing demon ID loaded from `DevilData`.
- `Category`: regular enemy, boss, or ally.
- `Level` and `XP`: overrides for this encounter.
- `TalkResist`: `100` prevents negotiation during this simple test.
- `DropSetIDs`: connects the enemy to the separately defined drop table.

The `<key>` and the object's `<member name="ID">` are both `900001`. Keeping
those synchronized avoids confusing lookup failures.

## 4. Define how many enemies appear

A spawn template does not appear by itself. `SpawnGroup` says which templates
to instantiate and in what quantity:

```xml
<object name="SpawnGroup">
    <member name="ID">900001</member>
    <member name="Spawns">
        <pair>
            <key>900001</key>
            <value>1</value>
        </pair>
    </member>
</object>
```

Here:

- key `900001` references Spawn `900001`;
- value `1` requests one enemy.

Increasing the value creates more copies. Additional pairs can mix different
spawn templates in one encounter group.

## 5. Choose its location and respawn behavior

`SpawnLocationGroup` links a spawn group to coordinates:

```xml
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
```

- `GroupIDs` references SpawnGroup `900001`.
- `ImmediateSpawn=true` creates the encounter when the zone starts.
- `RespawnTime=15` respawns it after approximately 15 seconds.
- `X` and `Y` place it near the zone start at `(0, 0)`.
- `Width` and `Height` form a rectangular random spawn area.

Coordinates are map-specific. For unfamiliar maps, copy coordinates or Spot
IDs from an existing zone definition before experimenting.

## 6. Define the recognizable drop

The drop set lives at:

```text
server-content/data/dropset/ai_custom_phase1.xml
```

```xml
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
    </member>
</object>
```

- `ID=900001` matches the ID referenced by the Spawn.
- `ItemType=699` is the existing Macca Note.
- stack size is exactly one.
- `Rate=100` makes the test drop guaranteed.

An item ID must already exist in the server and client BinaryData. Creating a
new ItemType is Phase 3 and requires synchronized client/server definitions.

## 7. Keep an ID registry

Every project-owned ID is recorded in:

```text
docs/ids.md
```

The example reuses `900001` across different object namespaces:

- zone partial;
- drop set;
- spawn;
- spawn group;
- spawn location group.

Those types have separate lookup tables, so this is valid. It also makes the
small example easier to trace. Do not assume an ID is unused merely because
it does not appear in one XML directory; client BinaryData may still use it.

## 8. Build and install the package

Run:

```bash
cd /home/cat/repos/smt/ai_custom_smt_server
./scripts/package-phase1.sh
```

The script:

1. creates a temporary staging directory;
2. copies the partial to `zones/partial/`;
3. copies the drop set to `data/dropset/`;
4. creates `zzz_ai_custom_phase1.zip`;
5. installs it under `/var/lib/comp_hack/datastore/packages/`;
6. also places a development copy under the repository datastore.

The ZIP root must contain `zones/` and `data/` directly:

```text
zzz_ai_custom_phase1.zip
├── zones/partial/ai_custom_phase1.xml
└── data/dropset/ai_custom_phase1.xml
```

Do not wrap those paths in an extra top-level folder.

## 9. Validate the package

Build the verification tool once:

```bash
cmake --build /home/cat/repos/smt/comp_hack/build-current \
  --target comp_verify -j2
```

`comp_verify` does not automatically discover `packages/*.zip`, unlike the
real servers. Pass the package as a second datastore search path:

```bash
cd /home/cat/repos/smt/comp_hack

build-current/bin/comp_verify server_data 1 WARNING \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

The existing client data produces numerous known missing-spot warnings.
Relevant failures would mention the custom IDs, an invalid demon/item/drop-set
reference, malformed XML, or a failure to load the custom files.

For detailed load output, change `WARNING` to `DEBUG` and confirm:

```text
Loaded XML file: /data/dropset/ai_custom_phase1.xml
Loaded XML file: /zones/partial/ai_custom_phase1.xml
```

## 10. Restart and test in-game

Definitions are loaded at channel startup; they are not hot-reloaded:

```bash
cd /home/cat/repos/smt/comp_hack
./scripts/stop.sh
./scripts/start.sh
./scripts/status.sh
```

Then enter:

```text
@zone 90102
```

Expected result:

1. one enemy appears near the starting position;
2. killing it drops one Macca Note;
3. another enemy appears after roughly 15 seconds.

## 11. Remove or modify it

Remove:

```bash
rm /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
rm /home/cat/repos/smt/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip

cd /home/cat/repos/smt/comp_hack
./scripts/stop.sh
./scripts/start.sh
```

Modify:

1. edit the XML source under `ai_custom_smt_server/server-content/`;
2. rerun `scripts/package-phase1.sh`;
3. rerun `comp_verify`;
4. restart the servers;
5. test again.

Useful safe experiments:

- change `Level` or `XP`;
- change the spawn count;
- move the spawn rectangle;
- change the respawn timer;
- select another existing EnemyType;
- add another existing item to the drop set;
- use multiple spawn groups or location rectangles.

Avoid starting with arbitrary demon, item, zone, or map IDs. Undefined IDs are
the most common reason a data-driven experiment fails to load.

