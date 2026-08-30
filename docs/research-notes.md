# Research Notes

Findings from early codebase exploration. Prefer these facts when starting
Phases 1–6 of [ROADMAP.md](../ROADMAP.md).

## Datastore packages

- Put custom content ZIPs under the first configured datastore's `packages/`.
- ZIP contents must look like virtual paths: `zones/...`, `data/...`,
  `events/...`, `scripts/...`.
- Loose datastore files win over package files. Among ZIPs, descending
  filename order wins.
- No example packages currently exist under `comp_hack/datastore/packages/`.

## Best first custom zone

- Clone `/home/cat/repos/smt/comp_hack/datastore/zones/zone-90102.xml`.
- It is global, empty, and enterable with `@zone 90102`.
- A new Zone/DynamicMap ID must already exist in loaded `ZoneData` /
  DynamicMap assets. Arbitrary new numbers in ServerZone XML alone will be
  skipped.
- Non-global dungeons need a `ServerZoneInstance` and `@instance ID`.

Useful GM commands:

- `@zone ID [DynamicMapID] [X Y]`
- `@instance INSTANCE_ID [VARIANT_ID]`
- `@item ID COUNT` — also exercises inventory add/compress paths

## Currency compression

- Enable under world shared config:

```xml
<member name="WorldSharedConfig">
  <object>
    <member name="AutoCompressCurrency">true</member>
  </object>
</member>
```

- Current hard-coded pairs:
  - Macca `799` → Macca Note `699` at 50,000
  - Magnetite `800` → Mag Presser `27375` at 50,000
- Ratios are compiled constants (`ITEM_MACCA_NOTE_AMOUNT`,
  `ITEM_MAG_PRESSER_AMOUNT`).
- Compression happens while adding items. Macca notes are broken implicitly
  when paying; Mag Presser has no equivalent decompress path found.
- Generic compressor recipes should live in `WorldSharedConfig`, not
  `constants.xml`.

## Golden Apples

- Item IDs are not present as named constants in this checkout.
- Look them up from client `CItemData` / `ItemData` with `comp_bdpatch`
  once those tools are built.
- Third-party example mapping seen earlier:
  - base `21941`
  - compressed `49386`
  - value `50000`

  Treat those IDs as unverified until confirmed against the local client.

## Item conversion without new C++

- An item can point at a use skill (`MiItemData.possession.useSkill`).
- Skill function `SKILL_RANDOM_ITEM` (`320`) + a one-entry GiftDropSet can
  convert item A → item B when used.
- Useful for decompressors before/without a generic compressor feature.

## Infinite health

- Prefer server-authoritative GM/test mode first.
- Best hook candidate: `ActiveEntityState::SetHPMP()`.
- Combat-only hooks miss status-tick damage.
- Account `user_level` range is 0–1000; chat `@` commands check thresholds
  from `constants.xml`.
- Client XML alone cannot implement invulnerability.

## Tools still needed

Not currently present in `build-current/bin`:

- `comp_bdpatch`
- `comp_verify`
- `comp_translator`

Build them before Phase 2+.
