# Creating a Custom Dungeon on an Existing Map

This walkthrough covers Phase 5: a private instance cloned from stock
**Home III Service Entrance** (`5201`), with an AI Test Demon, entered by GM
`@instance`.

See also:

- [Phase 5 notes](../docs/phase5.md)
- [Custom encounter on an existing zone](custom-zone.md) (Phase 1 global test)
- [ServerZone syntax](syntax/server-zone.md)

## Result

```text
@instance 900001
  └─ Instance 900001 (clone of stock 5201 shape)
       └─ Zone 520101 / DynamicMap 5201001  (Home III Service Entrance)
            └─ Partial 900002 adds AI Test Demon + defeat → lobby 20102

@zone 90102
  └─ Phase 1 global Home II (unchanged)
```

## Why this map?

Stock instance **5201** is a real private dungeon (return device, boss door,
defeat events). Client ZoneData names it **Home III Service Entrance** — not
Suginami Tunnels. Real Suginami is instance **5401+** (lobby `30102`).

Home II (`90102`) is a tutorial hub — poor fit for a dungeon POC.

We reuse zone `520101` / DynamicMap `5201001` from stock (no new client map
row). A **ServerZonePartial** adds custom spawns; a **ServerZoneInstance**
creates a private copy at runtime.

## Prerequisite: zoneinstance directories

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/migrate-zoneinstance-dirs.sh
```

Packages add `data/zoneinstance/*.xml` without replacing stock definitions.

## Project files

```text
server-content/
├── data/zoneinstance/ai_custom_phase5.xml
├── data/zoneinstancevariant/ai_custom_phase5.xml
├── packages/zzz_ai_custom_phase5.zip
└── zones/partial/ai_custom_phase5.xml
```

## Instance definition (clone of 5201)

```xml
<object name="ServerZoneInstance">
    <member name="ID">900001</member>
    <member name="GroupID">2</member>
    <member name="LobbyID">20102</member>
    <member name="ZoneIDs"><element>520101</element></member>
    <member name="DynamicMapIDs"><element>5201001</element></member>
    <member name="ToLobbyEventID">L520X</member>
</object>
```

Enter: `@instance 900001` or `@instance 900001 900001` (NORMAL variant).

Compare with stock: `@instance 5201` (same map family).

## Partial (custom encounter)

Partial ID **900002** auto-applies to DynamicMap **5201001**. It adds spawn
group **900001** (AI Test Demon) with `DefeatActions` → `ActionZoneChange` to
lobby zone `20102` spot `50001` (same exit target as stock `D52X_LEAVE`).

Because the partial is keyed on DynamicMap, it also merges into `@instance 5201`
while the package is installed.

## Package and verify

```bash
scripts/package-phase5.sh
comp_verify server_data 1 ERROR /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase5.zip
```

Phase 1 still supplies DropSet `900001`. Remove Phase 5 alone:

```text
rm /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase5.zip
```

then restart the channel.

## Client overlay

Custom demon **name** requires Shield `DevilData` on client and server (Phases
3–4). No DynamicMap edit is needed for this Suginami-based dungeon.

```bash
scripts/apply-client-overlay.sh /path/to/reimagine-phase5-test
```
