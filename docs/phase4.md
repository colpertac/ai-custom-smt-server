# Phase 4 Notes

Completed 2026-07-19.

For the complete walkthrough, see
[the custom-demon guide](../guides/binarydata/custom-demon.md).

## What was added

Custom enemy **AI Test Demon**:

| Field | Value |
| --- | --- |
| Demon ID | `900001` |
| Clone of | stock Angel `187` |
| Name | `AI Test Demon` |
| Model | `63` (reuse; no new assets) |
| Fusion | cleared (`fusionOptions=0`, `mitamaFusionID=0`) |

Only table rebuilt:

- `BinaryData/Shield/DevilData.sbin`

Unlike items, demons do not need a separate display table. Name and model live
in `DevilData.basic`.

## Distribution

Phase 1 zone partial spawn `900001` now uses:

```text
EnemyType 900001
```

Package rebuild: `scripts/package-phase1.sh` → `zzz_ai_custom_phase1.zip`

Drops unchanged (Macca Note + AI Test Token).

## Install paths

| Role | Path |
| --- | --- |
| Editable XML (local only) | `client-source/BinaryData/Shield/DevilData.xml` |
| Client overlay output | `client-overlay/BinaryData/Shield/DevilData.sbin` |
| Live server | `/var/lib/comp_hack/datastore/BinaryData/Shield/DevilData.sbin` |
| Stock backup | `/home/cat/backups/ai-custom-smt/shield-2026-07-19/` |
| Disposable client | `/home/cat/software/smt/game/reimagine-phase4-test` |

Loose Shield files override package ZIPs. Do not ship `DevilData` only inside
a datastore package.

## Rebuild / install

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/build-client-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/install-shield-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-phase4-test
/home/cat/repos/smt/ai_custom_smt_server/scripts/package-phase1.sh

/home/cat/repos/smt/comp_hack/scripts/stop.sh
/home/cat/repos/smt/comp_hack/scripts/start.sh
```

Validate:

```bash
/home/cat/repos/smt/comp_hack/build-current/bin/comp_verify server_data 1 ERROR \
  /var/lib/comp_hack/datastore \
  /var/lib/comp_hack/datastore/packages/zzz_ai_custom_phase1.zip
```

## In-game smoke checklist

Use the disposable Phase 4 client (has overlay `DevilData`).

1. `@zone 90102`
2. Confirm the enemy name is **AI Test Demon** (Angel model).
3. Combat and Phase 1 loot still work.
4. Optional: `@demon 900001` (or name) → summon / dismiss / relog.

## Deferred

- `DevilBookData` (compendium)
- Fusion recipes / mitama fusion ID
- Enchant / boost / equipment tables
- New model or icon assets
