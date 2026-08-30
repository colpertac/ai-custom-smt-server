# Guides

Practical guides and XML syntax references for customizing this COMP_hack
server.

## Walkthroughs

- [Custom encounter on an existing zone](custom-zone.md)
- [Custom dungeon on an existing map](custom-dungeon.md)
- [Resource compressors (Macca/Mag/Golden Apple)](resource-compressors.md)
- [Client translation workflow](translation.md)
- [Client updater overlay (HTTP distribute)](updater.md)
- [Translation lingo / terminology](../translation/glossary/lingo.md)
- [Client BinaryData guides](binarydata/README.md)
  - [Extract, edit, and rebuild a table](binarydata/round-trip.md)
  - [Create a custom item](binarydata/custom-item.md)
  - [Create a custom demon](binarydata/custom-demon.md)

## XML syntax

- [How COMP_hack XML is structured](syntax/README.md)
- [ServerZone and ServerZonePartial](syntax/server-zone.md)
- [Spawn, SpawnGroup, and locations](syntax/spawn.md)
- [DropSet and ItemDrop](syntax/drop-set.md)

## Source of truth

These pages explain the current checkout, but COMP_hack's schema files remain
authoritative:

```text
/home/cat/repos/smt/comp_hack/libcomp/libcomp/schema/
```

If a guide and schema disagree, follow the schema and update the guide.

