# Phase 3 Notes

Completed 2026-07-18.

## What was added

Inert stackable custom item **AI Test Token**:

| Field | Value |
| --- | --- |
| Item ID | `900001` |
| Clone of | stock item `501` |
| Icon / model | `501` / `0` (reuse; no new art) |
| Stack size | `100` |
| Flags | `63` (trade, bazaar, sell, discard, store) |
| Use skill | `0` (inert) |

Synchronized tables (full rebuilds, not single-record files):

- `BinaryData/Shield/ItemData.sbin`
- `BinaryData/Shield/CItemData.sbin`

Display name/description live in `CItemData`. Mechanical rules live in
`ItemData`. Match key:

```text
ItemData.common.id == CItemData.baseData.ID == 900001
```

## Distribution

Phase 1 drop set `900001` now drops both:

1. Macca Note (`699`) — regression signal
2. AI Test Token (`900001`)

Package rebuild: `scripts/package-phase1.sh` → `zzz_ai_custom_phase1.zip`

## Install paths

| Role | Path |
| --- | --- |
| Editable XML (local only) | `client-source/BinaryData/Shield/{ItemData,CItemData}.xml` |
| Client overlay output | `client-overlay/BinaryData/Shield/{ItemData,CItemData}.sbin` |
| Live server | `/var/lib/comp_hack/datastore/BinaryData/Shield/` |
| Stock backup | `/home/cat/backups/ai-custom-smt/phase3-shield-2026-07-18/` |
| Disposable client | `/home/cat/software/smt/game/reimagine-phase3-test` |

Loose Shield files override package ZIPs. Do not ship these tables only inside
a datastore package.

## Rebuild / install

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/build-client-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/install-phase3-shield.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-phase3-test
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

Use the disposable Phase 3 client (has overlay Shield tables). Live
`reimagine` stock BinaryData will show a missing/wrong name for `900001`.

1. Log in, create/enter a character with starting skills.
2. `@zone 90102` and defeat the Phase 1 enemy.
3. Confirm loot includes Macca Note **and** AI Test Token.
4. Optional GM grant: `@item 900001` (if available) / stack up to 100.
5. Check inventory name `AI Test Token`, icon from plate `501`.
6. Move to storage, trade/sell/discard as allowed by flags, relog, delete.

## Notes

- Local scan: `900001` free in both ItemData and CItemData (16581 stock →
  16582 with custom).
- Stock `21941` is already Magical Golden Apple; do not reuse for custom work.
- `SItemData` omitted (no tokusei). Shop path deferred (needs
  `ShopProductData`).
