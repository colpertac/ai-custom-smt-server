# Client BinaryData round-trip

Extract a client table to XML, edit it, rebuild a `.bin` / `.sbin`, and install
it through `client-overlay/`.

## Layout

```text
ai_custom_smt_server/
├── client-source/BinaryData/...   # editable XML (gitignored)
├── client-overlay/BinaryData/...  # rebuilt bins to ship (gitignored)
└── scripts/
    ├── build-client-overlay.sh
    └── apply-client-overlay.sh
```

`client-overlay/` is the only client distribution output. Do not hand-edit
`.bin` / `.sbin` files there; rebuild from `client-source/`.

## Tools

```bash
BIN=/home/cat/repos/smt/comp_hack/build-current/bin
```

| Tool | Role |
| --- | --- |
| `comp_bdpatch load TYPE IN OUT` | `.bin`/`.sbin` → XML |
| `comp_bdpatch save TYPE IN OUT` | XML → `.bin`/`.sbin` |
| `comp_bdpatch flatten TYPE IN OUT` | table → TSV for scanning |
| `comp_decrypt IN OUT` | decrypt Shield `.sbin` |
| `comp_encrypt IN OUT` | encrypt for Shield `.sbin` |

`TYPE` must match the table (for example `cmessage` for `CMessageData`).
Run `comp_bdpatch` with no args for the full type list.

## Unencrypted Client example (Phase 2)

English basic-command help:

```bash
CLIENT=/home/cat/software/smt/game/reimagine
SRC=ai_custom_smt_server/client-source/BinaryData/Client
OUT=ai_custom_smt_server/client-overlay/BinaryData/Client

"$BIN"/comp_bdpatch load cmessage \
  "$CLIENT/BinaryData/Client/CMessageData_basicCommandHelp.bin" \
  "$SRC/CMessageData_basicCommandHelp.xml"

# edit message ID 1 (Sit) in the XML, then:
"$BIN"/comp_bdpatch save cmessage \
  "$SRC/CMessageData_basicCommandHelp.xml" \
  "$OUT/CMessageData_basicCommandHelp.bin"
```

Or use the scripts:

```bash
./scripts/build-client-overlay.sh
./scripts/apply-client-overlay.sh /path/to/client
```

## Encrypted Shield tables

```bash
"$BIN"/comp_decrypt path/to/Foo.sbin /tmp/Foo.plain.bin
"$BIN"/comp_bdpatch load <type> /tmp/Foo.plain.bin /tmp/Foo.xml
# edit XML...
"$BIN"/comp_bdpatch save <type> /tmp/Foo.xml /tmp/Foo.plain.bin
"$BIN"/comp_encrypt /tmp/Foo.plain.bin path/to/overlay/Foo.sbin
```

Identity round-trips should be byte-identical before you trust edits.

## Safe testing

Prefer a disposable client copy (hardlink clone is fine):

```bash
cp -al /home/cat/software/smt/game/reimagine \
       /home/cat/software/smt/game/reimagine-phase2-test
# break the hardlink for files you will replace, then apply overlay
rm -f .../BinaryData/Client/CMessageData_basicCommandHelp.bin
./scripts/apply-client-overlay.sh \
  /home/cat/software/smt/game/reimagine-phase2-test
```

`apply-client-overlay.sh` overwrites matching paths; it does not restore stock
files. Keep Phase 0 backups for the live client.

## What Phase 2 changed in-game

Sit command help (message ID `1`) includes `[AI P2]` in the disposable client
only. Live `reimagine` was left stock.
