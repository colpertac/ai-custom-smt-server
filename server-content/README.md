# Server Content (Phase 1+)

Human-authored COMP_hack datastore content for this project.

## Phase 1 package

Contents installed by `../scripts/package-phase1.sh`:

| Path in ZIP | Purpose |
|---|---|
| `zones/partial/ai_custom_phase1.xml` | Auto-applies a level-5 enemy onto DynamicMap `90102` |
| `data/dropset/ai_custom_phase1.xml` | Guaranteed Macca Note (`699`) drop |

Test in-game:

```text
@zone 90102
```

Kill the nearby enemy. It should drop a Macca Note.

Remove the feature by deleting:

```text
/var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

then restart the channel server. Stock `zone-90102.xml` stays empty.

## Phase 5 package

Contents installed by `../scripts/package-phase5.sh`:

| Path in ZIP | Purpose |
|---|---|
| `zones/partial/ai_custom_phase5.xml` | AI Test Demon on DynamicMap `5201001` (Home III Service Entrance) |
| `data/zoneinstance/ai_custom_phase5.xml` | Instance def `900001` (clone of stock 5201) |
| `data/zoneinstancevariant/ai_custom_phase5.xml` | NORMAL variant `900001` |

Requires zoneinstance directory split and Shield `DevilData` overlay. Test:
`@instance 900001`. Phase 1 `@zone 90102` is unaffected.

## Why a partial instead of replacing the zone file?

Loose datastore files beat package ZIPs. Replacing `zones/zone-90102.xml` only
in a package would never load while the stock file still exists. A
`ServerZonePartial` with `AutoApply=true` merges into the stock zone and is
fully removable with the ZIP.
