# COMP_hack XML Syntax

COMP_hack's XML is serialized C++ object data. It is not arbitrary XML: every
object name, member name, type, default, and allowed enum comes from an
Objgen schema under:

```text
comp_hack/libcomp/libcomp/schema/
```

For example, zone fields come from `server_zone.xml`, while spawn fields come
from `spawn.xml`.

## Basic shapes

### Object

```xml
<object name="Spawn">
    ...
</object>
```

`name` selects the generated C++ object type. Some nested objects omit the
name when the containing schema already declares their exact type.

### Scalar member

```xml
<member name="Level">5</member>
```

The schema determines whether this is an integer, float, boolean, string, or
enum. Booleans use `true` and `false`; enum values use names such as `ENEMY`.

### List

```xml
<member name="DropSetIDs">
    <element>900001</element>
    <element>900002</element>
</member>
```

Lists preserve order and may contain duplicate values unless the consuming
code imposes another rule.

### Set

Sets look the same as lists in XML:

```xml
<member name="DynamicMapIDs">
    <element>90102</element>
</member>
```

Internally they contain unique values, and order is not significant.

### Map

```xml
<member name="Spawns">
    <pair>
        <key>900001</key>
        <value>
            <object name="Spawn">
                ...
            </object>
        </value>
    </pair>
</member>
```

Maps associate a unique key with a value. For server definitions, the map key
usually matches the nested object's `ID`. A mismatch can make references
confusing even where the parser accepts it.

### Empty collection

```xml
<member name="NPCs"/>
```

This explicitly creates an empty collection. Most generated collection
members also default to empty when omitted.

## Defaults and omitted members

Schema entries may declare a default:

```xml
<member type="s8" name="Level" default="-1"/>
```

If XML omits `Level`, it becomes `-1`; the server interprets that as inheriting
the demon definition's normal level. If no explicit default is shown, numeric
members generally initialize to zero, booleans to false, strings and
collections to empty, and nullable object pointers to null.

Always check the consuming C++ before assuming what zero means. Zero can mean
"disabled," "inherit," "unlimited," or a valid value depending on the member.

## Numeric type abbreviations

- `u8`, `u16`, `u32`, `u64`: unsigned integer of that bit width.
- `s8`, `s16`, `s32`, `s64`: signed integer.
- `float`, `double`: decimal number.
- `bool`: true/false.
- `string`: text.
- `enum`: one of the schema's listed names.

Schema constraints such as `min`, `max`, `regex`, and fixed array size are
validation rules.

## IDs are scoped by object type

Spawn `900001` and DropSet `900001` can coexist because they are stored in
different lookup tables. Two Spawns with the same key in the same zone cannot.

Record project-owned IDs in `docs/ids.md`. Before assigning IDs that are also
client-facing—items, demons, skills, zones, maps—check the complete client
BinaryData, not only repository XML.

## Definitions versus references

A definition creates an object:

```xml
<object name="DropSet">
    <member name="ID">900001</member>
    ...
</object>
```

A reference points to an already loaded definition:

```xml
<member name="DropSetIDs">
    <element>900001</element>
</member>
```

`comp_verify server_data` is useful because syntactically valid XML can still
contain references to nonexistent items, demons, dropsets, maps, or events.

## Partials and package overlays

`ServerZonePartial` adds or merges content into a loaded zone. It is preferable
to replacing a stock zone when creating a removable package.

Package ZIPs mount at virtual `/`, so their first paths should be `zones/`,
`data/`, `events/`, and so forth—not an extra project folder.

Loose datastore files have priority over package ZIPs. Give new partial files
unique paths instead of trying to shadow a loose stock file from a package.

