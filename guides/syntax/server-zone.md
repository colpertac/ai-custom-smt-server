# ServerZone and ServerZonePartial Syntax

Authoritative schema:

```text
comp_hack/libcomp/libcomp/schema/server_zone.xml
```

`ServerZone` describes server behavior layered over a client-known map.
`ServerZonePartial` merges additional collections and restrictions into zones
without replacing their base definitions.

## Minimal global zone

```xml
<objects>
    <object name="ServerZone">
        <member name="ID">90102</member>
        <member name="DynamicMapID">90102</member>
        <member name="Global">true</member>
        <member name="StartingX">0</member>
        <member name="StartingY">0</member>
        <member name="StartingRotation">0</member>
    </object>
</objects>
```

## Identity and routing members

### `ID` (`u32`)

The game zone ID. It must exist in loaded ZoneData. This is the first argument
to GM command `@zone`.

### `DynamicMapID` (`u32`)

Selects the client map layout/variant used by this server zone. It must exist
in DynamicMapData and normally needs matching spot/QMP/client assets.

Zone ID and DynamicMap ID are often equal but do not have to be. COMP_hack can
have multiple ServerZone definitions sharing a Zone ID and distinguished by
DynamicMap ID.

### `Global` (`bool`)

When true, the zone exists independently and can be entered directly. When
false, it normally belongs to a runtime `ServerZoneInstance` and should be
entered through instance creation or `@instance`.

### `Restricted` (`bool`)

Marks a zone as restricted for ordinary direct transition/entry paths. The
server performs additional access checks before allowing entry. Leave false
for a simple development zone.

### `GroupID` (`u32`)

Groups zones for channel distribution and public routing. Existing production
content uses it to select which channel owns a zone. Zero is appropriate for a
simple local test unless surrounding content requires a group.

### `GlobalBossGroup` (`u32`)

Associates the zone with global-boss coordination logic. Zero disables it.
This is specialized content; copy a complete working global-boss example
before using it.

## Starting position

### `StartingX` (`float`)

Default X coordinate when no explicit entry coordinate is supplied.

### `StartingY` (`float`)

Default Y coordinate.

### `StartingRotation` (`float`)

Default facing direction. Existing files commonly use radians, including
negative values.

The coordinates must be valid for the selected DynamicMap and QMP geometry.

## Gameplay settings

### `XPMultiplier` (`float`, default `1.0`)

Zone-level XP multiplier. Instance variants can add another multiplier.

### `BazaarMarketCost` (`u32`, default `100`)

Zone fallback cost for opening a bazaar market when shared server
configuration does not override it.

### `BazaarMarketTime` (`u32`, default `60`)

Zone fallback bazaar duration when not overridden by shared configuration.

### `MountDisabled` (`bool`)

Disables normal mounts in the zone.

### `BikeDisabled` (`bool`)

Disables bike use in the zone.

### `BikeBoostEnabled` (`bool`)

Allows bike boost. This is checked independently of `BikeDisabled`.

### `ValidTeamTypes` (set of `s8`)

Restricts the team types accepted by specialized zone/match logic. Empty means
no explicit values are configured. Reuse values from a comparable working
zone instead of guessing numeric team types.

### `TrackTeam` (`bool`)

Enables server team tracking while characters move into/out of this zone. Used
by match/team-oriented content.

### `DropSetIDs` (set of `u32`)

Zone-wide drop-set references that are considered alongside enemy-specific
drops.

### `GiftSetIDs` (set of `u32`)

Zone-wide gift-set references used by negotiation/gift behavior.

### `SkillBlacklist` (set of `u32`)

Skills forbidden in the zone.

### `SkillWhitelist` (set of `u32`)

Skills explicitly allowed for content that uses whitelist restrictions. Avoid
combining lists without studying the comparable zone's intended logic.

## Content collections

### `NPCs` (list of `ServerNPC`)

Interactive or visible NPC definitions. A ServerNPC inherits position fields:

- `ID`: server object ID;
- `SpotID`: use a client-known spot;
- `X`, `Y`, `Rotation`: explicit placement alternative;
- `State`: NPC state, default `1`;
- `ActorID`: client actor/display definition;
- `Actions`: interactions such as starting an event;
- `DisplayFlag`: conditional display behavior.

Using a valid `SpotID` is usually safer than guessing coordinates.

### `Objects` (list of `ServerObject`)

Interactive server objects. They share the same ID/position base and contain:

- `State`;
- `ActorID`;
- `Actions`.

### `Bazaars` (list of `ServerBazaar`)

Bazaar locations, each referencing a set of market IDs.

### `CultureMachines` (list of `ServerCultureMachineSet`)

Culture-machine configuration, including machines, days, costs, daily rates,
expertise rates, and point thresholds.

### `PlasmaSpawns` (map: `u32` → `PlasmaSpawn`)

Plasma minigame nodes. See `spawn.xml` before editing these.

### `Spawns` (map: `u32` → `Spawn`)

Enemy templates. Defining one does not make it appear; it must be referenced by
a SpawnGroup and SpawnLocationGroup. See [spawn.md](spawn.md).

### `SpawnGroups` (map: `u32` → `SpawnGroup`)

Groups Spawn IDs and quantities.

### `SpawnLocationGroups` (map: `u32` → `SpawnLocationGroup`)

Places SpawnGroups at client spots or coordinate rectangles and controls
respawning.

### `Spots` (map: `u32` → `ServerZoneSpot`)

Adds server behavior to client-known spot IDs. A ServerZoneSpot can contain:

- `ID`;
- `Actions`: actions run when interacting/activating;
- `LeaveActions`: actions run when leaving;
- `SpawnArea`: optional coordinate rectangle;
- `MatchSpawn`: `NONE`, `ALL`, `PVP_BLUE`, or `PVP_RED`;
- `MatchBase`;
- `MatchZoneInLimit`.

### `Triggers` (list of `ServerZoneTrigger`)

Actions fired by zone lifecycle/game conditions. Allowed `Trigger` values:

- `ON_SETUP`, `ON_LOGIN`;
- `PRE_ZONE_IN`, `ON_ZONE_IN`, `ON_ZONE_OUT`;
- `ON_SPAWN`, `ON_DEATH`, `ON_REVIVAL`, `ON_RESPAWN`;
- `ON_FLAG_SET`;
- `ON_TIME`, `ON_SYSTEMTIME`, `ON_MOONPHASE`, `ON_PHASE`;
- `ON_PVP_START`, `ON_PVP_BASE_CAPTURE`, `ON_PVP_COMPLETE`;
- `ON_DIASPORA_BASE_CAPTURE`, `ON_DIASPORA_BASE_RESET`;
- `ON_TOKUSEI_EXPIRED`;
- `ON_UB_TICK`, `ON_UB_GAUGE_OVER`, `ON_UB_GAUGE_UNDER`.

A trigger contains:

```xml
<object name="ServerZoneTrigger">
    <member name="Trigger">ON_ZONE_IN</member>
    <member name="Value">0</member>
    <member name="Actions">
        ...
    </member>
</object>
```

The meaning of `Value` depends on the trigger type.

## ServerZonePartial

Minimal auto-applied partial:

```xml
<objects>
    <object name="ServerZonePartial">
        <member name="ID">900001</member>
        <member name="AutoApply">true</member>
        <member name="DynamicMapIDs">
            <element>90102</element>
        </member>
        <!-- additional collections -->
    </object>
</objects>
```

### Partial-only members

`ID` is the unique partial definition ID.

`DynamicMapIDs` limits the maps on which the partial is valid. For an
auto-applied partial, these IDs determine where it is automatically merged.

`AutoApply` defaults to true. When false, code or instance configuration must
request the partial explicitly.

### Members a partial can merge

A partial can provide:

- `ValidTeamTypes`;
- `DropSetIDs`, `GiftSetIDs`;
- `SkillBlacklist`, `SkillWhitelist`;
- `NPCs`, `Objects`;
- `PlasmaSpawns`;
- `Spawns`, `SpawnGroups`, `SpawnLocationGroups`;
- `Spots`;
- `Triggers`.

It cannot change base identity, starting coordinates, `Global`, `Restricted`,
XP multiplier, vehicle settings, bazaar settings, or other scalar ServerZone
members because those members are not present in the partial schema.

## Related schemas

- `server_zone.xml`: zone, partial, spot, trigger, instance.
- `spawn.xml`: enemies, groups, locations, restrictions, plasma.
- `server_npc.xml`: NPC-only fields.
- `server_object.xml`: object inheritance and positions.
- `action_*.xml`: available actions.

