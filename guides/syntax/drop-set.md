# DropSet and ItemDrop Syntax

Authoritative schema:

```text
comp_hack/libcomp/libcomp/schema/item.xml
```

A `DropSet` is a reusable collection of `ItemDrop` entries. Spawns, zones,
plasma, actions, gifts, and other systems can reference a DropSet by ID.

## Minimal guaranteed drop

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
        </member>
    </object>
</objects>
```

This defines DropSet `900001`, containing one ItemDrop that gives one Macca
Note (`699`) at a 100% rate.

## DropSet members

### `ID` (`u32`)

Unique DropSet ID across loaded server data. References use this number:

```xml
<member name="DropSetIDs">
    <element>900001</element>
</member>
```

### `Type` (enum)

Allowed values:

- `NORMAL`: ordinary drop set;
- `REDEFINE`: replaces the drops of an already loaded set with the same ID;
- `APPEND`: adds entries to an already loaded set with the same ID;
- `DESTINY`: marks entries for the game's separate destiny-drop handling.

For project-owned IDs, use `NORMAL` or omit `Type` (the enum's zero/default
value). `REDEFINE` and `APPEND` are primarily overlay mechanisms for modifying
existing IDs; they require the base set to exist.

### `MutexID` (`u32`)

Groups mutually exclusive DropSets. During selection, only one eligible set
from a mutex group is retained. Zero means no mutex group.

Use this for alternative reward tables, not individual drop chances.

### `GiftBoxID` (`u32`)

Indexes this DropSet for gift-box/random-item lookups. Zero means it is not
registered as a gift-box set. This becomes relevant to deterministic item
conversion and `SKILL_RANDOM_ITEM`.

### `Drops` (list of `ItemDrop`)

The drop entries in this set.

### `Conditions` (list of `EventCondition`)

Conditions that determine whether the set is eligible. Conditions can inspect
flags, inventory, levels, dates, and other supported event state depending on
their type.

Copy conditions from a comparable existing DropSet and validate them; the
condition object syntax is defined in event-condition schemas.

## ItemDrop members

### `ItemType` (`u32`)

Item definition ID. It must exist in loaded ItemData. The client also needs
matching display/model/icon definitions to show a custom item correctly.

### `Rate` (`float`)

Drop probability/rate. Existing ordinary content uses values on a percentage
scale, so `100` is guaranteed, `50` is approximately half, and fractional
values such as `0.5` represent rare drops.

The final result can still be affected by set type, conditions, cooldown
restrictions, and the system consuming the DropSet.

### `MinStack` (`u16`, default `1`)

Minimum quantity produced when this entry succeeds.

### `MaxStack` (`u16`, default `1`)

Maximum quantity. Set equal to `MinStack` for a fixed quantity.

Do not exceed the item's supported stack size unless the consuming logic is
known to split stacks safely.

### `Type` (enum)

Allowed values:

- `NORMAL`: ordinary drop behavior;
- `LEVEL_MULTIPLY`: multiply MinStack and MaxStack by
  `enemy level × Modifier`;
- `RELATIVE_LEVEL_MIN`: include the drop only when the relevant entity's level
  is at least `source level + Modifier`.

For a normal item drop, omit `Type`.

### `Modifier` (`float`, default `1.0`)

Parameter used by non-normal ItemDrop types:

- for `LEVEL_MULTIPLY`, it scales stack counts with enemy level;
- for `RELATIVE_LEVEL_MIN`, it is the relative level offset.

It has no special effect for `NORMAL`.

### `CooldownRestrict` (`s32`)

Associates the drop with a cooldown/restriction group. The loot system tracks
these groups to prevent conflicting or repeated restricted rewards.

Zero means no cooldown restriction. Do not invent a nonzero group without
examining the event/reward system that sets and clears it.

## Inline drops versus DropSets

Inline:

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

Reusable:

```xml
<member name="DropSetIDs">
    <element>900001</element>
</member>
```

Use inline drops for one-off encounter behavior. Use DropSets when:

- multiple enemies/actions share rewards;
- conditions are needed;
- the reward may be appended/redefined by packages;
- it participates in gift-box, mutex, destiny, or conversion behavior.

## Gifts

Spawn `Gifts` and `GiftSetIDs` use the same ItemDrop/DropSet data structures,
but they are consumed by negotiation gift logic rather than ordinary kill
loot.

## Example with multiple entries

```xml
<object name="DropSet">
    <member name="ID">900002</member>
    <member name="Drops">
        <element>
            <object>
                <member name="ItemType">699</member>
                <member name="Rate">100</member>
                <member name="MinStack">1</member>
                <member name="MaxStack">1</member>
            </object>
        </element>
        <element>
            <object>
                <member name="ItemType">101</member>
                <member name="Rate">10</member>
                <member name="MinStack">1</member>
                <member name="MaxStack">1</member>
            </object>
        </element>
    </member>
</object>
```

Each ItemDrop is evaluated as its own entry. This example always attempts the
first drop and gives the second item at its lower rate.

## Common mistakes

- Reusing an existing DropSet ID unintentionally.
- Referencing a custom item absent from ItemData.
- Forgetting to reference the DropSet from a Spawn/action/zone.
- Assuming `Rate=1` means 100%; ordinary content treats it as roughly 1%.
- Setting MinStack greater than MaxStack.
- Using `APPEND` or `REDEFINE` without a base set.
- Running `comp_verify` without also mounting the package ZIP.

