# Resource Compressors

Phase 6 turns hard-coded Macca/Mag compression into data-driven
`CurrencyCompressor` records under `/data/compressors`.

## Enable

In `/etc/comp_hack/world.xml`:

```xml
<member name="WorldSharedConfig">
    <object>
        <member name="AutoCompressCurrency">true</member>
    </object>
</member>
```

## Mapping XML

```xml
<object name="CurrencyCompressor">
    <member name="ID">900001</member>
    <member name="BaseItemID">21941</member>
    <member name="CompressedItemID">900003</member>
    <member name="Value">50000</member>
</object>
```

Stock Macca/Mag live in `data/compressors/00_stock.xml`. Custom mappings can
ship in a package ZIP (see `scripts/package-phase6.sh`).

## Decompress (Golden Apple)

Compressed item `useSkill` points at skill **900001** with `functionID` 320
(`SKILL_RANDOM_ITEM`). Skill item cost is the compressed item itself.
`specialParams[0]` is GiftBoxID **900002** whose DropSet returns `Value` of the
base Magical Golden Apple. Grants skip AutoCompressCurrency so the stack is not
immediately recompressed.

Macca Note / Mag Presser yes/no dialogs are client-hardcoded for those item IDs
(skill function 318). Custom compressors use the RandomItem path instead.

## Notes

- Compression runs only on **add** in `AddRemoveItems`.
- Macca notes still break during `PayMacca`; Mag Pressers do not.
- ShopSell/Bazaar still hard-code Macca note splits.
