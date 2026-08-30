# Phase 2 Notes

Completed 2026-07-18.

For the repeatable workflow, see
[guides/client-binarydata.md](../guides/client-binarydata.md).

## What was proven

Client BinaryData can be extracted to XML, edited, rebuilt, and installed
without touching the live client until you choose to.

| Check | Result |
| --- | --- |
| Identity round-trip (`load` → `save`) | Byte-identical to stock |
| Shield encrypt → decrypt (`CChanceItemData.sbin`) | Byte-identical |
| Edited Sit help text (message ID `1`) | Rebuild differs; reload shows `[AI P2]` |
| Disposable client install | Hardlink clone + overlay; base client untouched |

## Tools (built)

All under `/home/cat/repos/smt/comp_hack/build-current/bin/`:

- `comp_bdpatch` — load / save / flatten BinaryData
- `comp_encrypt` / `comp_decrypt` — Shield encryption for `.sbin`
- `comp_translator` — translation pipeline helper
- `comp_verify` — datastore validation
- `comp_cathedral` — Cathedral of Content UI

## Paths

| Path | Role |
| --- | --- |
| `client-source/BinaryData/Client/*.xml` | Human-editable extracted source (local only) |
| `client-overlay/BinaryData/Client/*.bin` | Distribution output to copy into a client |
| `work/phase2/` | Scratch originals / rebuilds (local only) |
| `/home/cat/software/smt/game/reimagine` | Live client (unchanged by Phase 2) |
| `/home/cat/software/smt/game/reimagine-phase2-test` | Disposable hardlink clone with overlay |

## Sample change

File: `CMessageData_basicCommandHelp.bin` (Client, unencrypted, English)

- Format type for `comp_bdpatch`: `cmessage`
- Edited record: message ID `1` (Sit)
- Marker: `[AI P2]` in the help body

## Rebuild / apply

```bash
/home/cat/repos/smt/ai_custom_smt_server/scripts/build-client-overlay.sh
/home/cat/repos/smt/ai_custom_smt_server/scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-phase2-test
```

## In-game test

1. Launch the disposable client (`reimagine-phase2-test`), not the live tree.
2. Open basic command help for **Sit**.
3. Expect the body to include `[AI P2]`.

Restore: delete the disposable tree, or re-apply stock from a Phase 0 backup.
Do not leave the marker on the live client unless you intend to.

## Commands used (reference)

```bash
BIN=/home/cat/repos/smt/comp_hack/build-current/bin
CLIENT=/home/cat/software/smt/game/reimagine

# Extract
"$BIN"/comp_bdpatch load cmessage \
  "$CLIENT/BinaryData/Client/CMessageData_basicCommandHelp.bin" \
  /tmp/help.xml

# Flatten (TSV for scanning)
"$BIN"/comp_bdpatch flatten cmessage \
  "$CLIENT/BinaryData/Client/CMessageData_basicCommandHelp.bin" \
  /tmp/help.tsv

# Rebuild
"$BIN"/comp_bdpatch save cmessage /tmp/help.xml /tmp/help.bin

# Shield round-trip (encrypted tables)
"$BIN"/comp_decrypt "$CLIENT/BinaryData/Shield/CChanceItemData.sbin" /tmp/plain.bin
"$BIN"/comp_encrypt /tmp/plain.bin /tmp/round.sbin
```

## Notes

- Client `CMessageData_*.bin` under `BinaryData/Client/` is typically
  unencrypted. Many `BinaryData/Shield/*.sbin` tables need decrypt/encrypt.
- Loose overlay files replace matching paths in the client tree; there is no
  package mount for client BinaryData like server datastore ZIPs.
- `client-source/` and `client-overlay/BinaryData/` stay gitignored
  (proprietary). Scripts and docs are tracked.
