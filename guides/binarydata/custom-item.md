# Creating a custom item

This walkthrough recreates the Phase 3 **AI Test Token**: an inert,
stackable, tradeable item that reuses stock icon/model data.

Read the [round-trip workflow](round-trip.md) first.

## Required definitions

| Table | `comp_bdpatch` type | Key | Role |
| --- | --- | --- | --- |
| `Shield/ItemData.sbin` | `item` | `common.id` | Mechanics |
| `Shield/CItemData.sbin` | `citem` | `baseData.ID` | Name, description, icon, model |

The keys must match:

```text
ItemData.common.id == CItemData.baseData.ID
```

`ItemData.basic.baseID` describes a base/variant relationship. It is not the
primary lookup key.

`SItemData` is unnecessary when the item has no tokusei.
`ShopProductData` is only required when distributing the item through a shop.

## 1. Reserve an ID

Extract both complete local tables and check the candidate ID in each. Do not
assume an ID absent from server XML is unused by the client.

Phase 3 scanned 16,581 records and reserved `900001` in
[`docs/ids.md`](../../docs/ids.md).

## 2. Choose a safe clone

Phase 3 clones stock item `501`, Suginami Tunnels Plate (Bronze):

- non-equipment
- stack size `100`
- no use skill
- trade, bazaar, sell, discard, and storage flags
- icon `501`
- model `0`

Reusing icon/model references means no `CIconData`, model asset, equipment
model, motion, or effect changes are needed.

## 3. Extract the stock tables

```bash
BIN=/home/cat/repos/smt/comp_hack/build-current/bin
CLIENT=/home/cat/software/smt/game/reimagine
WORK=/tmp/custom-item
mkdir -p "$WORK"

"$BIN"/comp_decrypt \
  "$CLIENT/BinaryData/Shield/ItemData.sbin" \
  "$WORK/ItemData.plain.bin"
"$BIN"/comp_bdpatch load item \
  "$WORK/ItemData.plain.bin" \
  "$WORK/ItemData.xml"

"$BIN"/comp_decrypt \
  "$CLIENT/BinaryData/Shield/CItemData.sbin" \
  "$WORK/CItemData.plain.bin"
"$BIN"/comp_bdpatch load citem \
  "$WORK/CItemData.plain.bin" \
  "$WORK/CItemData.xml"
```

Confirm an unedited save is byte-identical before continuing.

## 4. Clone and edit item `501`

Copy the complete `MiItemData` object for `501` and change:

```text
common.id       501 -> 900001
basic.baseID    501 -> 900001
```

Keep these important mechanical values:

```text
basic.equipType       EQUIP_TYPE_NONE
basic.weaponType      NONE
basic.flags           63
possession.stackSize  100
possession.useSkill   0
```

Copy the corresponding `MiCItemData` object and change:

```text
baseData.ID      501 -> 900001
baseData.name           AI Test Token
baseData.name2          AI Test Token
baseData.desc           Phase 3 custom item...
```

Keep:

```text
baseData.icon       501
baseData.category   24
baseData.tradeList  true
baseData.modelID    0
```

Names use a fixed 36-byte field and descriptions a fixed 516-byte field in
the client's encoding. Keep text comfortably below those limits.

## 5. Rebuild and encrypt

```bash
"$BIN"/comp_bdpatch save item \
  "$WORK/ItemData.xml" "$WORK/ItemData.plain.bin"
"$BIN"/comp_encrypt \
  "$WORK/ItemData.plain.bin" "$WORK/ItemData.sbin"

"$BIN"/comp_bdpatch save citem \
  "$WORK/CItemData.xml" "$WORK/CItemData.plain.bin"
"$BIN"/comp_encrypt \
  "$WORK/CItemData.plain.bin" "$WORK/CItemData.sbin"
```

Reload both plaintext outputs. Confirm stock item `501`, custom item `900001`,
and the original record count plus one.

## 6. Install client and server copies

Place the rebuilt files in:

```text
client-overlay/BinaryData/Shield/ItemData.sbin
client-overlay/BinaryData/Shield/CItemData.sbin
```

Build/apply the client overlay and install matching server files:

```bash
./scripts/build-client-overlay.sh
./scripts/apply-client-overlay.sh /path/to/disposable-client
./scripts/install-phase3-shield.sh
```

The server paths are:

```text
/var/lib/comp_hack/datastore/BinaryData/Shield/ItemData.sbin
/var/lib/comp_hack/datastore/BinaryData/Shield/CItemData.sbin
```

These are loose replacements because package ZIPs cannot override existing
loose Shield tables.

## 7. Add a test drop

Phase 3 adds a guaranteed `ItemType 900001` entry to Phase 1 DropSet
`900001`, while retaining Macca Note `699` as a regression check:

```xml
<element>
    <object>
        <member name="ItemType">900001</member>
        <member name="MinStack">1</member>
        <member name="MaxStack">1</member>
        <member name="Rate">100</member>
    </object>
</element>
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
2. Defeat the Phase 1 enemy.
3. Confirm Macca Note and AI Test Token both drop.
4. Check name, icon, stack merging/splitting, trade, sell, discard, storage,
   relog persistence, and deletion.

An older client without the custom definitions can still receive and persist
the item on the server, but its inventory UI hides the unresolved item. This
can leave invisible occupied slots, so client/server BinaryData versions must
remain synchronized.
