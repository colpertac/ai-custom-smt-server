# Spawn Syntax

Authoritative schema:

```text
comp_hack/libcomp/libcomp/schema/spawn.xml
```

Enemy placement has three layers:

```text
Spawn                 what the enemy is
  ↑
SpawnGroup            which Spawn IDs and how many
  ↑
SpawnLocationGroup    where, when, and whether they respawn
```

All three are required for a normal automatic encounter.

## Spawn

Example:

```xml
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
```

### `ID` (`u32`)

Unique spawn template ID within its ServerZone after partials are merged.
The containing `Spawns` map key should match this ID.

### `EnemyType` (`u32`)

Demon/enemy definition ID from loaded DevilData. Use an existing ID unless
you are also producing synchronized custom client/server BinaryData.

### `VariantType` (`u32`)

Optional enemy variant definition. Zero means no explicit variant. Existing
content should be copied when using variants because they can alter stats,
skills, appearance, or encounter behavior through related definitions.

### `Category` (enum)

Allowed values:

- `ENEMY`: ordinary hostile enemy;
- `BOSS`: boss-category enemy;
- `ALLY`: allied/non-hostile category.

If omitted, the generated enum's zero value is `ENEMY`.

### `BossGroup` (`u8`, maximum `3`)

Assigns a boss grouping used by boss/encounter logic. Zero means no group.

### `FactionGroup` (`s32`, minimum `0`)

Faction association for specialized content. Zero means no explicit group.

### `Drops` (list of `ItemDrop`)

Direct inline drop definitions:

```xml
<member name="Drops">
    <element>
        <object>
            <member name="ItemType">699</member>
            <member name="Rate">100</member>
        </object>
    </element>
</member>
```

See [drop-set.md](drop-set.md) for ItemDrop members.

### `DropSetIDs` (list of `u32`)

References reusable DropSet definitions loaded from `/data/dropset`.

### `CanRevive` (`bool`)

Allows this enemy entity to participate in enemy revival behavior.

### `InheritDrops` (`bool`, default `true`)

Controls whether this spawn inherits the demon definition's normal drop
configuration in addition to spawn-specific drops. Set false when the
encounter must use only explicitly defined drops.

### `ValidDemonQuestTarget` (`bool`, default `true`)

Whether kills/negotiation involving this spawn may count as demon-quest
targets.

### `Gifts` (list of `ItemDrop`)

Direct negotiation gift definitions.

### `GiftSetIDs` (list of `u32`)

References reusable gift DropSets.

### `Level` (`s8`, default `-1`)

Enemy level override. `-1` inherits the normal demon level. Explicit values
must fit signed 8-bit range.

### `XP` (`s64`, default `-1`)

XP reward override. `-1` uses inherited/default calculation.

### `KillValue` (`s32`, minimum `0`)

Special score/resource value awarded for the kill.

### `KillValueType` (enum)

Determines what `KillValue` represents:

- `INHERITED`;
- `SOUL_POINTS`;
- `BETHEL`;
- `UB_POINTS`;
- `ZIOTITE`.

This is specialized match/dungeon content. Zero/default is `INHERITED`.

### `BaseAIType` (`u16`)

Overrides the demon definition's base AI type. Zero leaves normal selection in
place.

### `AIScriptID` (string)

Names a Squirrel AI script loaded by the AI manager. An invalid script can
prevent proper enemy initialization.

### `LogicGroupID` (`u16`)

Overrides the demon definition's AI logic group.

### `TalkResist` (`u8`)

Negotiation resistance percentage. The server rejects negotiation when this
is `100` or greater. Lower values reduce the success chance.

### `TalkResults` (`u8`, default `3`)

Bit flags controlling allowed successful negotiation outcomes:

- bit `1`: demon can join;
- bit `2`: demon can give a gift;
- default `3`: both outcomes allowed.

Examples:

```xml
<member name="TalkResults">1</member> <!-- join only -->
<member name="TalkResults">2</member> <!-- gift only -->
<member name="TalkResults">3</member> <!-- both -->
```

## SpawnGroup

Example:

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

### `ID` (`u32`)

Unique group ID within the zone. The containing map key should match.

### `Spawns` (map: Spawn ID → `u16` count)

Each key references an entry in the zone's `Spawns` map. Each value is the
number of that enemy template to create.

```xml
<member name="Spawns">
    <pair>
        <key>900001</key>
        <value>3</value>
    </pair>
    <pair>
        <key>900002</key>
        <value>1</value>
    </pair>
</member>
```

This creates three of Spawn `900001` and one of Spawn `900002` when that group
is selected.

### `Restrictions` (`SpawnRestriction`, nullable)

Optional schedule/enable restrictions for the group. Omit it for no
restriction.

### `SpawnActions` (list of `Action`)

Actions executed when the group spawns.

### `DefeatActions` (list of `Action`)

Actions executed when the group is defeated. These can set flags, start
events, create loot, advance instance logic, or run other supported actions.

## SpawnLocationGroup

Example:

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

### `ID` (`u32`)

Unique location-group ID within the zone. The containing map key should match.

### `GroupIDs` (list of `u32`)

References candidate SpawnGroup IDs. Existing content may use one or multiple
groups depending on encounter randomization.

### `RespawnTime` (`float`)

Seconds used by respawn scheduling. A positive value enables timed respawns.
With zero, ordinary repeat respawning is not scheduled.

### `ImmediateSpawn` (`bool`)

When true, the encounter can spawn immediately when the zone initializes.
When false and `RespawnTime` is positive, initial creation is delayed by the
respawn interval.

### `SpotIDs` (set of `u32`)

Client-known spot IDs used as spawn areas. This is often preferable on a
well-defined map because spots already describe valid locations.

### `SpotSelection` (enum, default `RANDOM`)

- `RANDOM`: select spots randomly;
- `SPREAD`: spread creation over available spots.

### `Locations` (list of `SpawnLocation`)

Explicit coordinate rectangles used as spawn areas. A location has:

- `X` (`float`);
- `Y` (`float`);
- `Width` (`float`);
- `Height` (`float`).

The server chooses a position within the rectangle. Coordinates are specific
to the DynamicMap and must agree with QMP collision geometry.

You can use `SpotIDs`, explicit `Locations`, or patterns copied from existing
content. Avoid arbitrary coordinates on unfamiliar maps.

## SpawnRestriction

Restrictions can be attached to a SpawnGroup or PlasmaSpawn.

### `Disabled` (`bool`)

Disables the restricted object.

### `TimeRestriction` (map: `u16` → `u16`)

Allowed in-game time ranges. Keys and values use HHMM-like values from `0` to
`2400`.

```xml
<member name="TimeRestriction">
    <pair>
        <key>1800</key>
        <value>2400</value>
    </pair>
</member>
```

### `SystemTimeRestriction` (map: `u16` → `u16`)

Allowed real/system clock ranges, also `0`–`2400`.

### `DateRestriction` (map: `u16` → `u16`)

Allowed MMDD-like date ranges from `0` to `1231`.

### `MoonRestriction` (`u16`, default `0xFFFF`)

Moon-phase bit mask. The default allows all phases.

### `DayRestriction` (`u8`, default `0x7F`)

Day-of-week bit mask. The default permits all seven days.

Copy known working restrictions before creating custom masks.

## PlasmaSpawn

Plasma is separate from enemy Spawn, but shares this schema. It inherits
`ID`, `SpotID`, `X`, `Y`, and `Rotation`, then adds:

- `PointCount`;
- `Color`;
- `PickTime`;
- `PickSpeed`;
- `PickSize`;
- `RespawnTime`;
- `DropSetID`;
- optional `Restrictions`;
- `SuccessActions`;
- `FailActions`.

Use an existing plasma definition as a full template; the numeric minigame
fields are client-mechanic-specific.

## Common mistakes

- Defining a Spawn but no SpawnGroup.
- Defining a SpawnGroup but no SpawnLocationGroup.
- Referencing a missing Spawn or DropSet ID.
- Using an EnemyType absent from DevilData.
- Using mismatched map keys and nested IDs.
- Setting coordinates outside valid map geometry.
- Expecting XML to hot-reload without restarting the channel.

