# AutoCompressCurrency (pre–Phase 6)

Compression runs inside `CharacterManager::AddRemoveItems` when
`WorldSharedConfig.AutoCompressCurrency` is true and items are being **added**.

Hard-coded pairs (compile-time thresholds `ITEM_MACCA_NOTE_AMOUNT` /
`ITEM_MAG_PRESSER_AMOUNT`, both 50000):

| Base | Compressed |
|------|------------|
| Macca `799` | Macca Note `699` |
| Magnetite `800` | Mag Presser `27375` |

Two stages: rewrite the incoming quantity map, then while filling stacks convert
overflowing stacks into +1 compressed item.

Macca notes break during `PayMacca` / `CalculateMaccaPayment`. Mag Pressers have
no pay-time decompress. ShopSell / Bazaar always emit notes for Macca proceeds
(ignore the flag).

Enable in `world.xml`:

```xml
<member name="WorldSharedConfig">
    <object>
        <member name="AutoCompressCurrency">true</member>
    </object>
</member>
```

Phase 6 replaces the hard-coded compress branches with `/data/compressors`
`CurrencyCompressor` records. See [phase6.md](phase6.md).
