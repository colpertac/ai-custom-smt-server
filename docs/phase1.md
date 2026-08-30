# Phase 1 Notes

Completed 2026-07-18.

For a step-by-step explanation of every XML object and the package workflow,
see [the custom-zone guide](../guides/custom-zone.md). Additional member
references are indexed under [guides/syntax](../guides/syntax/README.md).

## What was added

A removable datastore package that auto-applies one enemy encounter onto the
empty global test map `90102`:

- Package: `zzz_ai_custom_phase1.zip`
- Zone partial ID: `900001`
- Drop set ID: `900001`
- Enemy: existing demon type `187`, level 5
- Drop: guaranteed Macca Note (`699`); Phase 3 also adds AI Test Token (`900001`)

Source of truth:

- `server-content/zones/zone-90102.stock.xml` — untouched stock clone
- `server-content/zones/zone-90102.xml` — authored merged view
- `server-content/zones/partial/ai_custom_phase1.xml` — live package content
- `server-content/data/dropset/ai_custom_phase1.xml` — live package content

## Why a partial?

Loose datastore files beat package ZIPs. Replacing `zones/zone-90102.xml` only
inside a ZIP would never load while the stock file remains. A
`ServerZonePartial` with `AutoApply=true` merges into the stock zone and
disappears when the ZIP is removed.

## Install / remove

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/package-phase1.sh

# restart servers
/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh

# remove
rm /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh
```

## Validation performed

- Built `comp_verify`
- `comp_verify` does **not** auto-mount `packages/*.zip`; pass the ZIP as an
  extra search path:

```bash
build-current/bin/comp_verify server_data 1 WARNING \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

- With the ZIP mounted, verify loaded:
  - `/data/dropset/ai_custom_phase1.xml`
  - `/zones/partial/ai_custom_phase1.xml`
- Channel startup DEBUG confirmed:

```text
Adding archive: .../packages/zzz_ai_custom_phase1.zip
Loaded XML file: /data/dropset/ai_custom_phase1.xml
Loaded XML file: /zones/partial/ai_custom_phase1.xml
```

## In-game smoke test

With GM chat access:

```text
@zone 90102
```

Expect one low-level enemy near the start. Killing it should drop a Macca Note.
Respawn timer is 15 seconds.
